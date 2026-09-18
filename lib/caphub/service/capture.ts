import { createHash } from "node:crypto";
import { z } from "zod";
import {
  captureAuditEventSchema,
  captureIdSchema,
  captureMimeTypeSchema,
  captureRecordSchema,
  idempotencyKeySchema,
  objectRefSchema
} from "../domain/schemas";
import type {
  CaptureAuditEvent,
  CaptureMimeType,
  CaptureRecord
} from "../domain/types";
import type {
  CaptureAuditLog,
  CaptureObjectStore,
  CaptureStore
} from "../storage/contracts";

export type {
  CaptureAuditLog,
  CaptureObjectStore,
  CaptureStore
} from "../storage/contracts";

export interface ReceiveCaptureInput {
  idempotencyKey: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  note?: string;
  sourceUrl?: string;
}

export type ReceiveCaptureResult = (
  | { kind: "created"; capture: CaptureRecord }
  | { kind: "duplicate"; capture: CaptureRecord }) & { analysis?: { enqueue: "saved" | "failed" } };

export type CaptureServiceErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "IDEMPOTENCY_CONFLICT"
  | "STORAGE_UNAVAILABLE"
  | "AUDIT_WRITE_FAILED";

export class CaptureServiceError extends Error {
  constructor(
    public readonly code: CaptureServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "CaptureServiceError";
  }
}

export interface CaptureServiceDependencies {
  store: CaptureStore;
  objects: CaptureObjectStore;
  audit: CaptureAuditLog;
  clock: () => Date;
  idFactory: () => string;
  eventIdFactory: (captureId: string) => string;
  maxUploadBytes: number;
}

export interface CaptureService {
  receive(input: ReceiveCaptureInput): Promise<ReceiveCaptureResult>;
  get(id: string): Promise<CaptureRecord | null>;
}

const receiveCaptureInputSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  bytes: z.custom<Uint8Array>(
    (value) => ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]"
  ),
  note: z.string().max(4000).optional(),
  sourceUrl: z
    .string()
    .url()
    .max(2048)
    .refine((value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }, "sourceUrl must use HTTPS")
    .optional()
}).strict();

interface ValidatedCaptureInput {
  idempotencyKey: string;
  filename: string;
  mimeType: CaptureMimeType;
  bytes: Uint8Array;
  note: string;
  sourceUrl?: string;
}

function serviceError(code: CaptureServiceErrorCode, message: string): CaptureServiceError {
  return new CaptureServiceError(code, message);
}

export function validateCaptureInput(input: ReceiveCaptureInput, maxUploadBytes: number): ValidatedCaptureInput {
  const parsed = receiveCaptureInputSchema.safeParse(input);
  if (!parsed.success) {
    throw serviceError("INVALID_INPUT", "Capture input is invalid");
  }

  const mimeType = captureMimeTypeSchema.safeParse(parsed.data.mimeType);
  if (!mimeType.success) {
    throw serviceError("UNSUPPORTED_MEDIA_TYPE", "Capture media type is unsupported");
  }
  if (parsed.data.bytes.byteLength === 0) {
    throw serviceError("INVALID_INPUT", "Capture bytes must not be empty");
  }
  if (parsed.data.bytes.byteLength > maxUploadBytes) {
    throw serviceError("PAYLOAD_TOO_LARGE", "Capture payload exceeds the configured limit");
  }

  return {
    idempotencyKey: parsed.data.idempotencyKey,
    filename: parsed.data.filename,
    mimeType: mimeType.data,
    bytes: Uint8Array.from(parsed.data.bytes),
    note: parsed.data.note ?? "",
    sourceUrl: parsed.data.sourceUrl
  };
}

function digestBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function matchesInput(
  capture: CaptureRecord,
  input: ValidatedCaptureInput,
  digest: string
): boolean {
  return capture.idempotency_key === input.idempotencyKey
    && capture.source.kind === "web"
    && capture.source.original_filename === input.filename
    && capture.source.source_url === input.sourceUrl
    && capture.note === input.note
    && capture.mime_type === input.mimeType
    && capture.object.algorithm === "sha256"
    && capture.object.digest === digest
    && capture.object.key === `sha256/${digest.slice(0, 2)}/${digest}`
    && capture.object.bytes === input.bytes.byteLength;
}

function operationalError(code: "STORAGE_UNAVAILABLE" | "AUDIT_WRITE_FAILED"): CaptureServiceError {
  return serviceError(
    code,
    code === "STORAGE_UNAVAILABLE"
      ? "Capture storage is unavailable"
      : "Capture audit event could not be written"
  );
}

export function createCaptureService(dependencies: CaptureServiceDependencies): CaptureService {
  const { store, objects, audit, clock, idFactory, eventIdFactory, maxUploadBytes } = dependencies;
  if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes <= 0) {
    throw new TypeError("maxUploadBytes must be a positive safe integer");
  }

  async function findByIdempotencyKey(key: string): Promise<CaptureRecord | null> {
    try {
      const capture = await store.findByIdempotencyKey(key);
      return capture === null ? null : captureRecordSchema.parse(capture);
    } catch {
      throw operationalError("STORAGE_UNAVAILABLE");
    }
  }

  async function ensureAudit(capture: CaptureRecord): Promise<void> {
    try {
      const event: CaptureAuditEvent = captureAuditEventSchema.parse({
        schema_version: 1,
        event_id: eventIdFactory(capture.id),
        capture_id: capture.id,
        type: "capture.received",
        actor: "web:user",
        occurred_at: capture.created_at,
        object_digest: capture.object.digest
      });
      await audit.ensure(event);
    } catch {
      throw operationalError("AUDIT_WRITE_FAILED");
    }
  }

  async function duplicateOrConflict(
    capture: CaptureRecord,
    input: ValidatedCaptureInput,
    digest: string
  ): Promise<ReceiveCaptureResult> {
    if (!matchesInput(capture, input, digest)) {
      throw serviceError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key is already bound to different Capture content"
      );
    }
    await ensureAudit(capture);
    return { kind: "duplicate", capture };
  }

  return {
    async receive(rawInput: ReceiveCaptureInput): Promise<ReceiveCaptureResult> {
      const input = validateCaptureInput(rawInput, maxUploadBytes);
      const digest = digestBytes(input.bytes);
      const existing = await findByIdempotencyKey(input.idempotencyKey);
      if (existing) return duplicateOrConflict(existing, input, digest);

      let id: ReturnType<typeof captureIdSchema.safeParse>;
      let createdAt: string;
      try {
        id = captureIdSchema.safeParse(idFactory());
        createdAt = clock().toISOString();
      } catch {
        throw operationalError("STORAGE_UNAVAILABLE");
      }
      if (!id.success) throw operationalError("STORAGE_UNAVAILABLE");

      let object;
      try {
        object = objectRefSchema.parse(
          await objects.putImmutable({ bytes: input.bytes, mimeType: input.mimeType })
        );
      } catch {
        throw operationalError("STORAGE_UNAVAILABLE");
      }
      if (
        object.digest !== digest
        || object.key !== `sha256/${digest.slice(0, 2)}/${digest}`
        || object.bytes !== input.bytes.byteLength
      ) {
        throw operationalError("STORAGE_UNAVAILABLE");
      }

      const capture = captureRecordSchema.parse({
        schema_version: 1,
        id: id.data,
        source: {
          kind: "web",
          original_filename: input.filename,
          ...(input.sourceUrl === undefined ? {} : { source_url: input.sourceUrl })
        },
        note: input.note,
        mime_type: input.mimeType,
        object,
        idempotency_key: input.idempotencyKey,
        status: "received",
        human_review_required: true,
        created_at: createdAt
      });

      let createResult: "created" | "conflict";
      try {
        createResult = await store.create(capture);
      } catch {
        throw operationalError("STORAGE_UNAVAILABLE");
      }
      if (createResult === "conflict") {
        const winner = await findByIdempotencyKey(input.idempotencyKey);
        if (!winner) throw operationalError("STORAGE_UNAVAILABLE");
        return duplicateOrConflict(winner, input, digest);
      }

      await ensureAudit(capture);
      return { kind: "created", capture };
    },

    async get(id: string): Promise<CaptureRecord | null> {
      const parsedId = captureIdSchema.safeParse(id);
      if (!parsedId.success) throw serviceError("INVALID_INPUT", "Capture ID is invalid");
      try {
        const capture = await store.get(parsedId.data);
        return capture === null ? null : captureRecordSchema.parse(capture);
      } catch {
        throw operationalError("STORAGE_UNAVAILABLE");
      }
    }
  };
}
