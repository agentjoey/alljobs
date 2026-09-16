import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { canonicalJson } from "../../analysis/digest";
import { sha256DigestSchema } from "../../analysis/schemas";
import { capabilityPackageSchema, deploymentPlanSchema } from "../../packages/schemas";
import type {
  ComposeDeploymentPlanInput,
  ComposeReleaseInput,
  FinalizeReleaseInput,
  RealizeDeploymentInput,
  RegistryExportStore
} from "../contracts";
import {
  registryLineageEdgeSchema,
  registryRecordIdSchema,
  reviewRequestSchema
} from "../schemas";
import type {
  RegistryLineageEdge,
  RegistrySafeErrorCode,
  RegistryVersion,
  ReviewRequest
} from "../types";
import { withSerializableRegistryTransaction } from "./database";
import { validateRegistryVersion, type RegistryPayloadSchemas } from "./records";
import { reviewRequestRowToDomain, type ReviewRequestRow } from "./reviews";

export type PostgresExportStoreErrorCode =
  | RegistrySafeErrorCode
  | "INVALID_REVIEW_DECISION"
  | "STALE_WRITE"
  | "REGISTRY_DIGEST_CONFLICT"
  | "INVALID_REGISTRY_RECORD"
  | "LINEAGE_CONFLICT";

const EXPORT_ERROR_MESSAGES: Partial<Record<PostgresExportStoreErrorCode, string>> = {
  STALE_REVIEW: "Review state is stale",
  REVIEW_ALREADY_TERMINAL: "Review request already has a terminal decision",
  DECISION_ALREADY_CONSUMED: "Approval decision has already been consumed",
  INVALID_REVIEW_DECISION: "Review decision is invalid",
  REGISTRY_UNAVAILABLE: "Registry storage is unavailable",
  STALE_WRITE: "Registry record version is stale",
  REGISTRY_DIGEST_CONFLICT: "Registry record digest conflicts with immutable state",
  INVALID_REGISTRY_RECORD: "Registry record is invalid",
  LINEAGE_CONFLICT: "Registry lineage is invalid"
};

export class PostgresExportStoreError extends Error {
  constructor(
    readonly code: PostgresExportStoreErrorCode,
    readonly consumedBy: string | null = null
  ) {
    super(EXPORT_ERROR_MESSAGES[code] ?? "Registry export failed");
    this.name = "PostgresExportStoreError";
  }
}

export const deploymentRecordPayloadSchema = z.object({
  schema_version: z.literal(1),
  action: z.enum(["publish", "rollback"]),
  target: z.enum(["codex", "claude", "hermes", "obsidian"]),
  target_alias: z.string().min(1).max(64),
  release: z.object({
    record_id: z.string().regex(/^rel_[a-f0-9]{32}$/),
    version: z.number().int().positive(),
    digest: sha256DigestSchema
  }).strict(),
  plan: z.object({
    record_id: z.string().regex(/^dpl_[a-f0-9]{32}$/),
    version: z.number().int().positive(),
    digest: sha256DigestSchema
  }).strict(),
  prior_pointer: z.object({
    deployment_id: z.string().regex(/^dep_[a-f0-9]{32}$/),
    release_id: z.string().regex(/^rel_[a-f0-9]{32}$/),
    release_version: z.number().int().positive(),
    release_digest: sha256DigestSchema,
    pointer_digest: sha256DigestSchema
  }).strict().nullable(),
  created_at: z.string().datetime({ offset: true })
}).strict();

const EXPORT_PAYLOAD_SCHEMAS: RegistryPayloadSchemas = {
  release: capabilityPackageSchema,
  deployment_plan: deploymentPlanSchema,
  deployment: deploymentRecordPayloadSchema
};

function isoTimestamp(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new PostgresExportStoreError("INVALID_REGISTRY_RECORD");
  return parsed.toISOString();
}

function digestText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function auditId(seed: string): string {
  return `rae_${digestText(seed).slice(0, 32)}`;
}

function isSerializationFailure(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (String((error as { code: unknown }).code) === "40001"
      || String((error as { code: unknown }).code) === "40P01"
      || String((error as { code: unknown }).code) === "23505");
}

async function insertAudit(
  client: PoolClient,
  input: {
    id: string;
    type: "review.requested" | "review.consumed";
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
    VALUES ($1, $2, 'system:caphub', $3, $4, $5, $6::jsonb, $7)
    ON CONFLICT (event_id) DO NOTHING
  `, [input.id, input.type, input.subjectId, input.subjectVersion,
    input.decisionId, canonicalJson(input.metadata as never), input.occurredAt]);
}

async function insertVersion(client: PoolClient, input: RegistryVersion): Promise<"created" | "existing"> {
  const version = validateRegistryVersion(input, EXPORT_PAYLOAD_SCHEMAS);
  const current = await client.query<{ current_version: number; kind: string }>(
    "SELECT current_version, kind FROM caphub.registry_records WHERE record_id = $1 FOR UPDATE",
    [version.record_id]
  );
  if (current.rowCount === 0) {
    if (version.version !== 1 || version.previous_version !== null) {
      throw new PostgresExportStoreError("STALE_WRITE");
    }
    await client.query(
      `INSERT INTO caphub.registry_records
        (record_id, kind, current_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [version.record_id, version.kind, version.version, version.created_at]
    );
    await insertVersionRow(client, version);
    return "created";
  }

  if (current.rows[0]?.kind !== version.kind) throw new PostgresExportStoreError("REGISTRY_DIGEST_CONFLICT");
  const existing = await selectVersionRow(client, version.record_id, version.version);
  if (existing) {
    if (canonicalJson(existing) !== canonicalJson(version)) {
      throw new PostgresExportStoreError("REGISTRY_DIGEST_CONFLICT");
    }
    return "existing";
  }

  const currentVersion = current.rows[0]?.current_version;
  if (version.version !== currentVersion + 1 || version.previous_version !== currentVersion) {
    throw new PostgresExportStoreError("STALE_WRITE");
  }
  await insertVersionRow(client, version);
  await client.query(
    `UPDATE caphub.registry_records
     SET current_version = $2, updated_at = $3
     WHERE record_id = $1 AND current_version = $4`,
    [version.record_id, version.version, version.created_at, currentVersion]
  );
  return "created";
}

async function insertVersionRow(client: PoolClient, version: RegistryVersion): Promise<void> {
  await client.query(
    `INSERT INTO caphub.registry_versions
      (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
    [version.record_id, version.version, version.kind, version.schema_version,
      canonicalJson(version.payload), version.payload_digest, version.previous_version, version.created_at]
  );
}

interface VersionRow {
  record_id: string;
  version: number;
  kind: string;
  schema_version: number;
  payload: unknown;
  payload_digest: string;
  previous_version: number | null;
  created_at: Date | string;
}

async function selectVersionRow(
  client: PoolClient,
  recordId: string,
  version: number
): Promise<RegistryVersion | null> {
  const result = await client.query<VersionRow>(
    `SELECT record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at
     FROM caphub.registry_versions WHERE record_id = $1 AND version = $2`,
    [recordId, version]
  );
  const row = result.rows[0];
  if (!row) return null;
  return validateRegistryVersion({
    record_id: row.record_id,
    version: row.version,
    kind: row.kind,
    schema_version: row.schema_version,
    payload: row.payload,
    payload_digest: row.payload_digest,
    previous_version: row.previous_version,
    created_at: isoTimestamp(row.created_at)
  } as RegistryVersion, EXPORT_PAYLOAD_SCHEMAS);
}

async function insertLineage(client: PoolClient, input: RegistryLineageEdge): Promise<"created" | "existing"> {
  const parsed = registryLineageEdgeSchema.safeParse(input);
  if (!parsed.success) throw new PostgresExportStoreError("LINEAGE_CONFLICT");
  const edge = parsed.data;
  const inserted = await client.query(
    `INSERT INTO caphub.registry_lineage
      (from_node_id, from_kind, from_version, from_digest, relationship,
       to_node_id, to_kind, to_version, to_digest, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT DO NOTHING
     RETURNING from_node_id`,
    [edge.from_record_id, edge.from_kind, edge.from_version, edge.from_digest, edge.relationship,
      edge.to_record_id, edge.to_kind, edge.to_version, edge.to_digest, edge.created_at]
  );
  if (inserted.rowCount === 1) return "created";
  const existing = await client.query(
    `SELECT from_node_id FROM caphub.registry_lineage
     WHERE from_node_id=$1 AND from_version=$2 AND relationship=$3 AND to_node_id=$4 AND to_version=$5`,
    [edge.from_record_id, edge.from_version, edge.relationship, edge.to_record_id, edge.to_version]
  );
  if (existing.rowCount === 0) throw new PostgresExportStoreError("LINEAGE_CONFLICT");
  return "existing";
}

async function insertReviewRequest(client: PoolClient, input: ReviewRequest): Promise<"created" | "existing"> {
  const parsed = reviewRequestSchema.safeParse(input);
  if (!parsed.success || parsed.data.state !== "WAITING_FOR_REVIEW" || parsed.data.lock_version !== 1) {
    throw new PostgresExportStoreError("INVALID_REVIEW_DECISION");
  }
  const request = parsed.data;
  const existing = await client.query<ReviewRequestRow>(
    "SELECT * FROM caphub.review_requests WHERE request_id = $1 FOR UPDATE",
    [request.id]
  );
  if (existing.rows[0]) {
    if (canonicalJson(reviewRequestRowToDomain(existing.rows[0])) !== canonicalJson(request)) {
      throw new PostgresExportStoreError("IDEMPOTENCY_CONFLICT");
    }
    return "existing";
  }
  const prior = await client.query<{ state: string }>(`
    SELECT state FROM caphub.review_requests
    WHERE subject_id = $1 AND subject_version = $2 AND subject_digest = $3
    ORDER BY created_at DESC, request_id DESC
    LIMIT 1 FOR UPDATE
  `, [request.subject_id, request.subject_version, request.subject_digest]);
  if (prior.rows[0] && prior.rows[0].state !== "REVOKED") {
    throw new PostgresExportStoreError("REVIEW_ALREADY_TERMINAL");
  }
  const newer = await client.query<{ request_id: string }>(`
    SELECT request_id FROM caphub.review_requests
    WHERE subject_id = $1 AND subject_version > $2
    ORDER BY subject_version DESC, created_at DESC, request_id DESC
    LIMIT 1 FOR UPDATE
  `, [request.subject_id, request.subject_version]);
  if (newer.rows[0]) throw new PostgresExportStoreError("STALE_REVIEW");
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
    subjectId: request.subject_id,
    subjectVersion: request.subject_version,
    decisionId: null,
    metadata: { request_id: request.id, review_kind: request.review_kind },
    occurredAt: request.created_at
  });
  return "created";
}

interface DecisionRow {
  decision_id: string;
  request_id: string;
  action: string;
  subject_id: string;
  subject_version: number;
  recorded_at: Date | string;
}

async function lockApprovalDecision(client: PoolClient, decisionId: string): Promise<DecisionRow> {
  // No FOR UPDATE on the decision row: the app role holds no UPDATE grant on
  // the append-only review_decisions table. The review_requests row lock
  // serializes competing consumers/revokes, the decision_consumers primary
  // key admits exactly one winner, and SERIALIZABLE aborts stale readers.
  const result = await client.query<DecisionRow>(
    "SELECT decision_id, request_id, action, subject_id, subject_version, recorded_at FROM caphub.review_decisions WHERE decision_id = $1",
    [decisionId]
  );
  if (!result.rows[0]) throw new PostgresExportStoreError("INVALID_REVIEW_DECISION");
  const decision = result.rows[0];
  if (decision.action !== "approve") throw new PostgresExportStoreError("INVALID_REVIEW_DECISION");
  const request = await client.query<{ state: string }>(
    "SELECT state FROM caphub.review_requests WHERE request_id = $1 FOR UPDATE",
    [decision.request_id]
  );
  if (request.rows[0]?.state !== "APPROVED") {
    throw new PostgresExportStoreError("REVIEW_ALREADY_TERMINAL");
  }
  return decision;
}

async function consumeApproval(
  client: PoolClient,
  decision: DecisionRow,
  consumerId: string,
  clock: () => string
): Promise<"consumed" | "existing"> {
  if (!registryRecordIdSchema.safeParse(consumerId).success) {
    throw new PostgresExportStoreError("INVALID_REVIEW_DECISION");
  }
  const existing = await client.query<{ consumer_id: string }>(
    "SELECT consumer_id FROM caphub.decision_consumers WHERE decision_id = $1",
    [decision.decision_id]
  );
  if (existing.rows[0]) {
    if (existing.rows[0].consumer_id === consumerId) return "existing";
    throw new PostgresExportStoreError("DECISION_ALREADY_CONSUMED", existing.rows[0].consumer_id);
  }
  const consumedAt = clock();
  try {
    await client.query(
      "INSERT INTO caphub.decision_consumers (decision_id, consumer_id, consumed_at) VALUES ($1,$2,$3)",
      [decision.decision_id, consumerId, consumedAt]
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error
      && String((error as { code: unknown }).code) === "23505") {
      const winner = await client.query<{ consumer_id: string }>(
        "SELECT consumer_id FROM caphub.decision_consumers WHERE decision_id = $1",
        [decision.decision_id]
      );
      if (winner.rows[0]?.consumer_id === consumerId) return "existing";
      throw new PostgresExportStoreError("DECISION_ALREADY_CONSUMED", winner.rows[0]?.consumer_id ?? null);
    }
    throw error;
  }
  await insertAudit(client, {
    id: auditId(`${decision.decision_id}\0review.consumed`),
    type: "review.consumed",
    subjectId: decision.subject_id,
    subjectVersion: decision.subject_version,
    decisionId: decision.decision_id,
    metadata: { consumer_id: consumerId },
    occurredAt: consumedAt
  });
  return "consumed";
}

export interface PostgresExportStoreOptions {
  clock?: () => string;
}

export class PostgresExportStore implements RegistryExportStore {
  private readonly clock: () => string;

  constructor(
    private readonly pool: Pool,
    options: PostgresExportStoreOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  private async run<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    try {
      return await withSerializableRegistryTransaction(this.pool, operation);
    } catch (error) {
      if (isSerializationFailure(error)) {
        // A concurrent winner committed first; the identical retry resolves
        // through the idempotent "existing" paths.
        return withSerializableRegistryTransaction(this.pool, operation);
      }
      throw error;
    }
  }

  async composeRelease(input: ComposeReleaseInput): Promise<"created" | "existing"> {
    return this.run(async (client) => {
      const decision = await lockApprovalDecision(client, input.candidateApprovalDecisionId);
      let state: "created" | "existing" = "created";
      if ((await insertVersion(client, input.release)) === "existing") state = "existing";
      for (const edge of input.lineage) {
        if ((await insertLineage(client, edge)) === "existing") state = "existing";
      }
      if ((await insertReviewRequest(client, input.reviewRequest)) === "existing") state = "existing";
      if ((await consumeApproval(client, decision, input.release.record_id, this.clock)) === "existing") {
        state = "existing";
      }
      return state;
    });
  }

  async finalizeRelease(input: FinalizeReleaseInput): Promise<"finalized" | "existing"> {
    return this.run(async (client) => {
      const stored = await selectVersionRow(client, input.releaseRecordId, input.releaseVersion);
      if (!stored || stored.payload_digest !== input.releaseDigest) {
        throw new PostgresExportStoreError("STALE_WRITE");
      }
      const decision = await lockApprovalDecision(client, input.releaseApprovalDecisionId);
      const consumed = await consumeApproval(client, decision, input.releaseRecordId, this.clock);
      return consumed === "existing" ? "existing" : "finalized";
    });
  }

  async composeDeploymentPlan(input: ComposeDeploymentPlanInput): Promise<"created" | "existing"> {
    return this.run(async (client) => {
      let state: "created" | "existing" = "created";
      if ((await insertVersion(client, input.plan)) === "existing") state = "existing";
      for (const edge of input.lineage) {
        if ((await insertLineage(client, edge)) === "existing") state = "existing";
      }
      if ((await insertReviewRequest(client, input.reviewRequest)) === "existing") state = "existing";
      return state;
    });
  }

  async realizeDeployment(input: RealizeDeploymentInput): Promise<"created" | "existing"> {
    return this.run(async (client) => {
      const decision = await lockApprovalDecision(client, input.planApprovalDecisionId);
      let state: "created" | "existing" = "created";
      if ((await insertVersion(client, input.deployment)) === "existing") state = "existing";
      for (const edge of input.lineage) {
        if ((await insertLineage(client, edge)) === "existing") state = "existing";
      }
      if ((await consumeApproval(client, decision, input.deployment.record_id, this.clock)) === "existing") {
        state = "existing";
      }
      return state;
    });
  }
}
