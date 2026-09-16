import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AnalysisJob } from "../analysis/types";
import type { ReviewDecisionResult } from "./types";
import { createReviewDecisionService } from "./review-service";

const REQUEST_ID = `rev_${"1".repeat(32)}`;
const JOB_ID = `job_${"2".repeat(32)}`;
const CAPTURE_ID = `cap_${"3".repeat(32)}`;
const ARTIFACT_ID = `art_${"4".repeat(64)}`;
const NOW = "2026-09-16T12:00:00.000Z";

const waiting: AnalysisJob = {
  schema_version: 1,
  id: JOB_ID,
  capture_id: CAPTURE_ID,
  input_digest: "5".repeat(64),
  completed_artifact_ids: [ARTIFACT_ID],
  status: "WAITING_FOR_REVIEW",
  review_packet_artifact_id: ARTIFACT_ID,
  review_request_id: REQUEST_ID,
  waiting_at: NOW,
  created_at: NOW,
  updated_at: NOW
};

const result: ReviewDecisionResult = {
  decision: {
    schema_version: 1,
    id: `dec_${"6".repeat(32)}`,
    request_id: REQUEST_ID,
    idempotency_key: "review.intent-20260916:service",
    expected_lock_version: 1,
    expected_subject_digest: "7".repeat(64),
    action: "approve",
    confirmation: "APPROVE CANDIDATE 88888888",
    rationale: "",
    disposition: "build",
    review_kind: "candidate",
    subject_id: `cand_${"8".repeat(32)}`,
    subject_version: 1,
    subject_digest: "7".repeat(64),
    actor: "human:owner",
    confirmation_digest: "9".repeat(64),
    original_approval_decision_id: null,
    revokes_decision_id: null,
    recorded_at: NOW
  },
  authority: { state: "unconsumed", consumedBy: null, revocable: true }
};

describe("review decision service", () => {
  it("transitions the exact imported job to reviewed after the decision commits", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ manifest: {
        schema_version: 1,
        id: `imp_${"a".repeat(32)}`,
        source_review_packet_id: `rvp_${"b".repeat(32)}`,
        source_review_packet_digest: "c".repeat(64),
        records: [{ record_id: JOB_ID, kind: "analysis_job", version: 1, payload_digest: "d".repeat(64) }],
        review_request_id: REQUEST_ID,
        imported_at: NOW
      } }] })
    } as unknown as Pool;
    const reviews = {
      createRequest: vi.fn(), getRequest: vi.fn(), listDecisions: vi.fn(), revoke: vi.fn(),
      consumeDecision: vi.fn(), decide: vi.fn().mockResolvedValue(result)
    };
    const jobs = { get: vi.fn().mockResolvedValue(waiting), put: vi.fn() };
    const service = createReviewDecisionService({ pool, reviews, jobs, clock: () => NOW });
    const output = await service.decide(REQUEST_ID, {
      idempotency_key: result.decision.idempotency_key,
      expected_lock_version: 1,
      expected_subject_digest: result.decision.subject_digest,
      action: "approve",
      confirmation: result.decision.confirmation,
      rationale: "",
      disposition: "build"
    });
    expect(output.job).toMatchObject({
      status: "reviewed",
      review_request_id: REQUEST_ID,
      review_decision_id: result.decision.id,
      decision: { outcome: "approve", disposition: "build" }
    });
    expect(jobs.put).toHaveBeenCalledWith(output.job);
  });
});
