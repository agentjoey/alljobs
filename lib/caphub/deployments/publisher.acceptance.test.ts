import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
    expect(authority).toHaveBeenCalledTimes(2);
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

  it("rejects a forged marker that rewrites its file manifest while claiming the approved digest", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const input = makeInput(pkg, plan, decisionId, hexId("dep_", seed + 5000), target);
    await publishToTarget(input);

    const versionDir = join(target.root, "versions", plan.release.record_id, "1", plan.preview_manifest_digest);
    const markerPath = join(versionDir, ".caphub-version.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8")) as {
      manifest_digest: string;
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };
    const rewritten = "malicious replacement accepted by a forged marker\n";
    const chosen = marker.files[0]!;
    await writeFile(join(versionDir, chosen.path), rewritten, "utf8");
    chosen.bytes = Buffer.byteLength(rewritten, "utf8");
    chosen.sha256 = createHash("sha256").update(rewritten, "utf8").digest("hex");
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, "utf8");

    const actualManifestDigest = digestCanonicalJson({
      schema_version: 1,
      files: marker.files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))
    });
    expect(marker.manifest_digest).toBe(plan.preview_manifest_digest);
    expect(actualManifestDigest).not.toBe(plan.preview_manifest_digest);
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "PACKAGE_DIGEST_CONFLICT" });
  });

  it("rejects a completed replay whose operation and marker jointly select an unapproved manifest", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const deploymentId = hexId("dep_", seed + 5000);
    const input = makeInput(pkg, plan, decisionId, deploymentId, target);
    const first = await publishToTarget(input);

    const forgedContent = "# attacker-selected manifest\n";
    const forgedFile = {
      path: `$CODEX_HOME/skills/${pkg.slug}/SKILL.md`,
      sha256: createHash("sha256").update(forgedContent, "utf8").digest("hex"),
      bytes: Buffer.byteLength(forgedContent, "utf8")
    };
    const forgedManifestDigest = digestCanonicalJson({ schema_version: 1, files: [forgedFile] });
    const forgedDir = join(target.root, "versions", plan.release.record_id, "1", forgedManifestDigest);
    await mkdir(join(forgedDir, "$CODEX_HOME", "skills", pkg.slug), { recursive: true, mode: 0o700 });
    await writeFile(join(forgedDir, forgedFile.path), forgedContent, "utf8");
    await writeFile(join(forgedDir, ".caphub-version.json"), `${JSON.stringify({
      schema_version: 1,
      action: "publish",
      release: plan.release,
      manifest_digest: forgedManifestDigest,
      files: [forgedFile]
    }, null, 2)}\n`, "utf8");
    const operationPath = join(target.root, "operations", `${deploymentId}.json`);
    const forgedOperation = JSON.parse(await readFile(operationPath, "utf8"));
    forgedOperation.manifest_digest = forgedManifestDigest;
    await writeFile(operationPath, `${JSON.stringify(forgedOperation, null, 2)}\n`, "utf8");

    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
    expect(JSON.parse(await readFile(join(target.root, "current.json"), "utf8"))).toEqual(first.pointer);
  });

  it("checks authority before attempting to acquire the filesystem lease", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const deploymentId = hexId("dep_", seed + 5000);
    const input = makeInput(pkg, plan, decisionId, deploymentId, target);
    (input as { assertAuthority?: unknown }).assertAuthority = undefined;
    const lockDir = join(target.root, ".caphub-deployment.lock");
    await mkdir(lockDir, { mode: 0o700 });
    const owner = { schema_version: 1, operation_id: deploymentId, pid: process.pid, acquired_at: NOW };
    await writeFile(join(lockDir, "owner.json"), `${JSON.stringify(owner)}\n`, "utf8");
    input.lock = { isProcessAlive: () => true, staleMs: 0, now: () => Date.parse(NOW) + 1_000 };

    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "DEPLOYMENT_NOT_APPROVED" });
    expect(JSON.parse(await readFile(join(lockDir, "owner.json"), "utf8"))).toEqual(owner);
  });

  it("revalidates the target sentinel before any apply-time side effect", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const deploymentId = hexId("dep_", seed + 5000);
    const input = makeInput(pkg, plan, decisionId, deploymentId, target);
    const realize = vi.fn(async () => "created" as const);
    input.exports = {
      composeRelease: async () => "created",
      finalizeRelease: async () => "finalized",
      composeDeploymentPlan: async () => "created",
      realizeDeployment: realize
    } satisfies RegistryExportStore;
    await writeFile(target.sentinelPath, `${JSON.stringify({ schema_version: 1, caphub: true, alias: "wrong-alias" })}\n`, "utf8");

    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });
    expect(realize).not.toHaveBeenCalled();
    await expect(readFile(join(target.root, "operations", `${deploymentId}.json`), "utf8")).rejects.toThrow();
    await expect(readFile(join(target.root, "current.json"), "utf8")).rejects.toThrow();
  });

  it("rejects an unexpected symlink in a marker-less version directory", async () => {
    const seed = nextSeed() + 2000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const deploymentId = hexId("dep_", seed + 5000);
    const input = makeInput(pkg, plan, decisionId, deploymentId, target);
    const realize = vi.fn(async () => "created" as const);
    input.exports = {
      composeRelease: async () => "created",
      finalizeRelease: async () => "finalized",
      composeDeploymentPlan: async () => "created",
      realizeDeployment: realize
    } satisfies RegistryExportStore;
    const versionDir = join(target.root, "versions", plan.release.record_id, "1", plan.preview_manifest_digest);
    await mkdir(versionDir, { recursive: true, mode: 0o700 });
    await symlink("/private/tmp", join(versionDir, "unexpected-link"));

    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });
    expect(realize).not.toHaveBeenCalled();
    await expect(readFile(join(target.root, "current.json"), "utf8")).rejects.toThrow();
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

describe.sequential("Codex acceptance review regressions", () => {
  it("rejects a forged pointer paired with a stage-versioned operation (no realize, no writes)", async () => {
    const seed = nextSeed() + 4000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const deploymentId = hexId("dep_", seed + 5000);
    const input = makeInput(pkg, plan, decisionId, deploymentId, target);
    const realize = vi.fn(async () => "created" as const);
    input.exports = {
      composeRelease: async () => "created",
      finalizeRelease: async () => "finalized",
      composeDeploymentPlan: async () => "created",
      realizeDeployment: realize
    } satisfies RegistryExportStore;
    const { writeOperation } = await import("./recovery");
    await writeOperation(target.root, {
      schema_version: 1,
      deployment_id: deploymentId,
      plan_digest: digestCanonicalJson(plan),
      action: "publish",
      stage: "versioned",
      release: plan.release,
      manifest_digest: plan.preview_manifest_digest,
      created_at: NOW
    });
    await writeFile(join(target.root, "current.json"), `${JSON.stringify(forgePointer(deploymentId, plan), null, 2)}\n`, "utf8");
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
    expect(realize).not.toHaveBeenCalled();
    const operation = JSON.parse(await readFile(join(target.root, "operations", `${deploymentId}.json`), "utf8"));
    expect(operation.stage).toBe("versioned");
  });

  it("revalidates the target sentinel under lock before completing a realized recovery", async () => {
    const seed = nextSeed() + 4000;
    const pkg = adapterPackage(seed);
    const plan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const deploymentId = hexId("dep_", seed + 5000);
    const input = makeInput(pkg, plan, decisionId, deploymentId, target);
    await publishToTarget(input);

    const operationPath = join(target.root, "operations", `${deploymentId}.json`);
    const operation = JSON.parse(await readFile(operationPath, "utf8"));
    operation.stage = "realized";
    await writeFile(operationPath, `${JSON.stringify(operation, null, 2)}\n`, "utf8");
    input.lock = {
      now: () => {
        writeFileSync(target.sentinelPath, `${JSON.stringify({ schema_version: 1, caphub: true, alias: "changed-during-lease" })}\n`, "utf8");
        return Date.parse(NOW);
      }
    };

    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });
    expect(JSON.parse(await readFile(operationPath, "utf8")).stage).toBe("realized");
  });

  it("replays a completed rollback idempotently from its publish-created version directory", async () => {
    const seed = nextSeed() + 4000;
    const pkg = adapterPackage(seed);
    const publishPlan = planFor(pkg, nullPointerPreimage());
    const decisionId = await seedApprovedPlan(seed, publishPlan);
    const target = await freshTarget();
    const deploymentId = hexId("dep_", seed + 5000);
    const publishInput = makeInput(pkg, publishPlan, decisionId, deploymentId, target);
    const v1 = await publishToTarget(publishInput);

    const marker = JSON.parse(await readFile(join(target.root, "versions", publishPlan.release.record_id, "1", publishPlan.preview_manifest_digest, ".caphub-version.json"), "utf8"));
    const preimage = digestCanonicalJson({
      schema_version: 1,
      pointer: v1.pointer,
      files: marker.files.map((f: { path: string; sha256: string; bytes: number }) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes }))
    });
    const rollbackPlan: DeploymentPlan = {
      ...publishPlan,
      action: "rollback",
      expected_current_pointer: v1.pointer,
      target_preimage_digest: preimage,
      created_at: NOW
    };
    const rollbackDecisionId = await seedApprovedPlan(seed + 1, rollbackPlan);
    const rollbackInput = makeInput(pkg, rollbackPlan, rollbackDecisionId, hexId("dep_", seed + 5001), target);
    const rolledBack = await publishToTarget(rollbackInput);
    expect(rolledBack.pointer.release_id).toBe(publishPlan.release.record_id);
    const replay = await publishToTarget(rollbackInput);
    expect(replay.pointer).toEqual(rolledBack.pointer);
  });

  it("rejects rollback when the approved historical version bytes were tampered", async () => {
    const seed = nextSeed() + 5000;
    const originalPackage = adapterPackage(seed);
    const originalPlan = planFor(originalPackage, nullPointerPreimage());
    const originalDecisionId = await seedApprovedPlan(seed, originalPlan);
    const target = await freshTarget();
    const originalInput = makeInput(
      originalPackage,
      originalPlan,
      originalDecisionId,
      hexId("dep_", seed + 5000),
      target
    );
    const original = await publishToTarget(originalInput);
    const originalMarker = JSON.parse(await readFile(
      join(target.root, "versions", originalPlan.release.record_id, "1", originalPlan.preview_manifest_digest, ".caphub-version.json"),
      "utf8"
    )) as { files: Array<{ path: string; sha256: string; bytes: number }> };
    const originalPreimage = digestCanonicalJson({
      schema_version: 1,
      pointer: original.pointer,
      files: originalMarker.files
    });

    const replacementPackage = adapterPackage(seed + 1);
    const replacementPlan: DeploymentPlan = {
      ...planFor(replacementPackage, originalPreimage),
      expected_current_pointer: original.pointer
    };
    const replacementDecisionId = await seedApprovedPlan(seed + 1, replacementPlan);
    const replacementInput = makeInput(
      replacementPackage,
      replacementPlan,
      replacementDecisionId,
      hexId("dep_", seed + 5001),
      target
    );
    const replacement = await publishToTarget(replacementInput);
    const replacementMarker = JSON.parse(await readFile(
      join(target.root, "versions", replacementPlan.release.record_id, "1", replacementPlan.preview_manifest_digest, ".caphub-version.json"),
      "utf8"
    )) as { files: Array<{ path: string; sha256: string; bytes: number }> };
    const replacementPreimage = digestCanonicalJson({
      schema_version: 1,
      pointer: replacement.pointer,
      files: replacementMarker.files
    });

    const rollbackPlan: DeploymentPlan = {
      ...originalPlan,
      action: "rollback",
      expected_current_pointer: replacement.pointer,
      target_preimage_digest: replacementPreimage
    };
    const rollbackDecisionId = await seedApprovedPlan(seed + 2, rollbackPlan);
    const rollbackInput = makeInput(
      originalPackage,
      rollbackPlan,
      rollbackDecisionId,
      hexId("dep_", seed + 5002),
      target
    );
    const originalSkillPath = join(
      target.root,
      "versions",
      originalPlan.release.record_id,
      "1",
      originalPlan.preview_manifest_digest,
      "$CODEX_HOME",
      "skills",
      originalPackage.slug,
      "SKILL.md"
    );
    await writeFile(originalSkillPath, "# tampered historical version\n", "utf8");

    await expect(publishToTarget(rollbackInput)).rejects.toMatchObject({ code: "PACKAGE_DIGEST_CONFLICT" });
    expect(JSON.parse(await readFile(join(target.root, "current.json"), "utf8"))).toEqual(replacement.pointer);
  });
});
