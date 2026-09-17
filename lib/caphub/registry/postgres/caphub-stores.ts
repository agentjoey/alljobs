import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { analysisJobSchema, modelCallAuditEventSchema, stageArtifactSchema } from "../../analysis/schemas";
import { canonicalJson, digestCanonicalJson } from "../../analysis/digest";
import type { AnalysisJob, AnalysisStage, ModelCallAuditEvent, StageArtifact } from "../../analysis/types";
import { captureAuditEventSchema, captureRecordSchema, objectRefSchema } from "../../domain/schemas";
import type { CaptureAuditEvent, CaptureRecord } from "../../domain/types";
import type { CaptureAuditLog, CaptureStore } from "../../storage/contracts";
import { deterministicModelCallIds } from "../../workflow/audit";
import type {
  AnalysisJobStore,
  CreateStageArtifactInput,
  ReadableModelCallAuditStore,
  StageArtifactStore
} from "../../workflow/contracts";
import { registryJsonValueSchema, type RegistryJsonValue } from "../schemas";
import type { RegistryVersion } from "../types";
import { RegistryError, mapRegistryDatabaseError, withSerializableRegistryTransaction } from "./database";
import { PostgresRegistryRecordStore } from "./records";

export type PostgresCaphubStoreErrorCode =
  | "CAPTURE_DIGEST_CONFLICT"
  | "WORKFLOW_RECORD_CONFLICT"
  | "INVALID_WORKFLOW_TRANSITION";

export class PostgresCaphubStoreError extends Error {
  constructor(readonly code: PostgresCaphubStoreErrorCode) {
    super(code);
    this.name = "PostgresCaphubStoreError";
  }
}

interface CaptureRow { payload: CaptureRecord }

export class PostgresCaptureStore implements CaptureStore {
  constructor(private readonly pool: Pool) {}

  async get(id: string): Promise<CaptureRecord | null> {
    const parsedId = captureRecordSchema.shape.id.safeParse(id);
    if (!parsedId.success) throw new PostgresCaphubStoreError("CAPTURE_DIGEST_CONFLICT");
    try {
      const result = await this.pool.query<CaptureRow>(`
        SELECT v.payload
        FROM caphub.registry_records r
        JOIN caphub.registry_versions v
          ON v.record_id = r.record_id AND v.version = r.current_version
        WHERE r.record_id = $1 AND r.kind = 'capture'
      `, [parsedId.data]);
      return result.rows[0] ? captureRecordSchema.parse(result.rows[0].payload) : null;
    } catch (error) {
      if (error instanceof z.ZodError) throw new PostgresCaphubStoreError("CAPTURE_DIGEST_CONFLICT");
      throw mapRegistryDatabaseError(error);
    }
  }

  async findByIdempotencyKey(key: string): Promise<CaptureRecord | null> {
    try {
      const result = await this.pool.query<CaptureRow>(`
        SELECT v.payload
        FROM caphub.capture_idempotency i
        JOIN caphub.registry_records r ON r.record_id = i.capture_id
        JOIN caphub.registry_versions v
          ON v.record_id = r.record_id AND v.version = r.current_version
        WHERE i.idempotency_key = $1
      `, [key]);
      return result.rows[0] ? captureRecordSchema.parse(result.rows[0].payload) : null;
    } catch (error) {
      if (error instanceof z.ZodError) throw new PostgresCaphubStoreError("CAPTURE_DIGEST_CONFLICT");
      throw mapRegistryDatabaseError(error);
    }
  }

  async create(input: CaptureRecord): Promise<"created" | "conflict"> {
    const record = captureRecordSchema.parse(input);
    const digest = digestCanonicalJson(record);
    try {
      return await withSerializableRegistryTransaction(this.pool, async (client) => {
        // capture_idempotency is append-only, so the least-privileged app role
        // intentionally has no UPDATE grant and cannot SELECT ... FOR UPDATE.
        // Serialize the idempotency key without granting mutation authority.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('caphub.capture_idempotency'), hashtext($1))",
          [record.idempotency_key]
        );
        const keyed = await client.query<{ capture_id: string; request_digest: string }>(
          "SELECT capture_id, request_digest FROM caphub.capture_idempotency WHERE idempotency_key = $1",
          [record.idempotency_key]
        );
        if (keyed.rows[0]) return "conflict";

        const existing = await client.query<CaptureRow>(`
          SELECT v.payload
          FROM caphub.registry_records r
          JOIN caphub.registry_versions v
            ON v.record_id = r.record_id AND v.version = r.current_version
          WHERE r.record_id = $1 FOR UPDATE OF r
        `, [record.id]);
        if (existing.rows[0]) return "conflict";

        await client.query(`
          INSERT INTO caphub.registry_records
            (record_id, kind, current_version, created_at, updated_at)
          VALUES ($1, 'capture', 1, $2, $2)
        `, [record.id, record.created_at]);
        await client.query(`
          INSERT INTO caphub.registry_versions
            (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
          VALUES ($1, 1, 'capture', 1, $2::jsonb, $3, NULL, $4)
        `, [record.id, canonicalJson(record), digest, record.created_at]);
        await client.query(`
          INSERT INTO caphub.capture_idempotency
            (idempotency_key, request_digest, capture_id, created_at)
          VALUES ($1, $2, $3, $4)
        `, [record.idempotency_key, digest, record.id, record.created_at]);
        return "created";
      });
    } catch (error) {
      if (error instanceof RegistryError && (error.code === "STALE_WRITE" || error.code === "REGISTRY_DIGEST_CONFLICT")) {
        return "conflict";
      }
      if (error && typeof error === "object" && "code" in error && String(error.code).startsWith("23")) {
        return "conflict";
      }
      throw mapRegistryDatabaseError(error, "REGISTRY_DIGEST_CONFLICT");
    }
  }
}

const TERMINAL_JOB_STATES = new Set<AnalysisJob["status"]>(["reviewed", "failed", "HUMAN_REVIEW_REQUIRED"]);

function sameJobIdentity(left: AnalysisJob, right: AnalysisJob): boolean {
  return left.id === right.id
    && left.capture_id === right.capture_id
    && left.input_digest === right.input_digest
    && left.created_at === right.created_at
    && left.completed_artifact_ids.every((id, index) => right.completed_artifact_ids[index] === id)
    && right.completed_artifact_ids.length >= left.completed_artifact_ids.length;
}

function allowedJobTransition(previous: AnalysisJob, next: AnalysisJob): boolean {
  if (!sameJobIdentity(previous, next)) return false;
  if (canonicalJson(previous) === canonicalJson(next)) return true;
  if (TERMINAL_JOB_STATES.has(previous.status)) return false;
  const allowed: Record<AnalysisJob["status"], readonly AnalysisJob["status"][]> = {
    queued: ["running", "HUMAN_REVIEW_REQUIRED", "failed"],
    running: ["running", "completed", "HUMAN_REVIEW_REQUIRED", "failed"],
    completed: ["WAITING_FOR_REVIEW"],
    WAITING_FOR_REVIEW: ["reviewed"],
    reviewed: [],
    HUMAN_REVIEW_REQUIRED: [],
    failed: []
  };
  return allowed[previous.status].includes(next.status);
}

function versionFor(payload: RegistryJsonValue, kind: "analysis_job" | "analysis_artifact", id: string, version: number, createdAt: string): RegistryVersion {
  return {
    record_id: id,
    kind,
    version,
    schema_version: 1,
    payload,
    payload_digest: digestCanonicalJson(payload),
    previous_version: version === 1 ? null : version - 1,
    created_at: createdAt
  };
}

export class PostgresAnalysisJobStore implements AnalysisJobStore {
  private readonly records: PostgresRegistryRecordStore;

  constructor(pool: Pool) {
    this.records = new PostgresRegistryRecordStore(pool, { analysis_job: analysisJobSchema });
  }

  async get(id: string): Promise<AnalysisJob | null> {
    const current = await this.records.getCurrent(id);
    return current ? analysisJobSchema.parse(current.payload) : null;
  }

  async put(input: AnalysisJob): Promise<void> {
    const job = analysisJobSchema.parse(input);
    const current = await this.records.getCurrent(job.id);
    if (!current) {
      if (job.status !== "queued") throw new PostgresCaphubStoreError("INVALID_WORKFLOW_TRANSITION");
      await this.records.putVersion(versionFor(job, "analysis_job", job.id, 1, job.updated_at));
      return;
    }
    const previous = analysisJobSchema.parse(current.payload);
    if (canonicalJson(previous) === canonicalJson(job)) return;
    if (!allowedJobTransition(previous, job)) {
      throw new PostgresCaphubStoreError("INVALID_WORKFLOW_TRANSITION");
    }
    try {
      await this.records.putVersion(versionFor(job, "analysis_job", job.id, current.version + 1, job.updated_at));
    } catch (error) {
      if (error instanceof RegistryError && (error.code === "STALE_WRITE" || error.code === "REGISTRY_DIGEST_CONFLICT")) {
        throw new PostgresCaphubStoreError("WORKFLOW_RECORD_CONFLICT");
      }
      throw error;
    }
  }
}

export const registryArtifactPayloadSchema = z.object({
  schema_version: z.literal(1),
  artifact: stageArtifactSchema,
  payload: registryJsonValueSchema
}).strict();
type ArtifactPayload = z.infer<typeof registryArtifactPayloadSchema>;

export class PostgresStageArtifactStore implements StageArtifactStore {
  private readonly records: PostgresRegistryRecordStore;

  constructor(private readonly pool: Pool) {
    this.records = new PostgresRegistryRecordStore(pool, { analysis_artifact: registryArtifactPayloadSchema });
  }

  async get(id: string): Promise<StageArtifact | null> {
    const current = await this.records.getCurrent(id);
    return current ? registryArtifactPayloadSchema.parse(current.payload).artifact : null;
  }

  async create(input: CreateStageArtifactInput): Promise<StageArtifact> {
    const payload = registryJsonValueSchema.parse(input.payload);
    const serialized = canonicalJson(payload);
    const bytes = new TextEncoder().encode(serialized).byteLength;
    if (bytes > 8 * 1024 * 1024) throw new PostgresCaphubStoreError("WORKFLOW_RECORD_CONFLICT");
    const outputDigest = createHash("sha256").update(serialized, "utf8").digest("hex");
    const artifact = stageArtifactSchema.parse({
      schema_version: 1,
      id: `art_${outputDigest}`,
      job_id: input.jobId,
      capture_id: input.captureId,
      stage: input.stage,
      input_digest: input.inputDigest,
      output_digest: outputDigest,
      payload_schema_version: 1,
      object: objectRefSchema.parse({
        algorithm: "sha256",
        digest: outputDigest,
        key: `sha256/${outputDigest.slice(0, 2)}/${outputDigest}`,
        bytes
      }),
      created_at: input.createdAt
    });
    const stored: ArtifactPayload = { schema_version: 1, artifact, payload };
    try {
      await this.records.putVersion(versionFor(stored, "analysis_artifact", artifact.id, 1, input.createdAt));
      return artifact;
    } catch (error) {
      if (error instanceof RegistryError) throw new PostgresCaphubStoreError("WORKFLOW_RECORD_CONFLICT");
      throw error;
    }
  }

  async readPayload(id: string): Promise<unknown | null> {
    const current = await this.records.getCurrent(id);
    return current ? registryArtifactPayloadSchema.parse(current.payload).payload : null;
  }

  async findByJobStage(jobId: string, stage: AnalysisStage): Promise<StageArtifact | null> {
    const result = await this.pool.query<{ payload: ArtifactPayload }>(`
      SELECT v.payload
      FROM caphub.registry_records r
      JOIN caphub.registry_versions v
        ON v.record_id = r.record_id AND v.version = r.current_version
      WHERE r.kind = 'analysis_artifact'
        AND v.payload->'artifact'->>'job_id' = $1
        AND v.payload->'artifact'->>'stage' = $2
      ORDER BY r.record_id
      LIMIT 2
    `, [jobId, stage]);
    if (result.rows.length > 1) throw new PostgresCaphubStoreError("WORKFLOW_RECORD_CONFLICT");
    return result.rows[0] ? registryArtifactPayloadSchema.parse(result.rows[0].payload).artifact : null;
  }
}

async function insertAuditEvent(
  pool: Pool,
  event: CaptureAuditEvent | ModelCallAuditEvent,
  eventType: string,
  actor: "web:user" | "system:caphub",
  subjectId: string
): Promise<"appended" | "existing"> {
  try {
    const inserted = await pool.query(`
      INSERT INTO caphub.audit_events
        (event_id, event_type, actor, subject_id, subject_version, decision_id, metadata, occurred_at)
      VALUES ($1, $2, $3, $4, 1, NULL, $5::jsonb, $6)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `, [event.event_id, eventType, actor, subjectId, canonicalJson(event), event.occurred_at]);
    if (inserted.rowCount === 1) return "appended";
    const existing = await pool.query<{ metadata: unknown }>(
      "SELECT metadata FROM caphub.audit_events WHERE event_id = $1",
      [event.event_id]
    );
    if (!existing.rows[0] || canonicalJson(existing.rows[0].metadata) !== canonicalJson(event)) {
      throw new PostgresCaphubStoreError("WORKFLOW_RECORD_CONFLICT");
    }
    return "existing";
  } catch (error) {
    if (error instanceof PostgresCaphubStoreError) throw error;
    throw mapRegistryDatabaseError(error, "REGISTRY_DIGEST_CONFLICT");
  }
}

export class PostgresCaptureAuditLog implements CaptureAuditLog {
  constructor(private readonly pool: Pool) {}

  async ensure(input: CaptureAuditEvent): Promise<"appended" | "existing"> {
    const event = captureAuditEventSchema.parse(input);
    return insertAuditEvent(this.pool, event, event.type, event.actor, event.capture_id);
  }
}

function assertDeterministicModelEvent(event: ModelCallAuditEvent): void {
  const ids = deterministicModelCallIds({
    jobId: event.job_id,
    captureId: event.capture_id,
    stage: event.stage,
    provider: event.provider,
    model: event.model,
    attempt: event.attempt,
    inputDigest: event.input_digest
  }, event.type);
  if (event.call_id !== ids.callId || event.event_id !== ids.eventId) {
    throw new PostgresCaphubStoreError("WORKFLOW_RECORD_CONFLICT");
  }
}

export class PostgresModelCallAuditStore implements ReadableModelCallAuditStore {
  constructor(private readonly pool: Pool) {}

  async append(input: ModelCallAuditEvent): Promise<void> {
    const event = modelCallAuditEventSchema.parse(input);
    assertDeterministicModelEvent(event);
    await insertAuditEvent(this.pool, event, `model.${event.type}`, "system:caphub", event.job_id);
  }

  async list(jobId: string): Promise<ModelCallAuditEvent[]> {
    try {
      const result = await this.pool.query<{ metadata: unknown }>(`
        SELECT metadata FROM caphub.audit_events
        WHERE subject_id = $1 AND event_type LIKE 'model.%'
        ORDER BY occurred_at, event_id
      `, [jobId]);
      return result.rows.map(({ metadata }) => {
        const event = modelCallAuditEventSchema.parse(metadata);
        assertDeterministicModelEvent(event);
        if (event.job_id !== jobId) throw new PostgresCaphubStoreError("WORKFLOW_RECORD_CONFLICT");
        return event;
      });
    } catch (error) {
      if (error instanceof PostgresCaphubStoreError) throw error;
      if (error instanceof z.ZodError) throw new PostgresCaphubStoreError("WORKFLOW_RECORD_CONFLICT");
      throw mapRegistryDatabaseError(error);
    }
  }
}
