import { describe, expect, it } from "vitest";
import {
  captureAuditEventSchema,
  captureIdSchema,
  captureMimeTypeSchema,
  captureRecordSchema,
  idempotencyKeySchema,
  objectRefSchema
} from "./schemas";

const validObject = {
  algorithm: "sha256",
  digest: "a".repeat(64),
  key: `sha256/aa/${"a".repeat(64)}`,
  bytes: 42
};

const validCapture = {
  schema_version: 1,
  id: `cap_${"b".repeat(32)}`,
  source: {
    kind: "web",
    original_filename: "capture.png",
    source_url: "https://example.com/page"
  },
  note: "Customer-reported layout issue",
  mime_type: "image/png",
  object: validObject,
  idempotency_key: "capture.request-20260915:abc",
  status: "received",
  human_review_required: true,
  created_at: "2026-09-15T01:02:03.000Z"
};

describe("Caphub primitive schemas", () => {
  it("parses the fixed valid capture primitives", () => {
    expect(captureIdSchema.parse(`cap_${"c".repeat(32)}`)).toBe(`cap_${"c".repeat(32)}`);
    expect(idempotencyKeySchema.parse("capture.request-20260915:abc")).toBe("capture.request-20260915:abc");
    expect(captureMimeTypeSchema.parse("image/webp")).toBe("image/webp");
  });

  it("rejects invalid capture IDs and idempotency keys", () => {
    expect(() => captureIdSchema.parse("cap_ABCDEF0123456789abcdef0123456789")).toThrow();
    expect(() => captureIdSchema.parse(`cap_${"a".repeat(31)}`)).toThrow();
    expect(() => idempotencyKeySchema.parse("too-short-key")).toThrow();
    expect(() => idempotencyKeySchema.parse("capture request with spaces")).toThrow();
  });

  it("accepts only the closed image MIME set", () => {
    expect(captureMimeTypeSchema.parse("image/jpeg")).toBe("image/jpeg");
    expect(() => captureMimeTypeSchema.parse("image/gif")).toThrow();
    expect(() => captureMimeTypeSchema.parse("application/octet-stream")).toThrow();
  });
});

describe("objectRefSchema", () => {
  it("parses an immutable SHA-256 object reference", () => {
    expect(objectRefSchema.parse(validObject)).toEqual(validObject);
  });

  it("rejects negative or non-canonical object references", () => {
    expect(() => objectRefSchema.parse({ ...validObject, bytes: -1 })).toThrow();
    expect(() => objectRefSchema.parse({ ...validObject, digest: "A".repeat(64) })).toThrow();
    expect(() => objectRefSchema.parse({ ...validObject, key: `sha256/zz/${"a".repeat(64)}` })).toThrow();
    expect(() => objectRefSchema.parse({ ...validObject, extra: "not allowed" })).toThrow();
  });
});

describe("captureRecordSchema", () => {
  it("parses a strict received capture record", () => {
    expect(captureRecordSchema.parse(validCapture)).toEqual(validCapture);
  });

  it("rejects unknown record and source fields", () => {
    expect(() => captureRecordSchema.parse({ ...validCapture, release: "forbidden" })).toThrow();
    expect(() => captureRecordSchema.parse({
      ...validCapture,
      source: { ...validCapture.source, user_agent: "forbidden" }
    })).toThrow();
  });

  it("rejects non-HTTPS source URLs", () => {
    expect(() => captureRecordSchema.parse({
      ...validCapture,
      source: { ...validCapture.source, source_url: "http://example.com/page" }
    })).toThrow();
    expect(() => captureRecordSchema.parse({
      ...validCapture,
      source: { ...validCapture.source, source_url: "mailto:person@example.com" }
    })).toThrow();
  });

  it("rejects invalid record timestamps and a false review requirement", () => {
    expect(() => captureRecordSchema.parse({ ...validCapture, created_at: "2026-09-15" })).toThrow();
    expect(() => captureRecordSchema.parse({ ...validCapture, human_review_required: false })).toThrow();
  });
});

describe("captureAuditEventSchema", () => {
  const validEvent = {
    schema_version: 1,
    event_id: `evt_${"d".repeat(32)}`,
    capture_id: `cap_${"b".repeat(32)}`,
    type: "capture.received",
    actor: "web:user",
    occurred_at: "2026-09-15T01:02:03.000+08:00",
    object_digest: "a".repeat(64)
  };

  it("parses a strict capture-received audit event", () => {
    expect(captureAuditEventSchema.parse(validEvent)).toEqual(validEvent);
  });

  it("rejects invalid audit timestamps and unknown fields", () => {
    expect(() => captureAuditEventSchema.parse({ ...validEvent, occurred_at: "not-a-timestamp" })).toThrow();
    expect(() => captureAuditEventSchema.parse({ ...validEvent, approval: true })).toThrow();
  });
});
