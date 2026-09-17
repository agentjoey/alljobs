import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { renderCodexPreview } from "../adapters/codex";
import { digestCanonicalJson } from "../analysis/digest";
import { testCapabilityPackage } from "../packages/fixtures";
import type { CapabilityPackage, DeploymentPlan } from "../packages/types";
import type { RegistryExportStore } from "../registry/contracts";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "../registry/migrate";
import { PostgresExportStore } from "../registry/postgres/exports";
import { validateTargetRoot, writeTargetSentinel, type ValidatedTargetRoot } from "../projection/paths";
import { derivePlanRecordId } from "./plan";
import { publishToTarget, type PublishInput } from "./publisher";

const NOW = "2026-09-16T09:00:00.000Z";
const ALIAS = "codex-fixture";
const DIGEST = "a".repeat(64);

let fixture: CaphubTestPostgres;
let counter = 1;
const created: string[] = [];

function nextSeed(): number {
  return counter++;
}

async function freshTarget(): Promise<ValidatedTargetRoot> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "caphub-accfix-")));
  created.push(root);
  await writeTargetSentinel(root, ALIAS);
  return validateTargetRoot({ root, alias: ALIAS });
}

function hexId(prefix: string, seed: number, length = 32): string {
  return `${prefix}${seed.toString(16).repeat(length).slice(0, length)}`;
}

function adapterPackage(seed: number): CapabilityPackage {
  return testCapabilityPackage({
    release_id: hexId("rel_", seed),
    package_id: hexId("pkg_", seed + 1),
    slug: `acc-tool-${seed.toString(16)}`,
    version: `1.0.${seed}`,
    dependencies: []
  });
}

function planFor(pkg: CapabilityPackage, preimageDigest = DIGEST): DeploymentPlan {
  const rendered = renderCodexPreview(pkg);
  if (!rendered.ok) throw new Error("adapter fixture failed");
  return {
    schema_version: 1,
    action: "publish",
    target: "codex",
    target_alias: ALIAS,
    release: { record_id: pkg.release_id, version: 1, digest: pkg.digest },
    adapter: { name: "codex", version: "1.0.0", digest: rendered.result.source_digest },
    preview_manifest_digest: rendered.result.output_manifest_digest,
    preview_diff_digest: DIGEST,
    expected_current_pointer: null,
    target_preimage_digest: preimageDigest,
    created_at: NOW
  };
}

function nullPointerPreimage(): string {
  return digestCanonicalJson({ schema_version: 1, pointer: null, files: [] });
}

async function insertRecordAndVersion(recordId: string, kind: string, payload: unknown, digest: string): Promise<void> {
  const client = await fixture.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO caphub.registry_records (record_id, kind, current_version, created_at, updated_at) VALUES ($1,$2,1,$3,$3)",
      [recordId, kind, NOW]
    );
    await client.query(
      `INSERT INTO caphub.registry_versions (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
       VALUES ($1,1,$2,1,$3::jsonb,$4,NULL,$5)`,
      [recordId, kind, JSON.stringify(payload), digest, NOW]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedApprovedPlan(seed: number, plan: DeploymentPlan): Promise<string> {
  const planId = derivePlanRecordId(plan);
  const planDigest = digestCanonicalJson(plan);
  const existing = await fixture.pool.query("SELECT 1 FROM caphub.registry_records WHERE record_id=$1", [plan.release.record_id]);
  if (existing.rows.length === 0) {
    await insertRecordAndVersion(plan.release.record_id, "release", {}, plan.release.digest);
  }
  await insertRecordAndVersion(planId, "deployment_plan", plan, planDigest);
  const requestId = hexId("rev_", seed + 3000);
  const decisionId = hexId("dec_", seed + 4000);
  const shortId = planId.slice(4, 12);
  await fixture.pool.query(
    `INSERT INTO caphub.review_requests
      (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
       lock_version, state, approve_confirmation, reject_confirmation, superseded_by_request_id, created_at, updated_at)
     VALUES ($1,'deployment','deployment_plan',$2,1,$3,2,'APPROVED',$4,$5,NULL,$6,$6)`,
    [requestId, planId, planDigest, `APPROVE DEPLOYMENT ${shortId}`, `REJECT DEPLOYMENT ${shortId}`, NOW]
  );
  await fixture.pool.query(
    `INSERT INTO caphub.review_decisions
      (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
       action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
       subject_digest, actor, confirmation_digest, original_approval_decision_id, revokes_decision_id, recorded_at)
     VALUES ($1,$2,$3,1,$4,'approve',$5,'',$6,'deployment',$7,1,$4,'human:owner',$4,NULL,NULL,$8)`,
    [decisionId, requestId, `intent-accfix-${seed}`, planDigest, `APPROVE DEPLOYMENT ${shortId}`, null, planId, NOW]
  );
  return decisionId;
}

function makeInput(pkg: CapabilityPackage, plan: DeploymentPlan, decisionId: string, deploymentId: string, target: ValidatedTargetRoot): PublishInput {
  const rendered = renderCodexPreview(pkg);
  if (!rendered.ok) throw new Error("adapter fixture failed");
  return {
    root: target,
    plan,
    files: rendered.result.files,
    exports: new PostgresExportStore(fixture.appPool),
    deploymentRecordId: deploymentId,
    planApprovalDecisionId: decisionId,
    assertAuthority: async () => undefined,
    clock: () => NOW
  };
}

function forgePointer(deploymentId: string, plan: DeploymentPlan) {
  const base = {
    deployment_id: deploymentId,
    release_id: plan.release.record_id,
    release_version: plan.release.version,
    release_digest: plan.release.digest
  };
  return {
    ...base,
    pointer_digest: createHash("sha256").update(digestCanonicalJson({ schema_version: 1, pointer: base }), "utf8").digest("hex")
  };
}

beforeAll(async () => {
  fixture = await startCaphubTestPostgres();
  await applyRegistryMigrations(fixture.pool);
}, 30_000);

afterAll(async () => {
  for (const root of created) {
    await rm(root, { recursive: true, force: true });
  }
  await fixture?.stop();
}, 30_000);

describe.sequential("Codex acceptance fixes 1-3 (publisher fail-closed)", () => {
  it("fails closed on a forged current.json: authority runs, realize never runs, nothing is written", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const deploymentId = hexId("dep_", seed + 5000);
    const input = makeInput(pkg, plan, decisionId, deploymentId, target);
    const authority = vi.fn(async () => undefined);
    input.assertAuthority = authority;
    const realize = vi.fn(async () => "created" as const);
    input.exports = {
      composeRelease: async () => "created",
      finalizeRelease: async () => "finalized",
      composeDeploymentPlan: async () => "created",
      realizeDeployment: realize
    } satisfies RegistryExportStore;

    await writeFile(join(target.root, "current.json"), `${JSON.stringify(forgePointer(deploymentId, plan), null, 2)}\n`, "utf8");

    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
    expect(authority).toHaveBeenCalledTimes(1);
    expect(realize).not.toHaveBeenCalled();
    await expect(readFile(join(target.root, "operations", `${deploymentId}.json`), "utf8")).rejects.toThrow();
    await expect(readFile(join(target.root, "versions", plan.release.record_id, "1", plan.preview_manifest_digest, ".caphub-version.json"), "utf8")).rejects.toThrow();
  });

  it("fails closed deterministically when the mandatory authority checker is omitted", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const input = makeInput(pkg, plan, decisionId, hexId("dep_", seed + 5000), target);
    (input as { assertAuthority?: unknown }).assertAuthority = undefined;
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "DEPLOYMENT_NOT_APPROVED" });
  });

  it("rejects idempotent replay when durable version bytes changed under an unchanged pointer", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const input = makeInput(pkg, plan, decisionId, hexId("dep_", seed + 5000), target);
    const first = await publishToTarget(input);
    const versionDir = join(target.root, "versions", plan.release.record_id, "1", plan.preview_manifest_digest);
    const skillPath = join(versionDir, "$CODEX_HOME", "skills", pkg.slug, "SKILL.md");
    await writeFile(skillPath, "# tampered\n", "utf8");
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "PACKAGE_DIGEST_CONFLICT" });
    expect((await readFile(join(target.root, "current.json"), "utf8"))).toContain(first.pointer.deployment_id);
  });

  it("rejects unexpected managed files inside a completed version directory", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const input = makeInput(pkg, plan, decisionId, hexId("dep_", seed + 5000), target);
    await publishToTarget(input);
    const versionDir = join(target.root, "versions", plan.release.record_id, "1", plan.preview_manifest_digest);
    await writeFile(join(versionDir, "unexpected.md"), "surprise\n", "utf8");
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "PACKAGE_DIGEST_CONFLICT" });
  });

  it("rejects marker-only version directories with missing declared content", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const versionDir = join(target.root, "versions", plan.release.record_id, "1", plan.preview_manifest_digest);
    await mkdir(versionDir, { recursive: true, mode: 0o700 });
    await writeFile(join(versionDir, ".caphub-version.json"), `${JSON.stringify({
      schema_version: 1, action: "publish", release: plan.release,
      manifest_digest: plan.preview_manifest_digest,
      files: [{ path: "$CODEX_HOME/skills/x/SKILL.md", sha256: DIGEST, bytes: 1 }]
    })}\n`, "utf8");
    const input = makeInput(pkg, plan, decisionId, hexId("dep_", seed + 5000), target);
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "PACKAGE_DIGEST_CONFLICT" });
  });

  it("rejects symlink substitution inside the version directory", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const input = makeInput(pkg, plan, decisionId, hexId("dep_", seed + 5000), target);
    await publishToTarget(input);
    const versionDir = join(target.root, "versions", plan.release.record_id, "1", plan.preview_manifest_digest);
    const skillPath = join(versionDir, "$CODEX_HOME", "skills", pkg.slug, "SKILL.md");
    await rm(skillPath);
    await symlink("/private/tmp", skillPath);
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: expect.stringMatching(/UNSAFE_TARGET_ROOT|PACKAGE_DIGEST_CONFLICT/) });
  });

  it("fails before any write when the reproduced target preimage no longer matches the plan", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    // The plan binds a preimage describing content that does not exist on the target.
    const stalePreimage = digestCanonicalJson({
      schema_version: 1,
      pointer: null,
      files: [{ path: "$CODEX_HOME/skills/ghost/SKILL.md", sha256: DIGEST, bytes: 2 }]
    });
    const plan = planFor(pkg, stalePreimage);
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const input = makeInput(pkg, plan, decisionId, hexId("dep_", seed + 5000), target);
    const realize = vi.fn(async () => "created" as const);
    input.exports = {
      composeRelease: async () => "created",
      finalizeRelease: async () => "finalized",
      composeDeploymentPlan: async () => "created",
      realizeDeployment: realize
    } satisfies RegistryExportStore;
    const authority = vi.fn(async () => undefined);
    input.assertAuthority = authority;
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
    expect(authority).toHaveBeenCalled();
    expect(realize).not.toHaveBeenCalled();
    await expect(readFile(join(target.root, "current.json"), "utf8")).rejects.toThrow();
    await expect(readFile(join(target.root, "versions", plan.release.record_id, "1", plan.preview_manifest_digest, ".caphub-version.json"), "utf8")).rejects.toThrow();
  });
});

describe.sequential("Codex acceptance fix 4 (recovery lock lease)", () => {
  const LOCK_DIR = ".caphub-deployment.lock";

  async function writeLease(target: ValidatedTargetRoot, operationId: string, pid: number, acquiredAt: string): Promise<void> {
    await mkdir(join(target.root, LOCK_DIR), { recursive: true });
    await writeFile(join(target.root, LOCK_DIR, "owner.json"), JSON.stringify({
      schema_version: 1, operation_id: operationId, pid, acquired_at: acquiredAt
    }));
  }

  it("refuses recovery while a live lock is held and preserves the lock untouched", async () => {
    const seed = nextSeed() + 3000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const deploymentId = hexId("dep_", seed + 5000);
    await writeLease(target, deploymentId, 424242, "2026-09-17T00:00:00.000Z");
    const input = makeInput(pkg, plan, decisionId, deploymentId, target);
    input.lock = { isProcessAlive: () => true, staleMs: 0, now: () => Date.parse("2026-09-17T00:00:10.000Z") };
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "PUBLISH_RECOVERY_REQUIRED" });
    const owner = JSON.parse(await readFile(join(target.root, LOCK_DIR, "owner.json"), "utf8"));
    expect(owner.pid).toBe(424242);
    await expect(readFile(join(target.root, "current.json"), "utf8")).rejects.toThrow();
  });

  it("takes over only a proven-stale lock for the interrupted operation", async () => {
    const seed = nextSeed() + 3000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const deploymentId = hexId("dep_", seed + 5000);
    await writeLease(target, deploymentId, 999999, "2026-09-16T23:00:00.000Z");
    const input = makeInput(pkg, plan, decisionId, deploymentId, target);
    input.lock = { isProcessAlive: () => false, staleMs: 0, now: () => Date.parse("2026-09-17T00:00:10.000Z") };
    const { pointer } = await publishToTarget(input);
    expect(pointer.deployment_id).toBe(deploymentId);
    // The stale lease was taken over and released cleanly on success.
    await expect(readFile(join(target.root, LOCK_DIR, "owner.json"), "utf8")).rejects.toThrow();
    const completed = JSON.parse(await readFile(join(target.root, "operations", `${deploymentId}.json`), "utf8"));
    expect(completed.stage).toBe("completed");
  });
});
