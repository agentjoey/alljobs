import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { capabilityCandidateSchema, reviewPacketSchema } from "../analysis/schemas";
import { researchDossierSchema } from "../analysis/schemas";
import { capabilityPackageSchema } from "../packages/schemas";
import { digestCanonicalJson } from "../analysis/digest";
import { confirmationFor } from "../registry/confirmations";
import type { RegistryExportStore } from "../registry/contracts";
import { applyRegistryMigrations } from "../registry/migrate";
import { PostgresExportStore } from "../registry/postgres/exports";
import { PostgresStageArtifactStore } from "../registry/postgres/caphub-stores";
import { PostgresRegistryLineageStore, PostgresRegistryRecordStore } from "../registry/postgres/records";
import { PostgresReviewStore, ReviewStoreError } from "../registry/postgres/reviews";
import type { RegistryVersion, ReviewRequest } from "../registry/types";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { composeCapabilityPackage, deriveReleaseId } from "./compose";
import { FIXTURE_DIGEST, FIXTURE_NOW, testCandidateVersion, testLicense, testReviewPacket } from "./fixtures";
import { ReleaseService, releaseReviewRequestId } from "./service";

const NOW = FIXTURE_NOW;

interface ReviewRequestRow {
  request_id: string;
  review_kind: string;
  subject_kind: string;
  subject_id: string;
  subject_version: number;
  subject_digest: string;
  lock_version: number;
  state: string;
  approve_confirmation: string;
  reject_confirmation: string;
  superseded_by_request_id: string | null;
  created_at: string;
  updated_at: string;
}

let fixture: CaphubTestPostgres;
let counter = 1;

function hexId(prefix: string, seed: number, length = 32): string {
  return `${prefix}${seed.toString(16).repeat(length).slice(0, length)}`;
}

function nextSeed(): number {
  return counter++;
}

function researchDossier(seed: number) {
  return researchDossierSchema.parse({
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
}

interface SeededCandidate {
  candidate: RegistryVersion;
  packet: RegistryVersion;
  candidateRequestId: string;
  candidateDecisionId: string;
  service: ReleaseService;
  reviews: PostgresReviewStore;
  records: PostgresRegistryRecordStore;
}

async function seedCandidate(pool: Pool, seed: number): Promise<SeededCandidate> {
  const records = new PostgresRegistryRecordStore(pool, {
    candidate: capabilityCandidateSchema,
    review_packet: reviewPacketSchema
  });
  const artifacts = new PostgresStageArtifactStore(pool);
  const dossier = researchDossier(seed);
  const artifact = await artifacts.create({
    jobId: hexId("job_", seed),
    captureId: `cap_${"2".repeat(32)}`,
    stage: "research",
    inputDigest: FIXTURE_DIGEST,
    payload: dossier,
    createdAt: NOW
  });

  const packetPayload = testReviewPacket({
    packet_id: `rvp_${seed.toString(16).repeat(32).slice(0, 32)}`,
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
  await records.putVersion(candidate);
  await records.putVersion(packet);

  const lineage = new PostgresRegistryLineageStore(pool);
  await lineage.put({
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

  const candidateRequestId = hexId("rev_", seed + 100);
  const candidateDecisionId = hexId("dec_", seed + 200);
  const shortId = candidate.record_id.slice(candidate.record_id.indexOf("_") + 1, candidate.record_id.indexOf("_") + 9);
  await pool.query(
    `INSERT INTO caphub.review_requests
      (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
       lock_version, state, approve_confirmation, reject_confirmation,
       superseded_by_request_id, created_at, updated_at)
     VALUES ($1, 'candidate', 'candidate', $2, 1, $3, 2, 'APPROVED',
       $4, $5, NULL, $6, $6)`,
    [candidateRequestId, candidate.record_id, candidate.payload_digest,
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
    [candidateDecisionId, candidateRequestId, `intent-candidate-${seed}`,
      candidate.payload_digest, `APPROVE CANDIDATE ${shortId}`, candidate.record_id, NOW]
  );

  const service = makeService(pool);
  return {
    candidate,
    packet,
    candidateRequestId,
    candidateDecisionId,
    service,
    reviews: new PostgresReviewStore(pool),
    records
  };
}

function makeService(pool: Pool): ReleaseService {
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

beforeAll(async () => {
  fixture = await startCaphubTestPostgres();
  await applyRegistryMigrations(fixture.pool);
}, 30_000);

afterAll(async () => {
  await fixture?.stop();
}, 30_000);

describe.sequential("Release candidate behavior (real PostgreSQL)", () => {
  it("turns an exact Candidate approval into an immutable Release with lineage and its own review", async () => {
    const seeded = await seedCandidate(fixture.appPool, nextSeed());
    const result = await seeded.service.createCandidate({
      candidateId: seeded.candidate.record_id,
      approvalDecisionId: seeded.candidateDecisionId
    });
    expect(result.status).toBe("created");

    const consumed = await fixture.pool.query(
      "SELECT consumer_id FROM caphub.decision_consumers WHERE decision_id = $1",
      [seeded.candidateDecisionId]
    );
    expect(consumed.rows).toEqual([{ consumer_id: result.release.record_id }]);

    const stored = await fixture.pool.query<{ payload: { release_id: string; kind: string } }>(
      "SELECT payload FROM caphub.registry_versions WHERE record_id = $1 AND version = 1",
      [result.release.record_id]
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]?.payload.release_id).toBe(result.release.record_id);

    const edges = await fixture.pool.query<{ relationship: string }>(
      "SELECT relationship FROM caphub.registry_lineage WHERE to_node_id = $1",
      [result.release.record_id]
    );
    expect(edges.rows).toEqual([{ relationship: "realized_as" }]);

    const review = await fixture.pool.query<{ state: string; review_kind: string }>(
      "SELECT state, review_kind FROM caphub.review_requests WHERE subject_id = $1",
      [result.release.record_id]
    );
    expect(review.rows).toEqual([{ state: "WAITING_FOR_REVIEW", review_kind: "release" }]);
  });

  it("returns the same Release on an identical retry without duplicating any record", async () => {
    const seeded = await seedCandidate(fixture.appPool, nextSeed());
    const first = await seeded.service.createCandidate({
      candidateId: seeded.candidate.record_id,
      approvalDecisionId: seeded.candidateDecisionId
    });
    const second = await seeded.service.createCandidate({
      candidateId: seeded.candidate.record_id,
      approvalDecisionId: seeded.candidateDecisionId
    });
    expect(second.status).toBe("existing");
    expect(second.release.record_id).toBe(first.release.record_id);

    for (const query of [
      ["SELECT count(*) FROM caphub.registry_versions WHERE record_id = $1", first.release.record_id],
      ["SELECT count(*) FROM caphub.decision_consumers WHERE decision_id = $1", seeded.candidateDecisionId]
    ] as const) {
      const result = await fixture.pool.query<{ count: string }>(query[0], [query[1]]);
      expect(result.rows[0]?.count).toBe("1");
    }
  });

  it("rolls back consumption, version, lineage, and review when a later step fails", async () => {
    const seeded = await seedCandidate(fixture.appPool, nextSeed());
    const composition = composeCapabilityPackage({
      candidateVersion: seeded.candidate,
      reviewPacket: seeded.packet.payload,
      disposition: "adopt",
      license: testLicense,
      now: NOW
    });
    if (!composition.ok) throw new Error("fixture composition failed");
    const release: RegistryVersion = {
      record_id: composition.pkg.release_id,
      kind: "release",
      version: 1,
      schema_version: 1,
      payload: composition.pkg,
      payload_digest: digestCanonicalJson(composition.pkg),
      previous_version: null,
      created_at: NOW
    };
    const requestId = releaseReviewRequestId(release);
    const shortId = release.record_id.slice(4, 12);
    await fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation,
         superseded_by_request_id, created_at, updated_at)
       VALUES ($1, 'release', 'release', $2, 1, $3, 1, 'WAITING_FOR_REVIEW',
         $4, $5, NULL, $6, $7)`,
      [requestId, release.record_id, release.payload_digest,
        `APPROVE RELEASE ${shortId}`, `REJECT RELEASE ${shortId}`, NOW,
        "2026-09-16T10:00:00.000Z"]
    );

    await expect(seeded.service.createCandidate({
      candidateId: seeded.candidate.record_id,
      approvalDecisionId: seeded.candidateDecisionId
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const version = await fixture.pool.query(
      "SELECT count(*) FROM caphub.registry_versions WHERE record_id = $1",
      [release.record_id]
    );
    expect(version.rows[0]?.count).toBe("0");
    const lineage = await fixture.pool.query(
      "SELECT count(*) FROM caphub.registry_lineage WHERE to_node_id = $1",
      [release.record_id]
    );
    expect(lineage.rows[0]?.count).toBe("0");
    const consumed = await fixture.pool.query(
      "SELECT count(*) FROM caphub.decision_consumers WHERE decision_id = $1",
      [seeded.candidateDecisionId]
    );
    expect(consumed.rows[0]?.count).toBe("0");
  });

  it("lets exactly one concurrent composition win for the same approval", async () => {
    const seeded = await seedCandidate(fixture.pool, nextSeed());
    const poolA = fixture.createAppPool("caphub_release_concurrent_a");
    const poolB = fixture.createAppPool("caphub_release_concurrent_b");
    try {
      const results = await Promise.all([
        makeService(poolA).createCandidate({
          candidateId: seeded.candidate.record_id,
          approvalDecisionId: seeded.candidateDecisionId
        }),
        makeService(poolB).createCandidate({
          candidateId: seeded.candidate.record_id,
          approvalDecisionId: seeded.candidateDecisionId
        })
      ]);
      expect(results.map((item) => item.status).sort()).toEqual(["created", "existing"]);
      expect(results[0]?.release.record_id).toBe(results[1]?.release.record_id);
      const versions = await fixture.pool.query(
        "SELECT count(*) FROM caphub.registry_versions WHERE record_id = $1",
        [results[0]?.release.record_id]
      );
      expect(versions.rows[0]?.count).toBe("1");
    } finally {
      await Promise.all([poolA.end(), poolB.end()]);
    }
  });

  it("finalizes the Release approval once and refuses revocation afterwards", async () => {
    const seeded = await seedCandidate(fixture.appPool, nextSeed());
    const { release } = await seeded.service.createCandidate({
      candidateId: seeded.candidate.record_id,
      approvalDecisionId: seeded.candidateDecisionId
    });

    const requestRow = await fixture.pool.query<ReviewRequestRow>(
      "SELECT * FROM caphub.review_requests WHERE subject_id = $1",
      [release.record_id]
    );
    const request = requestRow.rows[0];
    if (!request) throw new Error("release review request missing");

    const decision = await seeded.reviews.decide({
      request_id: request.request_id,
      idempotency_key: `intent-release-${release.record_id.slice(4, 12)}`,
      expected_lock_version: request.lock_version,
      expected_subject_digest: request.subject_digest,
      action: "approve",
      confirmation: request.approve_confirmation,
      rationale: "Package and evidence look right."
    });

    const finalized = await seeded.service.finalizeApproval({
      releaseId: release.record_id,
      approvalDecisionId: decision.decision.id
    });
    expect(finalized.status).toBe("finalized");
    await expect(seeded.service.finalizeApproval({
      releaseId: release.record_id,
      approvalDecisionId: decision.decision.id
    })).resolves.toEqual({ status: "existing" });

    await expect(seeded.reviews.revoke({
      request_id: request.request_id,
      idempotency_key: `intent-revoke-${release.record_id.slice(4, 12)}`,
      expected_lock_version: request.lock_version + 1,
      expected_subject_digest: request.subject_digest,
      action: "revoke",
      confirmation: confirmationFor({ review_kind: "release", subject_id: release.record_id }, "revoke"),
      rationale: "Attempt revoke after consumption.",
      original_approval_decision_id: decision.decision.id
    })).rejects.toBeInstanceOf(ReviewStoreError);
  });

  it("allows pre-finalization revocation, which then blocks finalization", async () => {
    const seeded = await seedCandidate(fixture.appPool, nextSeed());
    const { release } = await seeded.service.createCandidate({
      candidateId: seeded.candidate.record_id,
      approvalDecisionId: seeded.candidateDecisionId
    });

    const requestRow = await fixture.pool.query<ReviewRequestRow>(
      "SELECT * FROM caphub.review_requests WHERE subject_id = $1",
      [release.record_id]
    );
    const request = requestRow.rows[0];
    if (!request) throw new Error("release review request missing");

    const decision = await seeded.reviews.decide({
      request_id: request.request_id,
      idempotency_key: `intent-release-${release.record_id.slice(4, 12)}`,
      expected_lock_version: request.lock_version,
      expected_subject_digest: request.subject_digest,
      action: "approve",
      confirmation: request.approve_confirmation,
      rationale: "Approved for finalization."
    });

    await seeded.reviews.revoke({
      request_id: request.request_id,
      idempotency_key: `intent-revoke-${release.record_id.slice(4, 12)}`,
      expected_lock_version: request.lock_version + 1,
      expected_subject_digest: request.subject_digest,
      action: "revoke",
      confirmation: confirmationFor({ review_kind: "release", subject_id: release.record_id }, "revoke"),
      rationale: "Approval was a mistake.",
      original_approval_decision_id: decision.decision.id
    });

    await expect(seeded.service.finalizeApproval({
      releaseId: release.record_id,
      approvalDecisionId: decision.decision.id
    })).rejects.toMatchObject({ code: "REVIEW_ALREADY_TERMINAL" });
  });

  it("computes a Release identity that never depends on display titles or paths", () => {
    const packetA = testReviewPacket();
    const candidateA = testCandidateVersion(packetA);
    const releaseId = deriveReleaseId(candidateA, "adopt", undefined);
    expect(releaseId.startsWith("rel_")).toBe(true);
    // The identity inputs are the exact candidate version reference only;
    // a retitled candidate payload under the same version keeps the identity.
    const retitled = testCandidateVersion(testReviewPacket({
      candidate: {
        name: "Completely Different Name",
        novel_capabilities: ["extract tables from pdf"],
        overlapping_capabilities: [],
        replaces: [],
        complements: [],
        conflicts_with: [],
        capability_gaps: []
      }
    }));
    expect(deriveReleaseId({
      record_id: candidateA.record_id,
      version: candidateA.version,
      payload_digest: candidateA.payload_digest
    }, "adopt", undefined)).toBe(releaseId);
    expect(deriveReleaseId(retitled, "adopt", undefined)).not.toBe(releaseId);
  });
});
