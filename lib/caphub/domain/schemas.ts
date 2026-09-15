import { z } from "zod";

export const captureIdSchema = z.string().regex(/^cap_[0-9a-f]{32}$/);

export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const captureMimeTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

export const objectRefSchema = z.object({
  algorithm: z.literal("sha256"),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  key: z.string().regex(/^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/),
  bytes: z.number().int().positive()
}).strict().refine(
  ({ digest, key }) => key === `sha256/${digest.slice(0, 2)}/${digest}`,
  "object key must match the SHA-256 digest shard"
);

const httpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === "https:", "source_url must use HTTPS");

export const captureRecordSchema = z.object({
  schema_version: z.literal(1),
  id: captureIdSchema,
  source: z.object({
    kind: z.literal("web"),
    original_filename: z.string().min(1).max(255),
    source_url: httpsUrlSchema.optional()
  }).strict(),
  note: z.string().max(4000),
  mime_type: captureMimeTypeSchema,
  object: objectRefSchema,
  idempotency_key: idempotencyKeySchema,
  status: z.literal("received"),
  human_review_required: z.literal(true),
  created_at: z.string().datetime({ offset: true })
}).strict();

export const captureAuditEventSchema = z.object({
  schema_version: z.literal(1),
  event_id: z.string().regex(/^evt_[0-9a-f]{32}$/),
  capture_id: captureIdSchema,
  type: z.literal("capture.received"),
  actor: z.literal("web:user"),
  occurred_at: z.string().datetime({ offset: true }),
  object_digest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
