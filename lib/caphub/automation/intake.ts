import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { digestCanonicalJson } from "../analysis/digest";
import { captureRecordSchema, objectRefSchema } from "../domain/schemas";
import type { CaptureRecord } from "../domain/types";
import { CaptureServiceError, validateCaptureInput, type ReceiveCaptureInput, type ReceiveCaptureResult } from "../service/capture";
import type { CaptureObjectStore } from "../storage/contracts";
import { captureReceivedEventId } from "../storage/audit-log";
import { normalizeCaptureFilename } from "./filename";

export interface AutomatedCaptureInput extends ReceiveCaptureInput {
  expectedCurrentCaptureId?: string;
  expectedCurrentObjectDigest?: string;
}
export class FilenameConflictError extends Error {
  readonly existing: { id: string; filename: string; digest: string; createdAt: string };
  constructor(readonly code: "FILENAME_CONFLICT" | "FILENAME_CONFLICT_STALE" | "FILENAME_CONFLICT_UNRESOLVED", capture: CaptureRecord) {
    super(code);
    this.existing = { id: capture.id, filename: capture.source.original_filename, digest: capture.object.digest, createdAt: capture.created_at };
  }
}
interface Dependencies {
  pool: Pool; objects: CaptureObjectStore; maxUploadBytes: number;
  idFactory(): string; clock(): Date;
}
function fingerprint(input: ReturnType<typeof validateCaptureInput>, digest: string) {
  return digestCanonicalJson({ format: "capture-input-v1", filename: input.filename, mimeType: input.mimeType,
    note: input.note, sourceUrl: input.sourceUrl ?? null, digest, bytes: input.bytes.byteLength });
}

export function createAutomatedIntake(deps: Dependencies) {
  return async function receive(raw: AutomatedCaptureInput): Promise<ReceiveCaptureResult> {
    const { expectedCurrentCaptureId, expectedCurrentObjectDigest, ...base } = raw;
    const input = validateCaptureInput(base, deps.maxUploadBytes);
    let filenameKey: string;
    try { filenameKey = normalizeCaptureFilename(input.filename); }
    catch { throw new CaptureServiceError("INVALID_INPUT", "Invalid filename"); }
    if ((expectedCurrentCaptureId === undefined) !== (expectedCurrentObjectDigest === undefined)
      || (expectedCurrentCaptureId !== undefined && !/^cap_[a-f0-9]{32}$/.test(expectedCurrentCaptureId))
      || (expectedCurrentObjectDigest !== undefined && !/^[a-f0-9]{64}$/.test(expectedCurrentObjectDigest))) {
      throw new CaptureServiceError("INVALID_INPUT", "Invalid filename confirmation");
    }
    const digest = createHash("sha256").update(input.bytes).digest("hex");
    const requestDigest = fingerprint(input, digest);
    const db = await deps.pool.connect();
    try {
      // READ COMMITTED sees a prior lock holder's commit; explicit locks protect all decisions.
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(hashtext('caphub.capture_idempotency'),hashtext($1))", [input.idempotencyKey]);
      await db.query("SELECT pg_advisory_xact_lock(hashtext('caphub.filename'),hashtext($1))", [filenameKey]);
      const keyed = await db.query<{ request_digest: string; payload: CaptureRecord }>(`SELECT i.request_digest,v.payload
        FROM caphub.capture_idempotency i JOIN caphub.registry_records r ON r.record_id=i.capture_id
        JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version WHERE i.idempotency_key=$1`, [input.idempotencyKey]);
      if (keyed.rows[0]) {
        const row = keyed.rows[0];
        const capture = captureRecordSchema.parse(row.payload);
        const legacyMatch = capture.idempotency_key === input.idempotencyKey && capture.source.original_filename === input.filename
          && capture.source.source_url === input.sourceUrl && capture.note === input.note && capture.mime_type === input.mimeType
          && capture.object.digest === digest && capture.object.bytes === input.bytes.byteLength;
        if (row.request_digest !== requestDigest && !legacyMatch) throw new CaptureServiceError("IDEMPOTENCY_CONFLICT", "Request key already bound");
        const alias = await db.query<{ payload: CaptureRecord }>(`SELECT v.payload FROM caphub.capture_filename_versions f
          JOIN caphub.registry_records r ON r.record_id=f.canonical_capture_id
          JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version WHERE f.capture_id=$1`, [capture.id]);
        await db.query("COMMIT");
        return { kind: "duplicate", capture: alias.rows[0] ? captureRecordSchema.parse(alias.rows[0].payload) : capture };
      }
      const heads = await db.query<{ version: number; payload: CaptureRecord }>(`SELECT h.version,v.payload
        FROM caphub.capture_filename_heads h JOIN caphub.registry_records r ON r.record_id=h.capture_id
        JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version WHERE h.filename_key=$1`, [filenameKey]);
      const head = heads.rows[0];
      if (!head) {
        // Only unresolved legacy rows remain after backfill. They must not be silently replaced.
        const legacy = await db.query<{ payload: CaptureRecord }>(`SELECT v.payload FROM caphub.registry_records r
          JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
          LEFT JOIN caphub.capture_filename_versions f ON f.capture_id=r.record_id WHERE r.kind='capture' AND f.capture_id IS NULL`);
        const unresolved = legacy.rows.find(row => normalizeCaptureFilename(row.payload.source.original_filename) === filenameKey);
        if (unresolved) throw new FilenameConflictError("FILENAME_CONFLICT_UNRESOLVED", unresolved.payload);
      }
      let capture: CaptureRecord;
      let kind: ReceiveCaptureResult["kind"];
      if (head && head.payload.object.digest === digest) {
        capture = captureRecordSchema.parse(head.payload);
        kind = "duplicate";
      } else {
        if (head && (head.payload.id !== expectedCurrentCaptureId || head.payload.object.digest !== expectedCurrentObjectDigest)) {
          throw new FilenameConflictError(expectedCurrentCaptureId ? "FILENAME_CONFLICT_STALE" : "FILENAME_CONFLICT", head.payload);
        }
        if (!head && expectedCurrentCaptureId) throw new CaptureServiceError("INVALID_INPUT", "No current filename to confirm");
        await db.query("SELECT pg_advisory_xact_lock(hashtext('caphub.object'),hashtext($1))", [digest]);
        const object = objectRefSchema.parse(await deps.objects.putImmutable({ bytes: input.bytes, mimeType: input.mimeType }));
        if (object.digest !== digest || object.bytes !== input.bytes.byteLength || object.key !== `sha256/${digest.slice(0, 2)}/${digest}`) throw new CaptureServiceError("STORAGE_UNAVAILABLE", "Object receipt mismatch");
        const now = deps.clock().toISOString();
        capture = captureRecordSchema.parse({ schema_version: 1, id: deps.idFactory(),
          source: { kind: "web", original_filename: input.filename, ...(input.sourceUrl ? { source_url: input.sourceUrl } : {}) },
          note: input.note, mime_type: input.mimeType, object, idempotency_key: input.idempotencyKey,
          status: "received", human_review_required: true, created_at: now });
        await db.query("INSERT INTO caphub.registry_records VALUES ($1,'capture',1,$2,$2)", [capture.id, now]);
        await db.query(`INSERT INTO caphub.registry_versions (record_id,version,kind,schema_version,payload,payload_digest,previous_version,created_at)
          VALUES ($1,1,'capture',1,$2,$3,NULL,$4)`, [capture.id, JSON.stringify(capture), digestCanonicalJson(capture), now]);
        const version = (head?.version ?? 0) + 1;
        await db.query("INSERT INTO caphub.capture_filename_versions VALUES ($1,$2,$3,$1,$4,$5)", [capture.id, filenameKey, version, digest, now]);
        await db.query(`INSERT INTO caphub.capture_filename_heads VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (filename_key) DO UPDATE SET capture_id=excluded.capture_id,digest=excluded.digest,version=excluded.version,updated_at=excluded.updated_at`, [filenameKey,capture.id,digest,version,now]);
        await db.query("INSERT INTO caphub.capture_object_retention (capture_id,digest) VALUES ($1,$2)", [capture.id,digest]);
        await db.query(`INSERT INTO caphub.audit_events (event_id,event_type,actor,subject_id,subject_version,metadata,occurred_at)
          VALUES ($1,'capture.received','web:user',$2,1,$3,$4)`, [captureReceivedEventId(capture.id), capture.id, JSON.stringify({ object_digest: digest }), now]);
        kind = "created";
      }
      await db.query("INSERT INTO caphub.capture_idempotency VALUES ($1,$2,$3,$4)", [input.idempotencyKey,requestDigest,capture.id,deps.clock().toISOString()]);
      await db.query("COMMIT");
      return { kind, capture };
    } catch (error) {
      await db.query("ROLLBACK");
      if (error instanceof CaptureServiceError || error instanceof FilenameConflictError) throw error;
      throw new CaptureServiceError("STORAGE_UNAVAILABLE", "Capture intake unavailable");
    } finally { db.release(); }
  };
}
