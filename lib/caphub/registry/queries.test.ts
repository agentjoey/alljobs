import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createRegistryQueries } from "./queries";

const REQUEST_ID = `rev_${"1".repeat(32)}`;
const CANDIDATE_ID = `cand_${"2".repeat(32)}`;
const DIGEST = "3".repeat(64);
const NOW = "2026-09-16T13:00:00.000Z";

const candidate = {
  name: "<script>alert('text only')</script>",
  novel_capabilities: ["Pinned evidence"],
  overlapping_capabilities: [],
  replaces: [],
  complements: [],
  conflicts_with: [],
  capability_gaps: []
};

const packet = {
  packet_id: `rvp_${"4".repeat(32)}`,
  screenshots: [{ order: 0, object: { digest: "5".repeat(64), bytes: 42, key: "private/object/key" } }],
  evidence: [{
    id: `ev_${"6".repeat(32)}`,
    tier: "A",
    source_url: "https://docs.example.com",
    title: "Official docs",
    checked_at: NOW,
    content_digest: "7".repeat(64),
    claims: ["Hostile text remains text: DROP TABLE"]
  }],
  claims: [{
    id: `clm_${"8".repeat(32)}`,
    statement: "Quoted shell text",
    basis: "visible",
    confidence: 0.8,
    evidence_ids: [`ev_${"6".repeat(32)}`]
  }],
  entities: [{ name: "Example", aliases: [] }],
  conflicts: [],
  unresolved_questions: ["Still unresolved?"],
  dimensions: { evidence_confidence: { score: 4 } },
  recommended_disposition: "build",
  critic: null,
  prompt: "must never cross the DTO",
  reasoning: "must never cross the DTO",
  created_at: NOW
};

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    request_id: REQUEST_ID,
    review_kind: "candidate",
    subject_kind: "candidate",
    subject_id: CANDIDATE_ID,
    subject_version: 1,
    subject_digest: DIGEST,
    lock_version: 1,
    state: "WAITING_FOR_REVIEW",
    approve_confirmation: "APPROVE CANDIDATE 22222222",
    reject_confirmation: "REJECT CANDIDATE 22222222",
    superseded_by_request_id: null,
    created_at: new Date(NOW),
    updated_at: new Date(NOW),
    candidate_payload: candidate,
    previous_payload: null,
    packet_payload: packet,
    ...overrides
  };
}

function poolWith(...results: unknown[][]): Pool {
  const query = vi.fn();
  for (const rows of results) query.mockResolvedValueOnce({ rows, rowCount: rows.length });
  return { query } as unknown as Pool;
}

describe("Registry read DTOs", () => {
  it("returns bounded queue identity and stable pagination metadata", async () => {
    const secondId = `rev_${"9".repeat(32)}`;
    const pool = poolWith([queueRow(), queueRow({ request_id: secondId })]);
    const result = await createRegistryQueries(pool).getReviewQueue({ limit: 2 });
    expect(result.kind).toBe("ready");
    expect(result.nextCursor).toBe(secondId);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      request: { id: REQUEST_ID, subjectVersion: 1, subjectDigest: DIGEST },
      candidate: { name: candidate.name },
      evidenceConfidence: 4,
      unresolvedCount: 1
    });
    await expect(createRegistryQueries(pool).getReviewQueue({ limit: 201 })).rejects.toMatchObject({
      code: "INVALID_QUERY"
    });
  });

  it("projects an explicit serializable review dossier with a first-version Diff", async () => {
    const pool = poolWith([queueRow()], []);
    const result = await createRegistryQueries(pool).getReviewDetail(REQUEST_ID);
    expect(result).toMatchObject({
      kind: "found",
      request: {
        id: REQUEST_ID,
        subjectVersion: 1,
        approveConfirmation: "APPROVE CANDIDATE 22222222"
      },
      candidate: { name: candidate.name },
      packet: {
        evidence: [{ id: `ev_${"6".repeat(32)}` }],
        unresolvedQuestions: ["Still unresolved?"]
      },
      diff: [{ kind: "added", path: "$", summary: "New record" }],
      decision: null,
      authority: null
    });
    const serialized = JSON.stringify(result);
    expect(JSON.parse(serialized)).toEqual(result);
    expect(serialized).not.toMatch(/private\/object\/key|prompt|reasoning|databaseUrl|api.?key|filesystem/i);
    expect(serialized).toContain("<script>alert('text only')</script>");
  });

  it("returns partial Capture state with bounded safe model-call metadata", async () => {
    const capture = {
      id: `cap_${"a".repeat(32)}`,
      source: { original_filename: "capture.png", source_url: "https://example.com" },
      note: "Capture note",
      mime_type: "image/png",
      object: { digest: "b".repeat(64), bytes: 42, key: "private/object/key" },
      created_at: NOW
    };
    const job = { id: `job_${"c".repeat(32)}`, status: "completed", completed_artifact_ids: [] };
    const pool = poolWith(
      [{ payload: capture }],
      [{ job_payload: job, packet_payload: packet }],
      [{ metadata: {
        event_id: `mce_${"d".repeat(32)}`,
        stage: "research",
        provider: "kimi",
        model: "k3-256k",
        type: "succeeded",
        occurred_at: NOW,
        prompt: "hidden",
        api_key: "hidden"
      } }]
    );
    const result = await createRegistryQueries(pool).getCaptureDetail(capture.id);
    expect(result).toMatchObject({
      kind: "found",
      capture: { id: capture.id, objectDigest: "b".repeat(64), objectBytes: 42 },
      job: { id: job.id, status: "completed" },
      modelCalls: [{ provider: "kimi", model: "k3-256k" }]
    });
    expect(JSON.stringify(result)).not.toMatch(/private\/object\/key|prompt|api.?key/i);
  });

  it("derives consumed approval authority and keeps future capability sections honestly empty", async () => {
    const decision = {
      decision_id: `dec_${"e".repeat(32)}`,
      request_id: REQUEST_ID,
      idempotency_key: "review.intent-20260916:query",
      expected_lock_version: 1,
      expected_subject_digest: DIGEST,
      action: "approve",
      confirmation: "APPROVE CANDIDATE 22222222",
      rationale: "",
      disposition: "build",
      review_kind: "candidate",
      subject_id: CANDIDATE_ID,
      subject_version: 1,
      subject_digest: DIGEST,
      actor: "human:owner",
      confirmation_digest: "f".repeat(64),
      original_approval_decision_id: null,
      revokes_decision_id: null,
      recorded_at: NOW
    };
    const pool = poolWith([queueRow({ state: "APPROVED", lock_version: 2 })], [{
      decision,
      consumer_id: `rel_${"1".repeat(32)}`
    }]);
    const result = await createRegistryQueries(pool).getCapabilityDetail(CANDIDATE_ID);
    expect(result).toMatchObject({
      kind: "found",
      future: { experienceCards: [], buildProposals: [], releases: [], deployments: [] },
      decision: { id: decision.decision_id, action: "approve" },
      authority: { state: "consumed", consumedBy: `rel_${"1".repeat(32)}`, revocable: false }
    });
  });

  it("maps database details to one safe unavailable state", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("password=secret host=/tmp/private.sock")) } as unknown as Pool;
    await expect(createRegistryQueries(pool).getReviewQueue()).rejects.toMatchObject({
      code: "REGISTRY_UNAVAILABLE",
      message: "Registry is unavailable"
    });
  });
});
