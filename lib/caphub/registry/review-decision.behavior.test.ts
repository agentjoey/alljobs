import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { confirmationFor } from "./confirmations";
import { applyRegistryMigrations } from "./migrate";
import { PostgresAnalysisJobStore } from "./postgres/caphub-stores";
import { PostgresReviewStore } from "./postgres/reviews";
import { createReviewDecisionService } from "./review-service";
import type { ReviewRequest } from "./types";

const NOW = "2026-09-16T12:30:00.000Z";
const JOB_ID = `job_${"1".repeat(32)}`;
const CAPTURE_ID = `cap_${"2".repeat(32)}`;
const ARTIFACT_ID = `art_${"3".repeat(64)}`;
const REQUEST_ID = `rev_${"4".repeat(32)}`;
const CANDIDATE_ID = `cand_${"5".repeat(32)}`;
const PACKET_ID = `rvp_${"6".repeat(32)}`;
const DIGEST = "7".repeat(64);

describe.sequential("real review decision boundary", () => {
  let postgres: CaphubTestPostgres;
  let service: ReturnType<typeof createReviewDecisionService>;

  beforeAll(async () => {
    postgres = await startCaphubTestPostgres();
    await applyRegistryMigrations(postgres.pool);
    const jobs = new PostgresAnalysisJobStore(postgres.pool);
    const base = {
      schema_version: 1 as const,
      id: JOB_ID,
      capture_id: CAPTURE_ID,
      input_digest: "8".repeat(64),
      completed_artifact_ids: [] as string[],
      created_at: NOW
    };
    await jobs.put({ ...base, status: "queued", updated_at: NOW });
    await jobs.put({ ...base, status: "running", stage: "review_packet", started_at: NOW, updated_at: NOW });
    await jobs.put({
      ...base,
      completed_artifact_ids: [ARTIFACT_ID],
      status: "completed",
      review_packet_artifact_id: ARTIFACT_ID,
      completed_at: NOW,
      updated_at: NOW
    });
    await jobs.put({
      ...base,
      completed_artifact_ids: [ARTIFACT_ID],
      status: "WAITING_FOR_REVIEW",
      review_packet_artifact_id: ARTIFACT_ID,
      review_request_id: REQUEST_ID,
      waiting_at: NOW,
      updated_at: NOW
    });
    const reviews = new PostgresReviewStore(postgres.pool, {
      clock: () => NOW,
      decisionId: () => `dec_${"9".repeat(32)}`
    });
    const review = {
      schema_version: 1 as const,
      id: REQUEST_ID,
      review_kind: "candidate" as const,
      subject_id: CANDIDATE_ID,
      subject_kind: "candidate" as const,
      subject_version: 1,
      subject_digest: DIGEST,
      lock_version: 1,
      state: "WAITING_FOR_REVIEW" as const,
      approve_confirmation: "",
      reject_confirmation: "",
      superseded_by_request_id: null,
      created_at: NOW,
      updated_at: NOW
    };
    review.approve_confirmation = confirmationFor(review as ReviewRequest, "approve");
    review.reject_confirmation = confirmationFor(review as ReviewRequest, "reject");
    await reviews.createRequest(review as ReviewRequest);
    await postgres.pool.query(`
      INSERT INTO caphub.registry_imports
        (import_id, source_review_packet_id, source_review_packet_digest, manifest, review_request_id, imported_at)
      VALUES ($1,$2,$3,$4::jsonb,$5,$6)
    `, [
      `imp_${"a".repeat(32)}`,
      PACKET_ID,
      "b".repeat(64),
      JSON.stringify({
        schema_version: 1,
        id: `imp_${"a".repeat(32)}`,
        source_review_packet_id: PACKET_ID,
        source_review_packet_digest: "b".repeat(64),
        records: [{ record_id: JOB_ID, kind: "analysis_job", version: 4, payload_digest: "c".repeat(64) }],
        review_request_id: REQUEST_ID,
        imported_at: NOW
      }),
      REQUEST_ID,
      NOW
    ]);
    service = createReviewDecisionService({ pool: postgres.pool, reviews, jobs, clock: () => NOW });
  }, 30_000);

  afterAll(async () => {
    await postgres?.stop();
  }, 30_000);

  it("records one concurrent winner, advances the job, and creates no later-phase authority", async () => {
    const input = {
      expected_lock_version: 1,
      expected_subject_digest: DIGEST,
      action: "approve" as const,
      confirmation: "APPROVE CANDIDATE 55555555",
      rationale: "",
      disposition: "build" as const
    };
    const [left, right] = await Promise.allSettled([
      service.decide(REQUEST_ID, { ...input, idempotency_key: "review.behavior-concurrent-left" }),
      service.decide(REQUEST_ID, { ...input, idempotency_key: "review.behavior-concurrent-right" })
    ]);
    expect([left, right].filter((result) => result.status === "fulfilled")).toHaveLength(2);
    if (left.status !== "fulfilled" || right.status !== "fulfilled") throw new Error("missing concurrent receipt");
    expect(left.value.result.decision.id).toBe(right.value.result.decision.id);
    expect(left.value.job).toMatchObject({ status: "reviewed", review_decision_id: `dec_${"9".repeat(32)}` });

    const decisions = await postgres.pool.query<{ count: string }>("SELECT count(*) FROM caphub.review_decisions");
    const audits = await postgres.pool.query<{ count: string }>(
      "SELECT count(*) FROM caphub.audit_events WHERE event_type = 'review.decided'"
    );
    const forbidden = await postgres.pool.query<{ count: string }>(`
      SELECT count(*) FROM caphub.registry_records
      WHERE kind IN ('release', 'build_proposal', 'deployment')
    `);
    expect(decisions.rows[0]?.count).toBe("1");
    expect(audits.rows[0]?.count).toBe("1");
    expect(forbidden.rows[0]?.count).toBe("0");
  });
});
