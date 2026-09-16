import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { digestCanonicalJson } from "../analysis/digest";
import { applyRegistryMigrations } from "./migrate";
import { PostgresRegistryLineageStore, PostgresRegistryRecordStore } from "./postgres/records";
import { traceReleaseLineage } from "./lineage";
import type { RegistryLineageEdge, RegistryRecordKind, RegistryVersion } from "./types";

const NOW = "2026-09-16T06:45:00.000Z";
const payloadSchema = z.object({ schema_version: z.literal(1), label: z.string() }).strict();
const ids = {
  capture: `cap_${"1".repeat(32)}`,
  packet: `rvp_${"2".repeat(32)}`,
  evidence: `ev_${"3".repeat(32)}`,
  candidate: `cand_${"4".repeat(32)}`,
  release: `rel_${"5".repeat(32)}`,
  request: `rev_${"6".repeat(32)}`,
  decision: `dec_${"7".repeat(32)}`,
  staleRequest: `rev_${"8".repeat(32)}`,
  staleDecision: `dec_${"9".repeat(32)}`
};

function record(record_id: string, kind: RegistryRecordKind, label: string): RegistryVersion {
  const payload = { schema_version: 1 as const, label };
  return {
    record_id,
    kind,
    version: 1,
    schema_version: 1,
    payload,
    payload_digest: digestCanonicalJson(payload),
    previous_version: null,
    created_at: NOW
  };
}

function edge(from: RegistryVersion, relationship: RegistryLineageEdge["relationship"], to: RegistryVersion): RegistryLineageEdge {
  return {
    schema_version: 1,
    from_record_id: from.record_id,
    from_kind: from.kind,
    from_version: from.version,
    from_digest: from.payload_digest,
    relationship,
    to_record_id: to.record_id,
    to_kind: to.kind,
    to_version: to.version,
    to_digest: to.payload_digest,
    created_at: NOW
  };
}

describe.sequential("Registry release lineage", () => {
  let fixture: CaphubTestPostgres;
  let records: PostgresRegistryRecordStore;
  let lineage: PostgresRegistryLineageStore;
  const versions = {
    capture: record(ids.capture, "capture", "Capture"),
    packet: record(ids.packet, "review_packet", "Packet"),
    evidence: record(ids.evidence, "evidence", "Evidence"),
    candidate: record(ids.candidate, "candidate", "Candidate"),
    release: record(ids.release, "release", "Release")
  };

  beforeAll(async () => {
    fixture = await startCaphubTestPostgres();
    await applyRegistryMigrations(fixture.pool);
    records = new PostgresRegistryRecordStore(fixture.pool, {
      capture: payloadSchema,
      review_packet: payloadSchema,
      evidence: payloadSchema,
      candidate: payloadSchema,
      release: payloadSchema
    });
    lineage = new PostgresRegistryLineageStore(fixture.pool);
    for (const version of Object.values(versions)) await records.putVersion(version);
    await lineage.put(edge(versions.capture, "derived_as", versions.packet));
    await lineage.put(edge(versions.packet, "contains", versions.evidence));
    await lineage.put(edge(versions.packet, "proposes", versions.candidate));
    await lineage.put(edge(versions.candidate, "realized_as", versions.release));

    await fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation, superseded_by_request_id,
         created_at, updated_at)
       VALUES ($1, 'candidate', 'candidate', $2, 1, $3, 2, 'APPROVED',
         'APPROVE CANDIDATE 44444444', 'REJECT CANDIDATE 44444444', NULL, now(), now())`,
      [ids.request, ids.candidate, versions.candidate.payload_digest]
    );
    await fixture.pool.query(
      `INSERT INTO caphub.review_decisions
        (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
         action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
         subject_digest, actor, confirmation_digest, original_approval_decision_id,
         revokes_decision_id, recorded_at)
       VALUES ($1, $2, 'intent-lineage-0001', 1, $3, 'approve',
         'APPROVE CANDIDATE 44444444', '', 'build', 'candidate', $4, 1, $3,
         'human:owner', $5, NULL, NULL, now())`,
      [ids.decision, ids.request, versions.candidate.payload_digest, ids.candidate, "f".repeat(64)]
    );
    await lineage.put({
      schema_version: 1,
      from_record_id: ids.request,
      from_kind: "review_request",
      from_version: 1,
      from_digest: versions.candidate.payload_digest,
      relationship: "decided_by",
      to_record_id: ids.decision,
      to_kind: "review_decision",
      to_version: 1,
      to_digest: "f".repeat(64),
      created_at: NOW
    });

    await fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation, superseded_by_request_id,
         created_at, updated_at)
       VALUES ($1, 'candidate', 'candidate', $2, 2, $3, 1, 'REJECTED',
         'APPROVE CANDIDATE 44444444', 'REJECT CANDIDATE 44444444', NULL, now(), now())`,
      [ids.staleRequest, ids.candidate, "e".repeat(64)]
    );
    await fixture.pool.query(
      `INSERT INTO caphub.review_decisions
        (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
         action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
         subject_digest, actor, confirmation_digest, original_approval_decision_id,
         revokes_decision_id, recorded_at)
       VALUES ($1, $2, 'intent-lineage-stale-0002', 1, $3, 'reject',
         'REJECT CANDIDATE 44444444', 'Stale fixture', NULL, 'candidate', $4, 2, $3,
         'human:owner', $5, NULL, NULL, now())`,
      [ids.staleDecision, ids.staleRequest, "e".repeat(64), ids.candidate, "d".repeat(64)]
    );
  }, 30_000);

  afterAll(async () => {
    await fixture?.stop();
  }, 30_000);

  it("stores lineage idempotently and lists exact edges deterministically", async () => {
    const candidateRelease = edge(versions.candidate, "realized_as", versions.release);
    await expect(lineage.put(candidateRelease)).resolves.toBe("existing");
    await expect(lineage.listFrom(ids.packet, 1)).resolves.toEqual([
      edge(versions.packet, "contains", versions.evidence),
      edge(versions.packet, "proposes", versions.candidate)
    ]);
  });

  it("rejects dangling, digest-mismatched, self, and disallowed edges safely", async () => {
    await expect(lineage.put({
      ...edge(versions.candidate, "realized_as", versions.release),
      to_record_id: `rel_${"9".repeat(32)}`
    })).rejects.toMatchObject({ code: "LINEAGE_CONFLICT" });
    await expect(lineage.put({
      ...edge(versions.candidate, "realized_as", versions.release),
      to_digest: "0".repeat(64)
    })).rejects.toMatchObject({ code: "LINEAGE_CONFLICT" });
    await expect(lineage.put({
      ...edge(versions.candidate, "realized_as", versions.release),
      relationship: "contains"
    })).rejects.toMatchObject({ code: "LINEAGE_CONFLICT" });
    await expect(lineage.put({
      ...edge(versions.candidate, "realized_as", versions.release),
      to_record_id: versions.candidate.record_id,
      to_kind: versions.candidate.kind,
      to_digest: versions.candidate.payload_digest
    })).rejects.toMatchObject({ code: "LINEAGE_CONFLICT" });
  });

  it("traces a Release to exact Capture, Evidence, Candidate, and terminal decision in stable order", async () => {
    await expect(traceReleaseLineage(fixture.pool, ids.release)).resolves.toMatchObject({
      releaseId: ids.release,
      captureIds: [ids.capture],
      evidenceIds: [ids.evidence],
      candidateIds: [ids.candidate],
      decisionIds: [ids.decision],
      truncated: false
    });
    const first = await traceReleaseLineage(fixture.pool, ids.release);
    const second = await traceReleaseLineage(fixture.pool, ids.release);
    expect(second).toEqual(first);
    expect(first.nodes.every((node) => node.version === 1 && node.digest.length === 64)).toBe(true);
  });

  it("uses a fixed depth bound and rejects hostile IDs without SQL leakage", async () => {
    const bounded = await traceReleaseLineage(fixture.pool, ids.release, { maxDepth: 1 });
    expect(bounded).toMatchObject({
      truncated: true,
      captureIds: [],
      candidateIds: [ids.candidate]
    });
    const visibleNodes = new Set(bounded.nodes.map((node) => `${node.id}:${node.version}`));
    expect(bounded.edges.every((item) =>
      visibleNodes.has(`${item.from_record_id}:${item.from_version}`)
      && visibleNodes.has(`${item.to_record_id}:${item.to_version}`)
    )).toBe(true);
    await expect(traceReleaseLineage(fixture.pool, "rel_' OR 1=1 --"))
      .rejects.toMatchObject({ code: "LINEAGE_CONFLICT", message: "Registry lineage is invalid" });
  });
});
