import type { z } from "zod";
import type {
  captureAuditEventSchema,
  captureIdSchema,
  captureMimeTypeSchema,
  captureRecordSchema,
  objectRefSchema
} from "./schemas";

export type CaptureId = z.infer<typeof captureIdSchema>;
export type CaptureMimeType = z.infer<typeof captureMimeTypeSchema>;
export type ObjectRef = z.infer<typeof objectRefSchema>;
export type CaptureRecord = z.infer<typeof captureRecordSchema>;
export type CaptureAuditEvent = z.infer<typeof captureAuditEventSchema>;
