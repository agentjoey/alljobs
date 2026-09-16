import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "../migrate";
import { confirmationFor } from "../confirmations";
import type { ReviewDecisionInput, ReviewRequest } from "../types";
import { PostgresReviewStore, ReviewStoreError } from "./reviews";

const NOW = "2026-09-16T09:00:00.000Z";
let fixture: CaphubTestPostgres;
let seed = 1;
let decisionSeed = 1;

function id(prefix: string, value: number): string {
  return `${prefix}${value.toString(16).repeat(32).slice(0, 32)}`;
}

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  const value = seed++;
  const base = {
    schema_version: 1 as const,
    id: id("rev_", value),
    review_kind: "candidate" as const,
    subject_id: id("cand_", value),
    subject_kind: "candidate" as const,
    subject_version: 1,
    subject_digest: value.toString(16).repeat(64).slice(0, 64),
    lock_version: 1,
    state: "WAITING_FOR_REVIEW" as const,
    approve_confirmation: `APPROVE CANDIDATE ${value.toString(16).repeat(8).slice(0, 8)}`,
    reject_confirmation: `REJECT CANDIDATE ${value.toString(16).repeat(8).slice(0, 8)}`,
    superseded_by_request_id: null,
    created_at: NOW,
    updated_at: NOW
  };
  return { ...base, ...overrides } as ReviewRequest;
}

function store(): PostgresReviewStore {
  return new PostgresReviewStore(fixture.pool, {
    clock: () => NOW,
    decisionId: () => id("dec_", decisionSeed++)
  });
}

function appStore(): PostgresReviewStore {
  return new PostgresReviewStore(fixture.appPool, {
    clock: () => NOW,
    decisionId: () => id("dec_", decisionSeed++)
  });
}

function decisionInput(
  review: ReviewRequest,
  overrides: Partial<ReviewDecisionInput> = {}
): ReviewDecisionInput {
  return {
    request_id: review.id,
    idempotency_key: `review.intent-20260916:${review.id.slice(-8)}-a`,
    expected_lock_version: review.lock_version,
    expected_subject_digest: review.subject_digest,
    action: "approve",
    confirmation: confirmationFor(review, "approve"),
    rationale: "",
    disposition: "build",
    ...overrides
  } as ReviewDecisionInput;
}

beforeAll(async () => {
  fixture = await startCaphubTestPostgres();
  await applyRegistryMigrations(fixture.pool);
}, 30_000);

afterAll(async () => {
  await fixture?.stop();
}, 30_000);

describe.sequential("PostgresReviewStore", () => {
  it("creates and replays an exact request without duplicating audit history", async () => {
    const reviews = store();
    const review = request();
    await expect(reviews.createRequest(review)).resolves.toBe("created");
    await expect(reviews.createRequest(review)).resolves.toBe("existing");
    await expect(reviews.getRequest(review.id)).resolves.toEqual(review);
    const audits = await fixture.pool.query<{ count: string }>(
      "SELECT count(*) FROM caphub.audit_events WHERE subject_id = $1 AND event_type = 'review.requested'",
      [review.subject_id]
    );
    expect(audits.rows[0]?.count).toBe("1");
  });

  it("returns an exact decision replay and rejects same-key different payload", async () => {
    const reviews = store();
    const review = request();
    await reviews.createRequest(review);
    const input = decisionInput(review);
    const first = await reviews.decide(input);
    await expect(reviews.decide(input)).resolves.toEqual(first);
    await expect(reviews.decide({ ...input, rationale: "changed" })).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT"
    });
    await expect(reviews.listDecisions(review.id)).resolves.toHaveLength(1);
  });

  it("returns the winner receipt for concurrent terminal decisions", async () => {
    const reviews = store();
    const review = request();
    await reviews.createRequest(review);
    const [left, right] = await Promise.allSettled([
      reviews.decide(decisionInput(review, { idempotency_key: `review.concurrent-${review.id.slice(-8)}-left` })),
      reviews.decide(decisionInput(review, { idempotency_key: `review.concurrent-${review.id.slice(-8)}-right` }))
    ]);
    expect([left, right].filter((result) => result.status === "fulfilled")).toHaveLength(2);
    if (left.status !== "fulfilled" || right.status !== "fulfilled") throw new Error("missing concurrent receipt");
    expect(left.value.decision.id).toBe(right.value.decision.id);
    await expect(reviews.listDecisions(review.id)).resolves.toHaveLength(1);
  });

  it("atomically supersedes older waiting requests for a newer subject version", async () => {
    const reviews = store();
    const first = request();
    await reviews.createRequest(first);
    const second = request({
      subject_id: first.subject_id,
      subject_version: 2,
      subject_digest: "e".repeat(64),
      approve_confirmation: first.approve_confirmation,
      reject_confirmation: first.reject_confirmation
    });
    await expect(reviews.createRequest(second)).resolves.toBe("created");
    await expect(reviews.getRequest(first.id)).resolves.toMatchObject({
      state: "SUPERSEDED",
      lock_version: 2,
      superseded_by_request_id: second.id
    });
    await expect(reviews.getRequest(second.id)).resolves.toMatchObject({ state: "WAITING_FOR_REVIEW" });
  });

  it("fails stale digest and lock attempts without writing a decision or audit", async () => {
    const reviews = store();
    const review = request();
    await reviews.createRequest(review);
    await expect(reviews.decide(decisionInput(review, {
      expected_subject_digest: "f".repeat(64)
    }))).rejects.toMatchObject({ code: "STALE_REVIEW" });
    await expect(reviews.decide(decisionInput(review, {
      idempotency_key: `review.stale-${review.id.slice(-8)}-lock`,
      expected_lock_version: 9
    }))).rejects.toMatchObject({ code: "STALE_REVIEW" });
    await expect(reviews.listDecisions(review.id)).resolves.toEqual([]);
  });

  it("records permanent rejection with hostile rationale as inert text", async () => {
    const reviews = store();
    const review = request();
    await reviews.createRequest(review);
    const rejected = await reviews.decide(decisionInput(review, {
      action: "reject",
      confirmation: confirmationFor(review, "reject"),
      rationale: "'; DROP TABLE caphub.review_requests; --",
      disposition: undefined
    }));
    expect(rejected.decision).toMatchObject({ action: "reject", actor: "human:owner" });
    await expect(reviews.decide(decisionInput(review, {
      idempotency_key: `review.after-reject-${review.id.slice(-8)}`
    }))).resolves.toMatchObject({ decision: { id: rejected.decision.id, action: "reject" } });
    await expect(reviews.getRequest(review.id)).resolves.toMatchObject({ state: "REJECTED", lock_version: 2 });
  });

  it("revokes only an unconsumed approval and permits a new unchanged request", async () => {
    const reviews = store();
    const review = request();
    await reviews.createRequest(review);
    const approval = await reviews.decide(decisionInput(review));
    const revoked = await reviews.revoke(decisionInput(review, {
      idempotency_key: `review.revoke-${review.id.slice(-8)}`,
      expected_lock_version: 2,
      action: "revoke",
      confirmation: confirmationFor(review, "revoke"),
      rationale: "Owner changed direction",
      disposition: undefined,
      original_approval_decision_id: approval.decision.id
    }));
    expect(revoked.decision).toMatchObject({
      action: "revoke",
      original_approval_decision_id: approval.decision.id,
      revokes_decision_id: approval.decision.id
    });
    const replacement = request({
      subject_id: review.subject_id,
      subject_version: review.subject_version,
      subject_digest: review.subject_digest,
      approve_confirmation: review.approve_confirmation,
      reject_confirmation: review.reject_confirmation
    });
    await expect(reviews.createRequest(replacement)).resolves.toBe("created");
  });

  it("revokes and consumes through the least-privileged application role", async () => {
    const reviews = appStore();
    const revocable = request();
    await reviews.createRequest(revocable);
    const approval = await reviews.decide(decisionInput(revocable));
    await expect(reviews.revoke(decisionInput(revocable, {
      idempotency_key: `review.app-revoke-${revocable.id.slice(-8)}`,
      expected_lock_version: 2,
      action: "revoke",
      confirmation: confirmationFor(revocable, "revoke"),
      rationale: "Application-role revocation",
      disposition: undefined,
      original_approval_decision_id: approval.decision.id
    }))).resolves.toMatchObject({ decision: { action: "revoke" } });

    const consumable = request();
    await reviews.createRequest(consumable);
    const consumed = await reviews.decide(decisionInput(consumable));
    await expect(reviews.consumeDecision(consumed.decision.id, id("bld_", seed++))).resolves.toBeUndefined();
  });

  it("reports only the safe consumer ID when a consumed approval cannot be revoked", async () => {
    const reviews = store();
    const review = request();
    await reviews.createRequest(review);
    const approval = await reviews.decide(decisionInput(review));
    const consumerId = id("rel_", seed++);
    await reviews.consumeDecision(approval.decision.id, consumerId);
    await expect(reviews.consumeDecision(approval.decision.id, consumerId)).resolves.toBeUndefined();
    await expect(reviews.revoke(decisionInput(review, {
      idempotency_key: `review.consumed-revoke-${review.id.slice(-8)}`,
      expected_lock_version: 2,
      action: "revoke",
      confirmation: confirmationFor(review, "revoke"),
      rationale: "Too late",
      disposition: undefined,
      original_approval_decision_id: approval.decision.id
    }))).rejects.toMatchObject({
      code: "DECISION_ALREADY_CONSUMED",
      consumedBy: consumerId,
      message: "Approval decision has already been consumed"
    });
  });

  it("rejects malformed decisions before touching PostgreSQL", async () => {
    const reviews = store();
    const review = request();
    await reviews.createRequest(review);
    await expect(reviews.decide(decisionInput(review, {
      action: "reject",
      confirmation: confirmationFor(review, "reject"),
      rationale: "",
      disposition: undefined
    }))).rejects.toBeInstanceOf(ReviewStoreError);
    await expect(reviews.listDecisions(review.id)).resolves.toEqual([]);
  });
});
