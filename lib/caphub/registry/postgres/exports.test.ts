import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { CaphubTestPostgres } from "../../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../../tests/helpers/caphub-postgres";
import { digestCanonicalJson } from "../../analysis/digest";
import { packageContentDigest } from "../../packages/digest";
import type { CapabilityPackage, DeploymentPlan } from "../../packages/types";
import type { RegistryLineageEdge, RegistryVersion, ReviewRequest } from "../types";
import { applyRegistryMigrations } from "../migrate";
import { PostgresExportStore, PostgresExportStoreError } from "./exports";

const NOW = "2026-09-16T08:00:00.000Z";
const DIGEST = "a".repeat(64);

let fixture: CaphubTestPostgres;
let counter = 1;

function hexId(prefix: string, seed: number, length = 32): string {
  return `${prefix}${seed.toString(16).repeat(length).slice(0, length)}`;
}

function nextSeed(): number {
  return counter++;
}

function capabilityPackage(seed: number, overrides: Partial<CapabilityPackage> = {}): CapabilityPackage {
  const pkg = {
    schema_version: 1,
    package_id: hexId("pkg_", seed),
    release_id: hexId("rel_", seed),
    release_version: 1,
    version: "1.0.0",
    slug: `pdf-tool-${seed.toString(16)}`,
    kind: "skill",
    title: "PDF Tool",
    description: "Extract tables from PDFs.",
    triggers: ["pdf"],
    non_triggers: [],
    instructions: "Read the PDF and extract tables.",
    permissions: ["read_file"],
    dependencies: [],
    compatibility: { hosts: ["codex"] },
    resources: [],
    evidence: [],
    lineage: [],
    license: { spdx_id: "MIT", provenance_confidence: "high" },
    known_limits: [],
    evaluations: [],
    created_at: NOW,
    digest: "",
    ...overrides
  } as CapabilityPackage;
  return { ...pkg, digest: packageContentDigest(pkg) };
}

function releaseVersion(seed: number, pkg: CapabilityPackage): RegistryVersion {
  return {
    record_id: pkg.release_id,
    kind: "release",
    version: 1,
    schema_version: 1,
    payload: pkg,
    payload_digest: digestCanonicalJson(pkg),
    previous_version: null,
    created_at: NOW
  };
}

function releaseReviewRequest(seed: number, release: RegistryVersion): ReviewRequest {
  const shortId = release.record_id.slice(release.record_id.indexOf("_") + 1, release.record_id.indexOf("_") + 9);
  return {
    schema_version: 1,
    id: hexId("rev_", seed + 10_000),
    review_kind: "release",
    subject_id: release.record_id,
    subject_kind: "release",
    subject_version: release.version,
    subject_digest: release.payload_digest,
    lock_version: 1,
    state: "WAITING_FOR_REVIEW",
    approve_confirmation: `APPROVE RELEASE ${shortId}`,
    reject_confirmation: `REJECT RELEASE ${shortId}`,
    superseded_by_request_id: null,
    created_at: NOW,
    updated_at: NOW
  };
}

async function insertRecordAndVersion(
  recordId: string,
  kind: string,
  payload: unknown,
  digest: string
): Promise<void> {
  const client = await fixture.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO caphub.registry_records
        (record_id, kind, current_version, created_at, updated_at)
       VALUES ($1, $2, 1, $3, $3)`,
      [recordId, kind, NOW]
    );
    await client.query(
      `INSERT INTO caphub.registry_versions
        (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
       VALUES ($1, 1, $2, 1, $3::jsonb, $4, NULL, $5)`,
      [recordId, kind, JSON.stringify(payload ?? {}), digest, NOW]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertCandidateApproval(seed: number, disposition = "adopt"): Promise<{
  candidateId: string;
  requestId: string;
  decisionId: string;
}> {
  const candidateId = hexId("cand_", seed);
  const requestId = hexId("rev_", seed + 100);
  const decisionId = hexId("dec_", seed + 200);
  const shortId = candidateId.slice(candidateId.indexOf("_") + 1, candidateId.indexOf("_") + 9);
  await insertRecordAndVersion(candidateId, "candidate", {}, DIGEST);
  await fixture.pool.query(
    `INSERT INTO caphub.review_requests
      (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
       lock_version, state, approve_confirmation, reject_confirmation,
       superseded_by_request_id, created_at, updated_at)
     VALUES ($1, 'candidate', 'candidate', $2, 1, $3, 1, 'APPROVED',
       $4, $5, NULL, $6, $6)`,
    [requestId, candidateId, DIGEST, `APPROVE CANDIDATE ${shortId}`, `REJECT CANDIDATE ${shortId}`, NOW]
  );
  await fixture.pool.query(
    `INSERT INTO caphub.review_decisions
      (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
       action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
       subject_digest, actor, confirmation_digest, original_approval_decision_id,
       revokes_decision_id, recorded_at)
     VALUES ($1, $2, $3, 1, $4, 'approve', $5, '', $6, 'candidate', $7, 1, $4,
       'human:owner', $8, NULL, NULL, $9)`,
    [decisionId, requestId, `intent-candidate-${seed}`, DIGEST, `APPROVE CANDIDATE ${shortId}`,
      disposition, candidateId, DIGEST, NOW]
  );
  return { candidateId, requestId, decisionId };
}

function realizedAsEdge(fromId: string, to: RegistryVersion): RegistryLineageEdge {
  return {
    schema_version: 1,
    from_record_id: fromId,
    from_kind: "candidate",
    from_version: 1,
    from_digest: DIGEST,
    relationship: "realized_as",
    to_record_id: to.record_id,
    to_kind: "release",
    to_version: to.version,
    to_digest: to.payload_digest,
    created_at: NOW
  };
}

function makeStore(pool: Pool = fixture.appPool): PostgresExportStore {
  return new PostgresExportStore(pool);
}

beforeAll(async () => {
  fixture = await startCaphubTestPostgres();
  await applyRegistryMigrations(fixture.pool);
}, 30_000);

afterAll(async () => {
  await fixture?.stop();
}, 30_000);

describe.sequential("PostgreSQL Registry export store", () => {
  it("composes an immutable Release, consumes the Candidate approval, and opens the Release review atomically", async () => {
    const seed = nextSeed();
    const { candidateId, decisionId } = await insertCandidateApproval(seed);
    const pkg = capabilityPackage(seed);
    const release = releaseVersion(seed, pkg);
    const request = releaseReviewRequest(seed, release);
    const store = makeStore();

    await expect(store.composeRelease({
      release,
      candidateApprovalDecisionId: decisionId,
      lineage: [realizedAsEdge(candidateId, release)],
      reviewRequest: request
    })).resolves.toBe("created");

    const version = await fixture.pool.query<{ payload: unknown; payload_digest: string }>(
      "SELECT payload, payload_digest FROM caphub.registry_versions WHERE record_id = $1 AND version = 1",
      [release.record_id]
    );
    expect(version.rows).toHaveLength(1);
    expect(version.rows[0]?.payload_digest).toBe(release.payload_digest);
    const consumed = await fixture.pool.query<{ consumer_id: string }>(
      "SELECT consumer_id FROM caphub.decision_consumers WHERE decision_id = $1",
      [decisionId]
    );
    expect(consumed.rows).toEqual([{ consumer_id: release.record_id }]);
    const lineage = await fixture.pool.query<{ relationship: string }>(
      "SELECT relationship FROM caphub.registry_lineage WHERE to_node_id = $1",
      [release.record_id]
    );
    expect(lineage.rows).toEqual([{ relationship: "realized_as" }]);
    const review = await fixture.pool.query<{ state: string; review_kind: string }>(
      "SELECT state, review_kind FROM caphub.review_requests WHERE request_id = $1",
      [request.id]
    );
    expect(review.rows).toEqual([{ state: "WAITING_FOR_REVIEW", review_kind: "release" }]);
  });

  it("returns the same Release for an identical retry instead of duplicating anything", async () => {
    const seed = nextSeed();
    const { candidateId, decisionId } = await insertCandidateApproval(seed);
    const release = releaseVersion(seed, capabilityPackage(seed));
    const input = {
      release,
      candidateApprovalDecisionId: decisionId,
      lineage: [realizedAsEdge(candidateId, release)],
      reviewRequest: releaseReviewRequest(seed, release)
    };
    const store = makeStore();
    await expect(store.composeRelease(input)).resolves.toBe("created");
    await expect(store.composeRelease(input)).resolves.toBe("existing");

    const versions = await fixture.pool.query(
      "SELECT count(*) FROM caphub.registry_versions WHERE record_id = $1",
      [release.record_id]
    );
    expect(versions.rows[0]?.count).toBe("1");
    const consumers = await fixture.pool.query(
      "SELECT count(*) FROM caphub.decision_consumers WHERE decision_id = $1",
      [decisionId]
    );
    expect(consumers.rows[0]?.count).toBe("1");
  });

  it("rejects a different payload under the same immutable Release identity", async () => {
    const seed = nextSeed();
    const { candidateId, decisionId } = await insertCandidateApproval(seed);
    const release = releaseVersion(seed, capabilityPackage(seed));
    const store = makeStore();
    await store.composeRelease({
      release,
      candidateApprovalDecisionId: decisionId,
      lineage: [realizedAsEdge(candidateId, release)],
      reviewRequest: releaseReviewRequest(seed, release)
    });

    const otherDecision = await insertCandidateApproval(seed + 500);
    const contender = releaseVersion(seed, capabilityPackage(seed, { title: "Mutated title" }));
    await expect(store.composeRelease({
      release: contender,
      candidateApprovalDecisionId: otherDecision.decisionId,
      lineage: [realizedAsEdge(otherDecision.candidateId, contender)],
      reviewRequest: releaseReviewRequest(seed + 500, contender)
    })).rejects.toMatchObject({ code: "REGISTRY_DIGEST_CONFLICT" });
  });

  it("refuses to compose from a missing, rejected, or already-consumed Candidate approval", async () => {
    const seed = nextSeed();
    const { candidateId } = await insertCandidateApproval(seed);
    const release = releaseVersion(seed, capabilityPackage(seed));
    const store = makeStore();

    await expect(store.composeRelease({
      release,
      candidateApprovalDecisionId: hexId("dec_", seed + 900),
      lineage: [realizedAsEdge(candidateId, release)],
      reviewRequest: releaseReviewRequest(seed, release)
    })).rejects.toMatchObject({ code: "INVALID_REVIEW_DECISION" });

    const rejectedSeed = nextSeed();
    const rejected = await insertCandidateApproval(rejectedSeed);
    await fixture.pool.query(
      "UPDATE caphub.review_requests SET state = 'REJECTED', lock_version = 2 WHERE request_id = $1",
      [rejected.requestId]
    );
    const rejectedRelease = releaseVersion(rejectedSeed, capabilityPackage(rejectedSeed));
    await expect(store.composeRelease({
      release: rejectedRelease,
      candidateApprovalDecisionId: rejected.decisionId,
      lineage: [realizedAsEdge(rejected.candidateId, rejectedRelease)],
      reviewRequest: releaseReviewRequest(rejectedSeed, rejectedRelease)
    })).rejects.toMatchObject({ code: "REVIEW_ALREADY_TERMINAL" });
  });

  it("lets exactly one of two concurrent writers consume the same Candidate approval", async () => {
    const seed = nextSeed();
    const { candidateId, decisionId } = await insertCandidateApproval(seed);
    const release = releaseVersion(seed, capabilityPackage(seed));
    const input = {
      release,
      candidateApprovalDecisionId: decisionId,
      lineage: [realizedAsEdge(candidateId, release)],
      reviewRequest: releaseReviewRequest(seed, release)
    };
    const firstPool = fixture.createAppPool("caphub_export_concurrent_a");
    const secondPool = fixture.createAppPool("caphub_export_concurrent_b");
    try {
      const results = await Promise.all([
        makeStore(firstPool).composeRelease(input),
        makeStore(secondPool).composeRelease(input)
      ]);
      expect(results.sort()).toEqual(["created", "existing"]);
      const consumers = await fixture.pool.query(
        "SELECT count(*) FROM caphub.decision_consumers WHERE decision_id = $1",
        [decisionId]
      );
      expect(consumers.rows[0]?.count).toBe("1");
      const versions = await fixture.pool.query(
        "SELECT count(*) FROM caphub.registry_versions WHERE record_id = $1",
        [release.record_id]
      );
      expect(versions.rows[0]?.count).toBe("1");
    } finally {
      await Promise.all([firstPool.end(), secondPool.end()]);
    }
  });

  it("finalizes an approved Release exactly once and revalidates the exact version and digest", async () => {
    const seed = nextSeed();
    const { candidateId, decisionId } = await insertCandidateApproval(seed);
    const release = releaseVersion(seed, capabilityPackage(seed));
    const store = makeStore();
    await store.composeRelease({
      release,
      candidateApprovalDecisionId: decisionId,
      lineage: [realizedAsEdge(candidateId, release)],
      reviewRequest: releaseReviewRequest(seed, release)
    });

    const releaseRequest = releaseReviewRequest(seed + 700, release);
    await fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation,
         superseded_by_request_id, created_at, updated_at)
       VALUES ($1, 'release', 'release', $2, $3, $4, 1, 'APPROVED',
         $5, $6, NULL, $7, $7)`,
      [releaseRequest.id, release.record_id, release.version, release.payload_digest,
        releaseRequest.approve_confirmation, releaseRequest.reject_confirmation, NOW]
    );
    const approvalId = hexId("dec_", seed + 800);
    await fixture.pool.query(
      `INSERT INTO caphub.review_decisions
        (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
         action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
         subject_digest, actor, confirmation_digest, original_approval_decision_id,
         revokes_decision_id, recorded_at)
       VALUES ($1, $2, $3, 1, $4, 'approve', $5, '', NULL, 'release', $6, $7, $4,
         'human:owner', $4, NULL, NULL, $8)`,
      [approvalId, releaseRequest.id, `intent-release-${seed}`, release.payload_digest,
        releaseRequest.approve_confirmation, release.record_id, release.version, NOW]
    );

    await expect(store.finalizeRelease({
      releaseRecordId: release.record_id,
      releaseVersion: release.version,
      releaseDigest: release.payload_digest,
      releaseApprovalDecisionId: approvalId
    })).resolves.toBe("finalized");
    await expect(store.finalizeRelease({
      releaseRecordId: release.record_id,
      releaseVersion: release.version,
      releaseDigest: release.payload_digest,
      releaseApprovalDecisionId: approvalId
    })).resolves.toBe("existing");

    await expect(store.finalizeRelease({
      releaseRecordId: release.record_id,
      releaseVersion: release.version,
      releaseDigest: "b".repeat(64),
      releaseApprovalDecisionId: approvalId
    })).rejects.toMatchObject({ code: "STALE_WRITE" });

    const consumers = await fixture.pool.query(
      "SELECT consumer_id FROM caphub.decision_consumers WHERE decision_id = $1",
      [approvalId]
    );
    expect(consumers.rows).toEqual([{ consumer_id: release.record_id }]);
  });

  it("persists a Deployment plan with release lineage and its own Deployment review", async () => {
    const seed = nextSeed();
    const { candidateId, decisionId } = await insertCandidateApproval(seed);
    const release = releaseVersion(seed, capabilityPackage(seed));
    const store = makeStore();
    await store.composeRelease({
      release,
      candidateApprovalDecisionId: decisionId,
      lineage: [realizedAsEdge(candidateId, release)],
      reviewRequest: releaseReviewRequest(seed, release)
    });

    const plan: DeploymentPlan = {
      schema_version: 1,
      action: "publish",
      target: "codex",
      target_alias: "codex-fixture",
      release: { record_id: release.record_id, version: 1, digest: release.payload_digest },
      adapter: { name: "codex", version: "1.0.0", digest: DIGEST },
      preview_manifest_digest: DIGEST,
      preview_diff_digest: DIGEST,
      expected_current_pointer: null,
      target_preimage_digest: DIGEST,
      created_at: NOW
    };
    const planVersion: RegistryVersion = {
      record_id: hexId("dpl_", seed),
      kind: "deployment_plan",
      version: 1,
      schema_version: 1,
      payload: plan,
      payload_digest: digestCanonicalJson(plan),
      previous_version: null,
      created_at: NOW
    };
    const shortId = planVersion.record_id.slice(4, 12);
    const request: ReviewRequest = {
      schema_version: 1,
      id: hexId("rev_", seed + 300),
      review_kind: "deployment",
      subject_id: planVersion.record_id,
      subject_kind: "deployment_plan",
      subject_version: 1,
      subject_digest: planVersion.payload_digest,
      lock_version: 1,
      state: "WAITING_FOR_REVIEW",
      approve_confirmation: `APPROVE DEPLOYMENT ${shortId}`,
      reject_confirmation: `REJECT DEPLOYMENT ${shortId}`,
      superseded_by_request_id: null,
      created_at: NOW,
      updated_at: NOW
    };
    const input = {
      plan: planVersion,
      lineage: [{
        schema_version: 1,
        from_record_id: release.record_id,
        from_kind: "release",
        from_version: 1,
        from_digest: release.payload_digest,
        relationship: "proposes",
        to_record_id: planVersion.record_id,
        to_kind: "deployment_plan",
        to_version: 1,
        to_digest: planVersion.payload_digest,
        created_at: NOW
      }] as RegistryLineageEdge[],
      reviewRequest: request
    };
    await expect(store.composeDeploymentPlan(input)).resolves.toBe("created");
    await expect(store.composeDeploymentPlan(input)).resolves.toBe("existing");

    const stored = await fixture.pool.query<{ payload: unknown }>(
      "SELECT payload FROM caphub.registry_versions WHERE record_id = $1",
      [planVersion.record_id]
    );
    expect(stored.rows).toHaveLength(1);
    const review = await fixture.pool.query<{ review_kind: string }>(
      "SELECT review_kind FROM caphub.review_requests WHERE request_id = $1",
      [request.id]
    );
    expect(review.rows).toEqual([{ review_kind: "deployment" }]);
  });

  it("realizes a Deployment by consuming the plan approval and recording both lineage edges", async () => {
    const seed = nextSeed();
    const { candidateId, decisionId } = await insertCandidateApproval(seed);
    const release = releaseVersion(seed, capabilityPackage(seed));
    const store = makeStore();
    await store.composeRelease({
      release,
      candidateApprovalDecisionId: decisionId,
      lineage: [realizedAsEdge(candidateId, release)],
      reviewRequest: releaseReviewRequest(seed, release)
    });

    const planRecordId = hexId("dpl_", seed);
    const plan: DeploymentPlan = {
      schema_version: 1,
      action: "publish",
      target: "codex",
      target_alias: "codex-fixture",
      release: { record_id: release.record_id, version: 1, digest: release.payload_digest },
      adapter: { name: "codex", version: "1.0.0", digest: DIGEST },
      preview_manifest_digest: DIGEST,
      preview_diff_digest: DIGEST,
      expected_current_pointer: null,
      target_preimage_digest: DIGEST,
      created_at: NOW
    };
    const planVersion: RegistryVersion = {
      record_id: planRecordId,
      kind: "deployment_plan",
      version: 1,
      schema_version: 1,
      payload: plan,
      payload_digest: digestCanonicalJson(plan),
      previous_version: null,
      created_at: NOW
    };
    await insertRecordAndVersion(planRecordId, "deployment_plan", plan, planVersion.payload_digest);
    const planRequestId = hexId("rev_", seed + 400);
    const shortId = planRecordId.slice(4, 12);
    await fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation,
         superseded_by_request_id, created_at, updated_at)
       VALUES ($1, 'deployment', 'deployment_plan', $2, 1, $3, 1, 'APPROVED',
         $4, $5, NULL, $6, $6)`,
      [planRequestId, planRecordId, planVersion.payload_digest,
        `APPROVE DEPLOYMENT ${shortId}`, `REJECT DEPLOYMENT ${shortId}`, NOW]
    );
    const planDecisionId = hexId("dec_", seed + 600);
    await fixture.pool.query(
      `INSERT INTO caphub.review_decisions
        (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
         action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
         subject_digest, actor, confirmation_digest, original_approval_decision_id,
         revokes_decision_id, recorded_at)
       VALUES ($1, $2, $3, 1, $4, 'approve', $5, '', NULL, 'deployment', $6, 1, $4,
         'human:owner', $4, NULL, NULL, $7)`,
      [planDecisionId, planRequestId, `intent-plan-${seed}`, planVersion.payload_digest,
        `APPROVE DEPLOYMENT ${shortId}`, planRecordId, NOW]
    );

    const deploymentPayload = {
      schema_version: 1,
      action: "publish",
      target: "codex",
      target_alias: "codex-fixture",
      release: { record_id: release.record_id, version: 1, digest: release.payload_digest },
      plan: { record_id: planRecordId, version: 1, digest: planVersion.payload_digest },
      prior_pointer: null,
      created_at: NOW
    };
    const deployment: RegistryVersion = {
      record_id: hexId("dep_", seed),
      kind: "deployment",
      version: 1,
      schema_version: 1,
      payload: deploymentPayload,
      payload_digest: digestCanonicalJson(deploymentPayload),
      previous_version: null,
      created_at: NOW
    };
    const input = {
      deployment,
      planApprovalDecisionId: planDecisionId,
      lineage: [
        {
          schema_version: 1,
          from_record_id: planRecordId,
          from_kind: "deployment_plan",
          from_version: 1,
          from_digest: planVersion.payload_digest,
          relationship: "realized_as",
          to_record_id: deployment.record_id,
          to_kind: "deployment",
          to_version: 1,
          to_digest: deployment.payload_digest,
          created_at: NOW
        },
        {
          schema_version: 1,
          from_record_id: release.record_id,
          from_kind: "release",
          from_version: 1,
          from_digest: release.payload_digest,
          relationship: "deployed_as",
          to_record_id: deployment.record_id,
          to_kind: "deployment",
          to_version: 1,
          to_digest: deployment.payload_digest,
          created_at: NOW
        }
      ] as RegistryLineageEdge[]
    };
    await expect(store.realizeDeployment(input)).resolves.toBe("created");
    await expect(store.realizeDeployment(input)).resolves.toBe("existing");

    const relationships = await fixture.pool.query<{ relationship: string }>(
      "SELECT relationship FROM caphub.registry_lineage WHERE to_node_id = $1 ORDER BY relationship",
      [deployment.record_id]
    );
    expect(relationships.rows).toEqual([{ relationship: "deployed_as" }, { relationship: "realized_as" }]);
  });

  it("refuses a second consumer for an already-consumed plan approval", async () => {
    const seed = nextSeed();
    const planRecordId = hexId("dpl_", seed);
    const shortId = planRecordId.slice(4, 12);
    const plan: DeploymentPlan = {
      schema_version: 1,
      action: "publish",
      target: "hermes",
      target_alias: "hermes-fixture",
      release: { record_id: hexId("rel_", seed), version: 1, digest: DIGEST },
      adapter: { name: "hermes", version: "1.0.0", digest: DIGEST },
      preview_manifest_digest: DIGEST,
      preview_diff_digest: DIGEST,
      expected_current_pointer: null,
      target_preimage_digest: DIGEST,
      created_at: NOW
    };
    await insertRecordAndVersion(planRecordId, "deployment_plan", plan, digestCanonicalJson(plan));
    const planRequestId = hexId("rev_", seed + 410);
    await fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation,
         superseded_by_request_id, created_at, updated_at)
       VALUES ($1, 'deployment', 'deployment_plan', $2, 1, $3, 1, 'APPROVED',
         $4, $5, NULL, $6, $6)`,
      [planRequestId, planRecordId, digestCanonicalJson(plan),
        `APPROVE DEPLOYMENT ${shortId}`, `REJECT DEPLOYMENT ${shortId}`, NOW]
    );
    const planDecisionId = hexId("dec_", seed + 610);
    await fixture.pool.query(
      `INSERT INTO caphub.review_decisions
        (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
         action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
         subject_digest, actor, confirmation_digest, original_approval_decision_id,
         revokes_decision_id, recorded_at)
       VALUES ($1, $2, $3, 1, $4, 'approve', $5, '', NULL, 'deployment', $6, 1, $4,
         'human:owner', $4, NULL, NULL, $7)`,
      [planDecisionId, planRequestId, `intent-plan-${seed}`, digestCanonicalJson(plan),
        `APPROVE DEPLOYMENT ${shortId}`, planRecordId, NOW]
    );

    const deploymentPayload = (recordId: string) => ({
      schema_version: 1,
      action: "publish",
      target: "hermes",
      target_alias: "hermes-fixture",
      release: { record_id: hexId("rel_", seed), version: 1, digest: DIGEST },
      plan: { record_id: planRecordId, version: 1, digest: digestCanonicalJson(plan) },
      prior_pointer: null,
      created_at: NOW
    });
    const first = {
      record_id: hexId("dep_", seed),
      kind: "deployment" as const,
      version: 1,
      schema_version: 1 as const,
      payload: deploymentPayload("first"),
      payload_digest: digestCanonicalJson(deploymentPayload("first")),
      previous_version: null,
      created_at: NOW
    };
    const store = makeStore();
    await expect(store.realizeDeployment({
      deployment: first,
      planApprovalDecisionId: planDecisionId,
      lineage: [{
        schema_version: 1,
        from_record_id: planRecordId,
        from_kind: "deployment_plan",
        from_version: 1,
        from_digest: digestCanonicalJson(plan),
        relationship: "realized_as",
        to_record_id: first.record_id,
        to_kind: "deployment",
        to_version: 1,
        to_digest: first.payload_digest,
        created_at: NOW
      }]
    })).resolves.toBe("created");

    const contender = {
      ...first,
      record_id: hexId("dep_", seed + 1),
      payload: deploymentPayload("second"),
      payload_digest: digestCanonicalJson(deploymentPayload("second"))
    };
    await expect(store.realizeDeployment({
      deployment: contender,
      planApprovalDecisionId: planDecisionId,
      lineage: [{
        schema_version: 1,
        from_record_id: planRecordId,
        from_kind: "deployment_plan",
        from_version: 1,
        from_digest: digestCanonicalJson(plan),
        relationship: "realized_as",
        to_record_id: contender.record_id,
        to_kind: "deployment",
        to_version: 1,
        to_digest: contender.payload_digest,
        created_at: NOW
      }]
    })).rejects.toBeInstanceOf(PostgresExportStoreError);
    await expect(store.realizeDeployment({
      deployment: contender,
      planApprovalDecisionId: planDecisionId,
      lineage: [{
        schema_version: 1,
        from_record_id: planRecordId,
        from_kind: "deployment_plan",
        from_version: 1,
        from_digest: digestCanonicalJson(plan),
        relationship: "realized_as",
        to_record_id: contender.record_id,
        to_kind: "deployment",
        to_version: 1,
        to_digest: contender.payload_digest,
        created_at: NOW
      }]
    })).rejects.toMatchObject({ code: "DECISION_ALREADY_CONSUMED" });
  });
});
