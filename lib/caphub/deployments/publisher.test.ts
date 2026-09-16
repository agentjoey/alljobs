import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderCodexPreview } from "../adapters/codex";
import { digestCanonicalJson } from "../analysis/digest";
import { testCapabilityPackage } from "../packages/fixtures";
import type { CapabilityPackage, DeploymentPlan } from "../packages/types";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "../registry/migrate";
import { PostgresExportStore } from "../registry/postgres/exports";
import { validateTargetRoot, writeTargetSentinel, type ValidatedTargetRoot } from "../projection/paths";
import { derivePlanRecordId } from "./plan";
import { publishToTarget, readTargetPointer, reconcileDeployment, type PublishInput } from "./publisher";

const NOW = "2026-09-16T09:00:00.000Z";
const ALIAS = "codex-fixture";
const DIGEST = "a".repeat(64);

let fixture: CaphubTestPostgres;
let counter = 1;
let created: string[] = [];

function nextSeed(): number {
  return counter++;
}

async function freshTarget(): Promise<ValidatedTargetRoot> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "caphub-deploy-")));
  created.push(root);
  await writeTargetSentinel(root, ALIAS);
  return validateTargetRoot({ root, alias: ALIAS });
}

function hexId(prefix: string, seed: number, length = 32): string {
  return `${prefix}${seed.toString(16).repeat(length).slice(0, length)}`;
}

function adapterPackage(seed: number, overrides: Partial<CapabilityPackage> = {}): CapabilityPackage {
  return testCapabilityPackage({
    release_id: hexId("rel_", seed),
    package_id: hexId("pkg_", seed + 1),
    slug: `pdf-tool-${seed.toString(16)}`,
    version: `1.0.${seed}`,
    dependencies: [],
    ...overrides
  });
}

function planFor(seed: number, pkg: CapabilityPackage, action: "publish" | "rollback", pointer: DeploymentPlan["expected_current_pointer"]): DeploymentPlan {
  const rendered = renderCodexPreview(pkg);
  if (!rendered.ok) throw new Error("adapter fixture failed");
  return {
    schema_version: 1,
    action,
    target: "codex",
    target_alias: ALIAS,
    release: { record_id: pkg.release_id, version: pkg.release_version ?? 1, digest: pkg.digest },
    adapter: {
      name: rendered.result.adapter,
      version: rendered.result.adapter_version,
      digest: rendered.result.source_digest
    },
    preview_manifest_digest: rendered.result.output_manifest_digest,
    preview_diff_digest: DIGEST,
    expected_current_pointer: pointer,
    target_preimage_digest: DIGEST,
    created_at: NOW
  };
}

async function insertRecordAndVersion(recordId: string, kind: string, payload: unknown, digest: string): Promise<void> {
  const existing = await fixture.pool.query(
    "SELECT 1 FROM caphub.registry_records WHERE record_id = $1",
    [recordId]
  );
  if (existing.rows.length > 0) return;
  const client = await fixture.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO caphub.registry_records (record_id, kind, current_version, created_at, updated_at)
       VALUES ($1, $2, 1, $3, $3)`,
      [recordId, kind, NOW]
    );
    await client.query(
      `INSERT INTO caphub.registry_versions
        (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
       VALUES ($1, 1, $2, 1, $3::jsonb, $4, NULL, $5)`,
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

async function seedApprovedPlan(seed: number, plan: DeploymentPlan): Promise<{
  planId: string;
  decisionId: string;
}> {
  const planId = derivePlanRecordId(plan);
  const planDigest = digestCanonicalJson(plan);
  await insertRecordAndVersion(plan.release.record_id, "release", {}, plan.release.digest);
  await insertRecordAndVersion(planId, "deployment_plan", plan, planDigest);
  const requestId = hexId("rev_", seed + 3000);
  const decisionId = hexId("dec_", seed + 4000);
  const shortId = planId.slice(4, 12);
  await fixture.pool.query(
    `INSERT INTO caphub.review_requests
      (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
       lock_version, state, approve_confirmation, reject_confirmation,
       superseded_by_request_id, created_at, updated_at)
     VALUES ($1, 'deployment', 'deployment_plan', $2, 1, $3, 2, 'APPROVED',
       $4, $5, NULL, $6, $6)`,
    [requestId, planId, planDigest, `APPROVE DEPLOYMENT ${shortId}`, `REJECT DEPLOYMENT ${shortId}`, NOW]
  );
  await fixture.pool.query(
    `INSERT INTO caphub.review_decisions
      (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
       action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
       subject_digest, actor, confirmation_digest, original_approval_decision_id,
       revokes_decision_id, recorded_at)
     VALUES ($1, $2, $3, 1, $4, 'approve', $5, '', NULL, 'deployment', $6, 1, $4,
       'human:owner', $4, NULL, NULL, $7)`,
    [decisionId, requestId, `intent-plan-${seed}`, planDigest, `APPROVE DEPLOYMENT ${shortId}`, planId, NOW]
  );
  return { planId, decisionId };
}

function publishInput(pkg: CapabilityPackage, plan: DeploymentPlan, decisionId: string, deploymentId: string) {
  const rendered = renderCodexPreview(pkg);
  if (!rendered.ok) throw new Error("adapter fixture failed");
  return {
    input: {
      root: undefined as unknown as ValidatedTargetRoot,
      plan,
      files: rendered.result.files,
      exports: new PostgresExportStore(fixture.appPool),
      deploymentRecordId: deploymentId,
      planApprovalDecisionId: decisionId,
      clock: () => NOW
    } as PublishInput,
    files: rendered.result.files
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

describe.sequential("publishToTarget (real PostgreSQL + fixture root)", () => {
  it("publishes an approved plan into an immutable version directory and atomic pointer", async () => {
    const seed = nextSeed();
    const pkg = adapterPackage(seed);
    const plan = planFor(seed, pkg, "publish", null);
    const { decisionId } = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const { input } = publishInput(pkg, plan, decisionId, hexId("dep_", seed + 5000));
    input.root = target;

    const { pointer } = await publishToTarget(input);
    expect(pointer.release_id).toBe(pkg.release_id);
    expect(pointer.deployment_id).toBe(input.deploymentRecordId);

    const storedPointer = await readTargetPointer(target);
    expect(storedPointer).toEqual(pointer);

    const versionDir = join(target.root, "versions", plan.release.record_id, String(plan.release.version), plan.preview_manifest_digest);
    const marker = JSON.parse(await readFile(join(versionDir, ".caphub-version.json"), "utf8"));
    expect(marker.manifest_digest).toBe(plan.preview_manifest_digest);
    const skill = await readFile(join(versionDir, "$CODEX_HOME/skills", pkg.slug, "SKILL.md"), "utf8");
    expect(skill).toContain("name: " + pkg.slug);

    const operation = JSON.parse(await readFile(join(target.root, "operations", `${input.deploymentRecordId}.json`), "utf8"));
    expect(operation.stage).toBe("completed");

    const consumed = await fixture.pool.query(
      "SELECT consumer_id FROM caphub.decision_consumers WHERE decision_id = $1",
      [decisionId]
    );
    expect(consumed.rows).toEqual([{ consumer_id: input.deploymentRecordId }]);
    const deployment = await fixture.pool.query(
      "SELECT payload FROM caphub.registry_versions WHERE record_id = $1",
      [input.deploymentRecordId]
    );
    expect(deployment.rows).toHaveLength(1);
  });

  it("retries the identical plan idempotently and refuses a replay with a different consumer", async () => {
    const seed = nextSeed();
    const pkg = adapterPackage(seed);
    const plan = planFor(seed, pkg, "publish", null);
    const { decisionId } = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const { input } = publishInput(pkg, plan, decisionId, hexId("dep_", seed + 5000));
    input.root = target;

    const first = await publishToTarget(input);
    const second = await publishToTarget(input);
    expect(second.pointer).toEqual(first.pointer);

    // A different consumer for the same plan arrives after the pointer moved:
    // fail closed before touching the already-consumed approval.
    const contender = { ...input, deploymentRecordId: hexId("dep_", seed + 5001) };
    await expect(publishToTarget(contender)).rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
  });

  it("refuses stale pointers, mismatched manifests, and symlinked version paths", async () => {
    const seed = nextSeed();
    const pkg = adapterPackage(seed);
    const plan = planFor(seed, pkg, "publish", null);
    const { decisionId } = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const { input } = publishInput(pkg, plan, decisionId, hexId("dep_", seed + 5000));
    input.root = target;

    await mkdir(join(target.root, "versions", plan.release.record_id), { recursive: true });
    await symlink("/private/tmp", join(target.root, "versions", plan.release.record_id, String(plan.release.version)));
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });

    const fresh = await freshTarget();
    input.root = fresh;
    const { pointer } = await publishToTarget(input);
    await writeFile(join(fresh.root, "current.json"), JSON.stringify({ ...pointer, release_version: 99 }), "utf8");
    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
  });

  it("enters recovery on injected failure and reconciles deterministically", async () => {
    const seed = nextSeed();
    const pkg = adapterPackage(seed);
    const plan = planFor(seed, pkg, "publish", null);
    const { decisionId } = await seedApprovedPlan(seed, plan);
    const target = await freshTarget();
    const { input } = publishInput(pkg, plan, decisionId, hexId("dep_", seed + 5000));
    input.root = target;
    input.hooks = {
      async afterRegistryDeployment() {
        throw new Error("injected failure after registry deployment");
      }
    };

    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "PUBLISH_RECOVERY_REQUIRED" });
    const operation = JSON.parse(await readFile(join(target.root, "operations", `${input.deploymentRecordId}.json`), "utf8"));
    expect(operation.stage).toBe("realized");
    await expect(readTargetPointer(target)).resolves.toBeNull();

    await expect(publishToTarget(input)).rejects.toMatchObject({ code: "PUBLISH_RECOVERY_REQUIRED" });

    const { pointer } = await reconcileDeployment({ ...input, hooks: undefined });
    expect(pointer.release_id).toBe(pkg.release_id);
    const completed = JSON.parse(await readFile(join(target.root, "operations", `${input.deploymentRecordId}.json`), "utf8"));
    expect(completed.stage).toBe("completed");
  });

  it("rolls back by switching only the pointer and retaining all history", async () => {
    const seed = nextSeed();
    const pkgV1 = adapterPackage(seed, { version: "1.0.0" });
    const planV1 = planFor(seed, pkgV1, "publish", null);
    const approvedV1 = await seedApprovedPlan(seed, planV1);
    const target = await freshTarget();
    const publishV1 = publishInput(pkgV1, planV1, approvedV1.decisionId, hexId("dep_", seed + 5000));
    publishV1.input.root = target;
    const v1 = await publishToTarget(publishV1.input);

    const pkgV2 = adapterPackage(seed + 1, { version: "2.0.0" });
    const planV2 = planFor(seed + 1, pkgV2, "publish", v1.pointer);
    const approvedV2 = await seedApprovedPlan(seed + 1, planV2);
    const publishV2 = publishInput(pkgV2, planV2, approvedV2.decisionId, hexId("dep_", seed + 5001));
    publishV2.input.root = target;
    const v2 = await publishToTarget(publishV2.input);
    expect(v2.pointer.release_id).toBe(pkgV2.release_id);

    const rollbackPlan = planFor(seed, pkgV1, "rollback", v2.pointer);
    const approvedRollback = await seedApprovedPlan(seed + 2, rollbackPlan);
    const rollback = publishInput(pkgV1, rollbackPlan, approvedRollback.decisionId, hexId("dep_", seed + 5002));
    rollback.input.root = target;
    const rolledBack = await publishToTarget(rollback.input);

    expect(rolledBack.pointer.release_id).toBe(pkgV1.release_id);
    expect(rolledBack.pointer.release_version).toBe(1);
    expect(rolledBack.pointer.deployment_id).toBe(rollback.input.deploymentRecordId);

    for (const plan of [planV1, planV2]) {
      const versionDir = join(target.root, "versions", plan.release.record_id, String(plan.release.version), plan.preview_manifest_digest);
      await expect(readFile(join(versionDir, ".caphub-version.json"), "utf8")).resolves.toContain("manifest_digest");
    }

    const operations = await Promise.all([
      readFile(join(target.root, "operations", `${publishV1.input.deploymentRecordId}.json`), "utf8"),
      readFile(join(target.root, "operations", `${publishV2.input.deploymentRecordId}.json`), "utf8"),
      readFile(join(target.root, "operations", `${rollback.input.deploymentRecordId}.json`), "utf8")
    ].map((promise) => promise.then((raw) => JSON.parse(raw).stage)));
    expect(operations).toEqual(["completed", "completed", "completed"]);

    const deployments = await fixture.pool.query(
      "SELECT count(*) FROM caphub.registry_versions WHERE record_id = ANY($1::text[])",
      [[publishV1.input.deploymentRecordId, publishV2.input.deploymentRecordId, rollback.input.deploymentRecordId]]
    );
    expect(deployments.rows[0]?.count).toBe("3");
  });
});
