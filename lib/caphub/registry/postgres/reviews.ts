import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { canonicalJson } from "../../analysis/digest";
import type { ReviewStore } from "../contracts";
import { confirmationFor } from "../confirmations";
import {
  registryRecordIdSchema,
  reviewDecisionIdSchema,
  reviewDecisionInputSchema,
  reviewDecisionResultSchema,
  reviewDecisionSchema,
  reviewRequestIdSchema,
  reviewRequestSchema
} from "../schemas";
import type {
  RegistrySafeErrorCode,
  ReviewDecision,
  ReviewDecisionAuthority,
  ReviewDecisionInput,
  ReviewDecisionResult,
  ReviewRequest
} from "../types";
import { mapRegistryDatabaseError, withSerializableRegistryTransaction } from "./database";

const REVIEW_ERROR_MESSAGES: Partial<Record<RegistrySafeErrorCode, string>> = {
  STALE_REVIEW: "Review state is stale",
  REVIEW_ALREADY_TERMINAL: "Review request already has a terminal decision",
  IDEMPOTENCY_CONFLICT: "Decision intent conflicts with an existing request",
  DECISION_ALREADY_CONSUMED: "Approval decision has already been consumed",
  INVALID_REVIEW_DECISION: "Review decision is invalid",
  REGISTRY_UNAVAILABLE: "Registry storage is unavailable"
};

export class ReviewStoreError extends Error {
  constructor(
    readonly code: RegistrySafeErrorCode,
    readonly consumedBy: string | null = null
  ) {
    super(REVIEW_ERROR_MESSAGES[code] ?? "Registry review failed");
    this.name = "ReviewStoreError";
  }
}

export interface ReviewRequestRow {
  request_id: string;
  review_kind: ReviewRequest["review_kind"];
  subject_kind: ReviewRequest["subject_kind"];
  subject_id: string;
  subject_version: number;
  subject_digest: string;
  lock_version: number;
  state: ReviewRequest["state"];
  approve_confirmation: string;
  reject_confirmation: string;
  superseded_by_request_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ReviewDecisionRow {
  decision_id: string;
  request_id: string;
  idempotency_key: string;
  expected_lock_version: number;
  expected_subject_digest: string;
  action: ReviewDecision["action"];
  confirmation: string;
  rationale: string;
  disposition: ReviewDecision["disposition"] | null;
  review_kind: ReviewDecision["review_kind"];
  subject_id: string;
  subject_version: number;
  subject_digest: string;
  actor: "human:owner";
  confirmation_digest: string;
  original_approval_decision_id: string | null;
  revokes_decision_id: string | null;
  recorded_at: Date | string;
}

function timestamp(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ReviewStoreError("INVALID_REVIEW_DECISION");
  return parsed.toISOString();
}

export function reviewRequestRowToDomain(row: ReviewRequestRow): ReviewRequest {
  return reviewRequestSchema.parse({
    schema_version: 1,
    id: row.request_id,
    review_kind: row.review_kind,
    subject_id: row.subject_id,
    subject_kind: row.subject_kind,
    subject_version: row.subject_version,
    subject_digest: row.subject_digest,
    lock_version: row.lock_version,
    state: row.state,
    approve_confirmation: row.approve_confirmation,
    reject_confirmation: row.reject_confirmation,
    superseded_by_request_id: row.superseded_by_request_id,
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at)
  });
}

function decisionFromRow(row: ReviewDecisionRow): ReviewDecision {
  return reviewDecisionSchema.parse({
    schema_version: 1,
    id: row.decision_id,
    request_id: row.request_id,
    idempotency_key: row.idempotency_key,
    expected_lock_version: row.expected_lock_version,
    expected_subject_digest: row.expected_subject_digest,
    action: row.action,
    confirmation: row.confirmation,
    rationale: row.rationale,
    ...(row.disposition ? { disposition: row.disposition } : {}),
    review_kind: row.review_kind,
    subject_id: row.subject_id,
    subject_version: row.subject_version,
    subject_digest: row.subject_digest,
    actor: row.actor,
    confirmation_digest: row.confirmation_digest,
    original_approval_decision_id: row.original_approval_decision_id,
    revokes_decision_id: row.revokes_decision_id,
    recorded_at: timestamp(row.recorded_at)
  });
}

function decisionInputFromStored(decision: ReviewDecision): ReviewDecisionInput {
  return reviewDecisionInputSchema.parse({
    request_id: decision.request_id,
    idempotency_key: decision.idempotency_key,
    expected_lock_version: decision.expected_lock_version,
    expected_subject_digest: decision.expected_subject_digest,
    action: decision.action,
    confirmation: decision.confirmation,
    rationale: decision.rationale,
    ...(decision.disposition ? { disposition: decision.disposition } : {}),
    ...(decision.original_approval_decision_id
      ? { original_approval_decision_id: decision.original_approval_decision_id }
      : {})
  });
}

function digestText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function auditId(seed: string): string {
  return `rae_${digestText(seed).slice(0, 32)}`;
}

async function insertAudit(
  client: PoolClient,
  input: {
    id: string;
    type: "review.requested" | "review.decided" | "review.revoked" | "review.consumed";
    actor: "system:caphub" | "human:owner";
    subjectId: string;
    subjectVersion: number;
    decisionId: string | null;
    metadata: unknown;
    occurredAt: string;
  }
): Promise<void> {
  await client.query(`
    INSERT INTO caphub.audit_events
      (event_id, event_type, actor, subject_id, subject_version, decision_id, metadata, occurred_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
  `, [input.id, input.type, input.actor, input.subjectId, input.subjectVersion,
    input.decisionId, canonicalJson(input.metadata), input.occurredAt]);
}

function mapReviewError(error: unknown): ReviewStoreError {
  if (error instanceof ReviewStoreError) return error;
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code === "40001" || code === "40P01") return new ReviewStoreError("STALE_REVIEW");
    if (code.startsWith("23")) return new ReviewStoreError("INVALID_REVIEW_DECISION");
  }
  const safe = mapRegistryDatabaseError(error);
  return new ReviewStoreError(safe.code === "STALE_WRITE" ? "STALE_REVIEW" : "REGISTRY_UNAVAILABLE");
}

export interface PostgresReviewStoreOptions {
  clock?: () => string;
  decisionId?: () => string;
}

export class PostgresReviewStore implements ReviewStore {
  private readonly clock: () => string;
  private readonly decisionId: () => string;

  constructor(private readonly pool: Pool, options: PostgresReviewStoreOptions = {}) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.decisionId = options.decisionId ?? (() => `dec_${randomUUID().replaceAll("-", "")}`);
  }

  async createRequest(input: ReviewRequest): Promise<"created" | "existing"> {
    const request = reviewRequestSchema.parse(input);
    if (request.state !== "WAITING_FOR_REVIEW" || request.lock_version !== 1) {
      throw new ReviewStoreError("INVALID_REVIEW_DECISION");
    }
    try {
      return await withSerializableRegistryTransaction(this.pool, async (client) => {
        const existing = await client.query<ReviewRequestRow>(
          "SELECT * FROM caphub.review_requests WHERE request_id = $1 FOR UPDATE",
          [request.id]
        );
        if (existing.rows[0]) {
          if (canonicalJson(reviewRequestRowToDomain(existing.rows[0])) !== canonicalJson(request)) {
            throw new ReviewStoreError("IDEMPOTENCY_CONFLICT");
          }
          return "existing";
        }
        const prior = await client.query<{ state: ReviewRequest["state"] }>(`
          SELECT state FROM caphub.review_requests
          WHERE subject_id = $1 AND subject_version = $2 AND subject_digest = $3
          ORDER BY created_at DESC, request_id DESC
          LIMIT 1 FOR UPDATE
        `, [request.subject_id, request.subject_version, request.subject_digest]);
        if (prior.rows[0] && prior.rows[0].state !== "REVOKED") {
          throw new ReviewStoreError("REVIEW_ALREADY_TERMINAL");
        }
        const newer = await client.query<{ request_id: string }>(`
          SELECT request_id FROM caphub.review_requests
          WHERE subject_id = $1 AND subject_version > $2
          ORDER BY subject_version DESC, created_at DESC, request_id DESC
          LIMIT 1 FOR UPDATE
        `, [request.subject_id, request.subject_version]);
        if (newer.rows[0]) throw new ReviewStoreError("STALE_REVIEW");
        await client.query(`
          SELECT request_id FROM caphub.review_requests
          WHERE subject_id = $1 AND subject_version < $2 AND state = 'WAITING_FOR_REVIEW'
          ORDER BY subject_version, created_at, request_id
          FOR UPDATE
        `, [request.subject_id, request.subject_version]);
        await client.query(`
          INSERT INTO caphub.review_requests
            (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
             lock_version, state, approve_confirmation, reject_confirmation,
             superseded_by_request_id, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [request.id, request.review_kind, request.subject_kind, request.subject_id,
          request.subject_version, request.subject_digest, request.lock_version, request.state,
          request.approve_confirmation, request.reject_confirmation, request.superseded_by_request_id,
          request.created_at, request.updated_at]);
        await client.query(`
          UPDATE caphub.review_requests
          SET state = 'SUPERSEDED', superseded_by_request_id = $3,
              lock_version = lock_version + 1, updated_at = $4
          WHERE subject_id = $1 AND subject_version < $2 AND state = 'WAITING_FOR_REVIEW'
        `, [request.subject_id, request.subject_version, request.id, request.created_at]);
        await insertAudit(client, {
          id: auditId(`${request.id}\0review.requested`),
          type: "review.requested",
          actor: "system:caphub",
          subjectId: request.subject_id,
          subjectVersion: request.subject_version,
          decisionId: null,
          metadata: { request_id: request.id, review_kind: request.review_kind },
          occurredAt: request.created_at
        });
        return "created";
      });
    } catch (error) {
      throw mapReviewError(error);
    }
  }

  async getRequest(requestId: string): Promise<ReviewRequest | null> {
    if (!reviewRequestIdSchema.safeParse(requestId).success) {
      throw new ReviewStoreError("INVALID_REVIEW_DECISION");
    }
    try {
      const result = await this.pool.query<ReviewRequestRow>(
        "SELECT * FROM caphub.review_requests WHERE request_id = $1",
        [requestId]
      );
      return result.rows[0] ? reviewRequestRowToDomain(result.rows[0]) : null;
    } catch (error) {
      throw mapReviewError(error);
    }
  }

  async getDecision(decisionId: string): Promise<ReviewDecision | null> {
    if (!reviewDecisionIdSchema.safeParse(decisionId).success) {
      throw new ReviewStoreError("INVALID_REVIEW_DECISION");
    }
    try {
      const result = await this.pool.query<ReviewDecisionRow>(
        "SELECT * FROM caphub.review_decisions WHERE decision_id = $1",
        [decisionId]
      );
      return result.rows[0] ? decisionFromRow(result.rows[0]) : null;
    } catch (error) {
      throw mapReviewError(error);
    }
  }

  async listDecisions(requestId: string): Promise<ReviewDecision[]> {
    if (!reviewRequestIdSchema.safeParse(requestId).success) {
      throw new ReviewStoreError("INVALID_REVIEW_DECISION");
    }
    try {
      const result = await this.pool.query<ReviewDecisionRow>(
        "SELECT * FROM caphub.review_decisions WHERE request_id = $1 ORDER BY recorded_at, decision_id",
        [requestId]
      );
      return result.rows.map(decisionFromRow);
    } catch (error) {
      throw mapReviewError(error);
    }
  }

  async listDecisionsForSubject(subjectId: string): Promise<ReviewDecision[]> {
    try {
      const result = await this.pool.query<ReviewDecisionRow>(`
        SELECT d.* FROM caphub.review_decisions d
        JOIN caphub.review_requests r ON r.request_id = d.request_id
        WHERE r.subject_id = $1
        ORDER BY d.recorded_at, d.decision_id
      `, [subjectId]);
      return result.rows.map(decisionFromRow);
    } catch (error) {
      throw mapReviewError(error);
    }
  }

  async getConsumption(decisionId: string): Promise<{ consumer_id: string } | null> {
    if (!reviewDecisionIdSchema.safeParse(decisionId).success) {
      throw new ReviewStoreError("INVALID_REVIEW_DECISION");
    }
    try {
      const result = await this.pool.query<{ consumer_id: string }>(
        "SELECT consumer_id FROM caphub.decision_consumers WHERE decision_id = $1",
        [decisionId]
      );
      return result.rows[0] ?? null;
    } catch (error) {
      throw mapReviewError(error);
    }
  }

  decide(input: ReviewDecisionInput): Promise<ReviewDecisionResult> {
    return this.writeDecision(input, false);
  }

  revoke(input: ReviewDecisionInput): Promise<ReviewDecisionResult> {
    return this.writeDecision(input, true);
  }

  private async resultFor(client: PoolClient, decision: ReviewDecision): Promise<ReviewDecisionResult> {
    if (decision.action !== "approve") {
      return reviewDecisionResultSchema.parse({ decision, authority: null });
    }
    const consumed = await client.query<{ consumer_id: string }>(
      "SELECT consumer_id FROM caphub.decision_consumers WHERE decision_id = $1",
      [decision.id]
    );
    const authority: ReviewDecisionAuthority = consumed.rows[0]
      ? { state: "consumed", consumedBy: consumed.rows[0].consumer_id, revocable: false }
      : { state: "unconsumed", consumedBy: null, revocable: true };
    return reviewDecisionResultSchema.parse({ decision, authority });
  }

  private async existingIntent(client: PoolClient, input: ReviewDecisionInput): Promise<ReviewDecisionResult | null> {
    const result = await client.query<ReviewDecisionRow>(
      "SELECT * FROM caphub.review_decisions WHERE idempotency_key = $1",
      [input.idempotency_key]
    );
    if (!result.rows[0]) return null;
    const decision = decisionFromRow(result.rows[0]);
    if (canonicalJson(decisionInputFromStored(decision)) !== canonicalJson(input)) {
      throw new ReviewStoreError("IDEMPOTENCY_CONFLICT");
    }
    return this.resultFor(client, decision);
  }

  private async terminalReceipt(
    client: Pick<PoolClient, "query">,
    input: ReviewDecisionInput
  ): Promise<ReviewDecisionResult | null> {
    const requestResult = await client.query<ReviewRequestRow>(
      "SELECT * FROM caphub.review_requests WHERE request_id = $1",
      [input.request_id]
    );
    const row = requestResult.rows[0];
    if (!row || row.subject_digest !== input.expected_subject_digest
      || row.lock_version !== input.expected_lock_version + 1
      || row.state === "WAITING_FOR_REVIEW") return null;
    const decisionResult = await client.query<ReviewDecisionRow>(`
      SELECT * FROM caphub.review_decisions
      WHERE request_id = $1
      ORDER BY recorded_at DESC, decision_id DESC
      LIMIT 1
    `, [input.request_id]);
    return decisionResult.rows[0]
      ? this.resultFor(client as PoolClient, decisionFromRow(decisionResult.rows[0]))
      : null;
  }

  private async writeDecision(raw: ReviewDecisionInput, requireRevoke: boolean): Promise<ReviewDecisionResult> {
    const parsed = reviewDecisionInputSchema.safeParse(raw);
    if (!parsed.success || (requireRevoke ? parsed.data.action !== "revoke" : parsed.data.action === "revoke")) {
      throw new ReviewStoreError("INVALID_REVIEW_DECISION");
    }
    const input = parsed.data;
    try {
      return await withSerializableRegistryTransaction(this.pool, async (client) => {
        const replay = await this.existingIntent(client, input);
        if (replay) return replay;

        const requestResult = await client.query<ReviewRequestRow>(
          "SELECT * FROM caphub.review_requests WHERE request_id = $1 FOR UPDATE",
          [input.request_id]
        );
        if (!requestResult.rows[0]) throw new ReviewStoreError("INVALID_REVIEW_DECISION");
        const request = reviewRequestRowToDomain(requestResult.rows[0]);
        if (request.subject_digest !== input.expected_subject_digest) {
          throw new ReviewStoreError("STALE_REVIEW");
        }

        const expectedOpenState = input.action === "revoke" ? "APPROVED" : "WAITING_FOR_REVIEW";
        if (request.state !== expectedOpenState) {
          const winner = await this.terminalReceipt(client, input);
          if (winner) return winner;
          throw new ReviewStoreError(
            request.lock_version === input.expected_lock_version ? "REVIEW_ALREADY_TERMINAL" : "STALE_REVIEW"
          );
        }
        if (request.lock_version !== input.expected_lock_version) throw new ReviewStoreError("STALE_REVIEW");

        const expectedConfirmation = confirmationFor(request, input.action);
        if (input.confirmation !== expectedConfirmation) {
          throw new ReviewStoreError("INVALID_REVIEW_DECISION");
        }

        let original: ReviewDecision | null = null;
        if (input.action === "revoke") {
          if (request.state !== "APPROVED" || !input.original_approval_decision_id) {
            throw new ReviewStoreError("REVIEW_ALREADY_TERMINAL");
          }
          const approval = await client.query<ReviewDecisionRow>(
            "SELECT * FROM caphub.review_decisions WHERE decision_id = $1 AND request_id = $2",
            [input.original_approval_decision_id, request.id]
          );
          if (!approval.rows[0]) throw new ReviewStoreError("INVALID_REVIEW_DECISION");
          original = decisionFromRow(approval.rows[0]);
          if (original.action !== "approve") throw new ReviewStoreError("INVALID_REVIEW_DECISION");
          const consumed = await client.query<{ consumer_id: string }>(
            "SELECT consumer_id FROM caphub.decision_consumers WHERE decision_id = $1",
            [original.id]
          );
          if (consumed.rows[0]) {
            throw new ReviewStoreError("DECISION_ALREADY_CONSUMED", consumed.rows[0].consumer_id);
          }
        }

        const recordedAt = this.clock();
        const decision = reviewDecisionSchema.parse({
          schema_version: 1,
          id: this.decisionId(),
          ...input,
          review_kind: request.review_kind,
          subject_id: request.subject_id,
          subject_version: request.subject_version,
          subject_digest: request.subject_digest,
          actor: "human:owner",
          confirmation_digest: digestText(input.confirmation),
          original_approval_decision_id: original?.id ?? null,
          revokes_decision_id: original?.id ?? null,
          recorded_at: recordedAt
        });
        await client.query(`
          INSERT INTO caphub.review_decisions
            (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
             action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
             subject_digest, actor, confirmation_digest, original_approval_decision_id,
             revokes_decision_id, recorded_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        `, [decision.id, decision.request_id, decision.idempotency_key, decision.expected_lock_version,
          decision.expected_subject_digest, decision.action, decision.confirmation, decision.rationale,
          decision.disposition ?? null, decision.review_kind, decision.subject_id, decision.subject_version,
          decision.subject_digest, decision.actor, decision.confirmation_digest,
          decision.original_approval_decision_id, decision.revokes_decision_id, decision.recorded_at]);
        const nextState = decision.action === "approve" ? "APPROVED"
          : decision.action === "reject" ? "REJECTED" : "REVOKED";
        await client.query(`
          UPDATE caphub.review_requests
          SET state = $2, lock_version = lock_version + 1, updated_at = $3
          WHERE request_id = $1
        `, [request.id, nextState, recordedAt]);
        await client.query(`
          INSERT INTO caphub.registry_lineage
            (from_node_id, from_kind, from_version, from_digest, relationship,
             to_node_id, to_kind, to_version, to_digest, created_at)
          VALUES ($1, 'review_request', 1, $2, 'decided_by', $3, 'review_decision', 1, $4, $5)
        `, [request.id, request.subject_digest, decision.id, decision.confirmation_digest, recordedAt]);
        await insertAudit(client, {
          id: auditId(`${decision.id}\0${decision.action}`),
          type: decision.action === "revoke" ? "review.revoked" : "review.decided",
          actor: "human:owner",
          subjectId: request.subject_id,
          subjectVersion: request.subject_version,
          decisionId: decision.id,
          metadata: { request_id: request.id, action: decision.action },
          occurredAt: recordedAt
        });
        return this.resultFor(client, decision);
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error
        && (String(error.code) === "40001" || String(error.code) === "40P01")) {
        try {
          const winner = await this.terminalReceipt(this.pool, input);
          if (winner) return winner;
        } catch {
          // Preserve the original bounded concurrency failure.
        }
      }
      throw mapReviewError(error);
    }
  }

  async consumeDecision(decisionId: string, consumerId: string): Promise<void> {
    if (!registryRecordIdSchema.safeParse(consumerId).success) {
      throw new ReviewStoreError("INVALID_REVIEW_DECISION");
    }
    try {
      await withSerializableRegistryTransaction(this.pool, async (client) => {
        const decisionResult = await client.query<ReviewDecisionRow>(
          "SELECT * FROM caphub.review_decisions WHERE decision_id = $1",
          [decisionId]
        );
        if (!decisionResult.rows[0]) throw new ReviewStoreError("INVALID_REVIEW_DECISION");
        const decision = decisionFromRow(decisionResult.rows[0]);
        if (decision.action !== "approve") throw new ReviewStoreError("INVALID_REVIEW_DECISION");
        const request = await client.query<{ state: ReviewRequest["state"] }>(
          "SELECT state FROM caphub.review_requests WHERE request_id = $1 FOR UPDATE",
          [decision.request_id]
        );
        if (request.rows[0]?.state !== "APPROVED") {
          throw new ReviewStoreError("REVIEW_ALREADY_TERMINAL");
        }
        const existing = await client.query<{ consumer_id: string }>(
          "SELECT consumer_id FROM caphub.decision_consumers WHERE decision_id = $1",
          [decision.id]
        );
        if (existing.rows[0]) {
          if (existing.rows[0].consumer_id === consumerId) return;
          throw new ReviewStoreError("DECISION_ALREADY_CONSUMED", existing.rows[0].consumer_id);
        }
        const consumedAt = this.clock();
        await client.query(
          "INSERT INTO caphub.decision_consumers (decision_id, consumer_id, consumed_at) VALUES ($1,$2,$3)",
          [decision.id, consumerId, consumedAt]
        );
        await insertAudit(client, {
          id: auditId(`${decision.id}\0review.consumed`),
          type: "review.consumed",
          actor: "system:caphub",
          subjectId: decision.subject_id,
          subjectVersion: decision.subject_version,
          decisionId: decision.id,
          metadata: { consumer_id: consumerId },
          occurredAt: consumedAt
        });
      });
    } catch (error) {
      throw mapReviewError(error);
    }
  }
}
