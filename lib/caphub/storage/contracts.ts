import type {
  CaptureAuditEvent,
  CaptureMimeType,
  CaptureRecord,
  ObjectRef
} from "../domain/types";

export type {
  CaptureAuditEvent,
  CaptureMimeType,
  CaptureRecord,
  ObjectRef
} from "../domain/types";

export interface CaptureStore {
  findByIdempotencyKey(key: string): Promise<CaptureRecord | null>;
  get(id: string): Promise<CaptureRecord | null>;
  create(record: CaptureRecord): Promise<"created" | "conflict">;
}

export interface CaptureObjectStore {
  putImmutable(input: { bytes: Uint8Array; mimeType: CaptureMimeType }): Promise<ObjectRef>;
}

export interface CaptureAuditLog {
  ensure(event: CaptureAuditEvent): Promise<"appended" | "existing">;
}
