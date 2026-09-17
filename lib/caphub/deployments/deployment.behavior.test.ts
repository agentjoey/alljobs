import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { renderCodexPreview } from "../adapters/codex";
import { capabilityCandidateSchema, reviewPacketSchema } from "../analysis/schemas";
import { digestCanonicalJson } from "../analysis/digest";
import { capabilityPackageSchema } from "../packages/schemas";
import type { CapabilityPackage, PackageFile } from "../packages/types";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "../registry/migrate";
import { PostgresExportStore } from "../registry/postgres/exports";
import { PostgresStageArtifactStore } from "../registry/postgres/caphub-stores";
import { PostgresRegistryLineageStore, PostgresRegistryRecordStore } from "../registry/postgres/records";
import { PostgresReviewStore } from "../registry/postgres/reviews";
import type { RegistryVersion, ReviewRequest } from "../registry/types";
import { validateTargetRoot, writeTargetSentinel, type ValidatedTargetRoot } from "../projection/paths";
import { ReleaseService } from "../releases/service";
import { FIXTURE_DIGEST, testCandidateVersion, testReviewPacket } from "../releases/fixtures";
import { DeploymentService, type TargetState } from "./plan";
import { publishToTarget, readActiveManifestDirectory, readTargetPointer } from "./publisher";

const NOW = "2026-09-16T09:00:00.000Z";
const ALIAS = "codex-fixture";

let fixture: CaphubTestPostgres;
let counter = 1;
const created: string[] = [];

function nextSeed(): number {
  return counter++;
}

function hexId(prefix: string, seed: number, length = 32): string {
  return `${prefix}${seed.toString(16).repeat(length).slice(0, length)}`;
}

async function freshTarget(): Promise<ValidatedTargetRoot> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "caphub-bdd-")));
  created.push(root);
  await writeTargetSentinel(root, ALIAS);
  return validateTargetRoot({ root, alias: ALIAS });
}

async function readTargetState(root: ValidatedTargetRoot): Promise<TargetState> {
  const active = await readActiveManifestDirectory(root.root);
  if (active === null) return { files: [], pointer: null };
  const files: PackageFile[] = [];
  const { readdir } = await import("node:fs/promises");
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const full = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("unsafe fixture symlink");
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name !== ".caphub-version.json") {
        const raw = await readFile(full);
        files.push({
          path: full.slice(active.directory.length + 1),
          media_type: "text/markdown",
          content: raw.toString("utf8"),
          sha256: createHash("sha256").update(raw).digest("hex"),
          bytes: raw.byteLength
        });
      }
    }
  }
  await walk(active.directory);
  return { files, pointer: active.pointer };
}

function makeReleaseService(pool: Pool): ReleaseService {
  return new ReleaseService({
    exports: new PostgresExportStore(pool),
    records: new PostgresRegistryRecordStore(pool, {
      candidate: capabilityCandidateSchema,
      review_packet: reviewPacketSchema,
      release: capabilityPackageSchema
    }),
    reviews: new PostgresReviewStore(pool),
    lineage: new PostgresRegistryLineageStore(pool),
    packets: new PostgresStageArtifactStore(pool),
    clock: () => NOW
  });
}

function makeDeploymentService(pool: Pool): DeploymentService {
  return new DeploymentService({
    exports: new PostgresExportStore(pool),
    records: new PostgresRegistryRecordStore(pool, { release: capabilityPackageSchema }),
    reviews: new PostgresReviewStore(pool),
    adapters: { codex: renderCodexPreview },
    readTargetState,
    clock: () => NOW
  });
}

async function seedApprovedCandidate(pool: Pool, seed: number): Promise<{
  candidateId: string;
  decisionId: string;
}> {
  const artifacts = new PostgresStageArtifactStore(pool);
  const dossier = (await import("../analysis/schemas")).researchDossierSchema.parse({
    schema_version: 1,
    capture_id: `cap_${"2".repeat(32)}`,
    extraction_artifact_id: `art_${"4".repeat(64)}`,
    identity: {
      status: "confirmed",
      entity_id: `ent_${"a".repeat(32)}`,
      evidence_ids: [`ev_${"7".repeat(32)}`]
    },
    evidence: [{
      id: `ev_${"7".repeat(32)}`,
      tier: "A",
      source_url: "https://example.com/docs",
      title: "Official documentation",
      checked_at: NOW,
      content_digest: FIXTURE_DIGEST,
      claims: ["install via package manager"]
    }],
    claim_checks: [],
    current_availability: `actively maintained (${seed})`,
    version: `3.2.${seed}`,
    maintenance_status: "active",
    install_methods: ["npm"],
    agent_protocol_support: ["mcp"],
    authentication: ["api key"],
    pricing: "free tier",
    data_destinations: ["local"],
    permissions: ["network"],
    license: "MIT License",
    security_findings: [],
    researched_at: NOW
  });
  const artifact = await artifacts.create({
    jobId: hexId("job_", seed),
    captureId: `cap_${"2".repeat(32)}`,
    stage: "research",
    inputDigest: FIXTURE_DIGEST,
    payload: dossier,
    createdAt: NOW
  });
  const packetPayload = testReviewPacket({
    packet_id: hexId("rvp_", seed, 32),
    stage_artifact_ids: {
      preprocess: `art_${"3".repeat(64)}`,
      extraction: `art_${"4".repeat(64)}`,
      research: artifact.id,
      assessment: `art_${"6".repeat(64)}`,
      critic: null
    }
  });
  const candidate = testCandidateVersion(packetPayload);
  candidate.record_id = hexId("cand_", seed);
  const packet: RegistryVersion = {
    record_id: packetPayload.packet_id,
    kind: "review_packet",
    version: 1,
    schema_version: 1,
    payload: packetPayload,
    payload_digest: digestCanonicalJson(packetPayload),
    previous_version: null,
    created_at: NOW
  };
  const records = new PostgresRegistryRecordStore(pool, {
    candidate: capabilityCandidateSchema,
    review_packet: reviewPacketSchema
  });
  await records.putVersion(candidate);
  await records.putVersion(packet);
  await new PostgresRegistryLineageStore(pool).put({
    schema_version: 1,
    from_record_id: packet.record_id,
    from_kind: "review_packet",
    from_version: 1,
    from_digest: packet.payload_digest,
    relationship: "proposes",
    to_record_id: candidate.record_id,
    to_kind: "candidate",
    to_version: 1,
    to_digest: candidate.payload_digest,
    created_at: NOW
  });
  const requestId = hexId("rev_", seed + 100);
  const decisionId = hexId("dec_", seed + 200);
  const shortId = candidate.record_id.slice(candidate.record_id.indexOf("_") + 1, candidate.record_id.indexOf("_") + 9);
  await pool.query(
    `INSERT INTO caphub.review_requests
      (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
       lock_version, state, approve_confirmation, reject_confirmation,
       superseded_by_request_id, created_at, updated_at)
     VALUES ($1, 'candidate', 'candidate', $2, 1, $3, 2, 'APPROVED', $4, $5, NULL, $6, $6)`,
    [requestId, candidate.record_id, candidate.payload_digest,
      `APPROVE CANDIDATE ${shortId}`, `REJECT CANDIDATE ${shortId}`, NOW]
  );
  await pool.query(
    `INSERT INTO caphub.review_decisions
      (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
       action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
       subject_digest, actor, confirmation_digest, original_approval_decision_id,
       revokes_decision_id, recorded_at)
     VALUES ($1, $2, $3, 1, $4, 'approve', $5, '', 'adopt', 'candidate', $6, 1, $4,
       'human:owner', $4, NULL, NULL, $7)`,
    [decisionId, requestId, `intent-candidate-${seed}`, candidate.payload_digest,
      `APPROVE CANDIDATE ${shortId}`, candidate.record_id, NOW]
  );
  return { candidateId: candidate.record_id, decisionId };
}

async function finalizeRelease(service: ReleaseService, pool: Pool, release: RegistryVersion): Promise<string> {
  const row = await pool.query<ReviewRequest & { request_id: string }>(
    "SELECT * FROM caphub.review_requests WHERE subject_id = $1",
    [release.record_id]
  );
  const request = row.rows[0];
  if (!request) throw new Error("release review request missing");
  const reviews = new PostgresReviewStore(pool);
  const decision = await reviews.decide({
    request_id: request.request_id,
    idempotency_key: `intent-release-${release.record_id.slice(4, 12)}`,
    expected_lock_version: request.lock_version,
    expected_subject_digest: request.subject_digest,
    action: "approve",
    confirmation: request.approve_confirmation,
    rationale: "Finalize."
  });
  const finalized = await service.finalizeApproval({
    releaseId: release.record_id,
    approvalDecisionId: decision.decision.id
  });
  expect(finalized.status).toBe("finalized");
  return decision.decision.id;
}

async function approveDeploymentReview(pool: Pool, planRecordId: string): Promise<string> {
  const row = await pool.query<{ request_id: string; lock_version: number; subject_digest: string; approve_confirmation: string }>(
    "SELECT request_id, lock_version, subject_digest, approve_confirmation FROM caphub.review_requests WHERE subject_id = $1",
    [planRecordId]
  );
  const request = row.rows[0];
  if (!request) throw new Error("deployment review request missing");
  const decision = await new PostgresReviewStore(pool).decide({
    request_id: request.request_id,
    idempotency_key: `intent-deployment-${planRecordId.slice(4, 12)}`,
    expected_lock_version: request.lock_version,
    expected_subject_digest: request.subject_digest,
    action: "approve",
    confirmation: request.approve_confirmation,
    rationale: "Deploy."
  });
  return decision.decision.id;
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

describe.sequential("Deployment behavior chain (real PostgreSQL + fixture targets)", () => {
  it("runs the full chain through publish and rollback with exact approvals only", async () => {
    const pool = fixture.appPool;
    const releaseService = makeReleaseService(pool);
    const deploymentService = makeDeploymentService(pool);
    const exports = new PostgresExportStore(pool);

    // Candidate approval -> Release candidate.
    const first = await seedApprovedCandidate(pool, nextSeed());
    const createdFirst = await releaseService.createCandidate({
      candidateId: first.candidateId,
      approvalDecisionId: first.decisionId
    });
    await finalizeRelease(releaseService, pool, createdFirst.release);
    const releaseV1 = createdFirst.release;

    // Deterministic preview + deployment plan + exact approval.
    const target = await freshTarget();
    const planV1 = await deploymentService.createPlan({
      action: "publish",
      target: "codex",
      targetAlias: ALIAS,
      releaseId: releaseV1.record_id,
      expectedReleaseDigest: releaseV1.payload_digest,
      root: target,
      expectedCurrentPointer: null
    });
    const planApprovalV1 = await approveDeploymentReview(pool, planV1.planRecord.record_id);
    const renderedV1 = renderCodexPreview(capabilityPackageSchema.parse(releaseV1.payload));
    if (!renderedV1.ok) throw new Error("preview failed");
    const deploymentIdV1 = `dep_${digestCanonicalJson({ schema_version: 1, plan: digestCanonicalJson(planV1.plan) }).slice(0, 32)}`;
    const publishedV1 = await publishToTarget({
      root: target,
      plan: planV1.plan,
      files: renderedV1.result.files,
      exports,
      deploymentRecordId: deploymentIdV1,
      planApprovalDecisionId: planApprovalV1,
      assertAuthority: async () => undefined,
      clock: () => NOW
    });
    expect((await readTargetPointer(target))?.release_id).toBe(releaseV1.record_id);

    // Second release upgrades the target.
    const second = await seedApprovedCandidate(pool, nextSeed());
    const createdSecond = await releaseService.createCandidate({
      candidateId: second.candidateId,
      approvalDecisionId: second.decisionId
    });
    await finalizeRelease(releaseService, pool, createdSecond.release);
    const releaseV2 = createdSecond.release;

    const planV2 = await deploymentService.createPlan({
      action: "publish",
      target: "codex",
      targetAlias: ALIAS,
      releaseId: releaseV2.record_id,
      expectedReleaseDigest: releaseV2.payload_digest,
      root: target,
      expectedCurrentPointer: publishedV1.pointer
    });
    const planApprovalV2 = await approveDeploymentReview(pool, planV2.planRecord.record_id);
    const renderedV2 = renderCodexPreview(capabilityPackageSchema.parse(releaseV2.payload));
    if (!renderedV2.ok) throw new Error("preview failed");
    const deploymentIdV2 = `dep_${digestCanonicalJson({ schema_version: 1, plan: digestCanonicalJson(planV2.plan) }).slice(0, 32)}`;
    const publishedV2 = await publishToTarget({
      root: target,
      plan: planV2.plan,
      files: renderedV2.result.files,
      exports,
      deploymentRecordId: deploymentIdV2,
      planApprovalDecisionId: planApprovalV2,
      assertAuthority: async () => undefined,
      clock: () => NOW
    });
    expect((await readTargetPointer(target))?.release_id).toBe(releaseV2.record_id);

    // Rollback requires a new exact plan and approval; only the pointer moves.
    const rollbackPlan = await deploymentService.createPlan({
      action: "rollback",
      target: "codex",
      targetAlias: ALIAS,
      releaseId: releaseV1.record_id,
      expectedReleaseDigest: releaseV1.payload_digest,
      root: target,
      expectedCurrentPointer: publishedV2.pointer
    });
    const rollbackApproval = await approveDeploymentReview(pool, rollbackPlan.planRecord.record_id);
    const rollbackDeploymentId = `dep_${digestCanonicalJson({ schema_version: 1, plan: digestCanonicalJson(rollbackPlan.plan) }).slice(0, 32)}`;
    const rolledBack = await publishToTarget({
      root: target,
      plan: rollbackPlan.plan,
      files: renderedV1.result.files,
      exports,
      deploymentRecordId: rollbackDeploymentId,
      planApprovalDecisionId: rollbackApproval,
      assertAuthority: async () => undefined,
      clock: () => NOW
    });

    const pointer = await readTargetPointer(target);
    expect(pointer?.release_id).toBe(releaseV1.record_id);
    expect(pointer?.deployment_id).toBe(rollbackDeploymentId);
    expect(rolledBack.pointer).toEqual(pointer);
    expect(publishedV2.pointer.deployment_id).not.toBe(rollbackDeploymentId);

    for (const plan of [planV1.plan, planV2.plan]) {
      const versionDir = join(target.root, "versions", plan.release.record_id, String(plan.release.version), plan.preview_manifest_digest, ".caphub-version.json");
      await expect(readFile(versionDir, "utf8")).resolves.toContain("manifest_digest");
    }

    // Every approval in the chain was consumed exactly once.
    for (const decisionId of [planApprovalV1, planApprovalV2, rollbackApproval]) {
      const consumed = await pool.query(
        "SELECT count(*) FROM caphub.decision_consumers WHERE decision_id = $1",
        [decisionId]
      );
      expect(consumed.rows[0]?.count).toBe("1");
    }
    expect(publishedV1.pointer.pointer_digest).not.toBe(publishedV2.pointer.pointer_digest);
  });
});
