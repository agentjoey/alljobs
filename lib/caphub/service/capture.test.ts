import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  CaptureAuditEvent,
  CaptureMimeType,
  CaptureRecord,
  ObjectRef
} from "../domain/types";
import type {
  CaptureAuditLog,
  CaptureObjectStore,
  CaptureStore
} from "../storage/contracts";
import {
  CaptureServiceError,
  createCaptureService,
  type ReceiveCaptureInput
} from "./capture";

const CAPTURE_ID = `cap_${"1".repeat(32)}`;
const WINNER_ID = `cap_${"2".repeat(32)}`;
const EVENT_ID = `evt_${"3".repeat(32)}`;
const WINNER_EVENT_ID = `evt_${"4".repeat(32)}`;
const IDEMPOTENCY_KEY = "capture.request-20260916:service-a";
const CREATED_AT = "2026-09-16T02:03:04.000Z";
const HELLO_DIGEST = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

function input(overrides: Partial<ReceiveCaptureInput> = {}): ReceiveCaptureInput {
  return {
    idempotencyKey: IDEMPOTENCY_KEY,
    filename: "browser-capture.png",
    mimeType: "image/png",
    bytes: new TextEncoder().encode("hello"),
    note: "Review the visible workflow",
    sourceUrl: "https://example.com/source",
    ...overrides
  };
}

function objectRef(bytes: Uint8Array): ObjectRef {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return {
    algorithm: "sha256",
    digest,
    key: `sha256/${digest.slice(0, 2)}/${digest}`,
    bytes: bytes.byteLength
  };
}

function captureRecord(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    schema_version: 1,
    id: CAPTURE_ID,
    source: {
      kind: "web",
      original_filename: "browser-capture.png",
      source_url: "https://example.com/source"
    },
    note: "Review the visible workflow",
    mime_type: "image/png",
    object: {
      algorithm: "sha256",
      digest: HELLO_DIGEST,
      key: `sha256/2c/${HELLO_DIGEST}`,
      bytes: 5
    },
    idempotency_key: IDEMPOTENCY_KEY,
    status: "received",
    human_review_required: true,
    created_at: CREATED_AT,
    ...overrides
  };
}

class MemoryStore implements CaptureStore {
  readonly records = new Map<string, CaptureRecord>();
  readonly idempotency = new Map<string, string>();
  readonly operations: string[];
  createCalls = 0;

  constructor(operations: string[] = []) {
    this.operations = operations;
  }

  async findByIdempotencyKey(key: string): Promise<CaptureRecord | null> {
    this.operations.push("metadata:find");
    const id = this.idempotency.get(key);
    return id ? (this.records.get(id) ?? null) : null;
  }

  async get(id: string): Promise<CaptureRecord | null> {
    this.operations.push("metadata:get");
    return this.records.get(id) ?? null;
  }

  async create(record: CaptureRecord): Promise<"created" | "conflict"> {
    this.operations.push("metadata:create");
    this.createCalls += 1;
    if (this.idempotency.has(record.idempotency_key) || this.records.has(record.id)) {
      return "conflict";
    }
    this.records.set(record.id, record);
    this.idempotency.set(record.idempotency_key, record.id);
    return "created";
  }

  seed(record: CaptureRecord): void {
    this.records.set(record.id, record);
    this.idempotency.set(record.idempotency_key, record.id);
  }
}

class MemoryObjects implements CaptureObjectStore {
  readonly stored = new Map<string, Uint8Array>();
  readonly operations: string[];
  calls = 0;
  failure: Error | null = null;

  constructor(operations: string[] = []) {
    this.operations = operations;
  }

  async putImmutable(input: {
    bytes: Uint8Array;
    mimeType: CaptureMimeType;
  }): Promise<ObjectRef> {
    this.operations.push("object:put");
    this.calls += 1;
    if (this.failure) throw this.failure;
    const ref = objectRef(input.bytes);
    this.stored.set(ref.digest, Uint8Array.from(input.bytes));
    return ref;
  }
}

class MemoryAudit implements CaptureAuditLog {
  readonly events = new Map<string, CaptureAuditEvent>();
  readonly attempts: CaptureAuditEvent[] = [];
  readonly operations: string[];
  failuresRemaining = 0;

  constructor(operations: string[] = []) {
    this.operations = operations;
  }

  async ensure(event: CaptureAuditEvent): Promise<"appended" | "existing"> {
    this.operations.push("audit:ensure");
    this.attempts.push(structuredClone(event));
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("injected audit failure");
    }
    if (this.events.has(event.event_id)) return "existing";
    this.events.set(event.event_id, structuredClone(event));
    return "appended";
  }
}

function setup(options: {
  store?: CaptureStore;
  objects?: CaptureObjectStore;
  audit?: CaptureAuditLog;
  maxUploadBytes?: number;
} = {}) {
  const operations: string[] = [];
  const store = options.store ?? new MemoryStore(operations);
  const objects = options.objects ?? new MemoryObjects(operations);
  const audit = options.audit ?? new MemoryAudit(operations);
  const service = createCaptureService({
    store,
    objects,
    audit,
    clock: () => new Date(CREATED_AT),
    idFactory: () => CAPTURE_ID,
    eventIdFactory: (captureId) => captureId === WINNER_ID ? WINNER_EVENT_ID : EVENT_ID,
    maxUploadBytes: options.maxUploadBytes ?? 10
  });
  return { service, store, objects, audit, operations };
}

async function expectCode(
  promise: Promise<unknown>,
  code:
    | "INVALID_INPUT"
    | "UNSUPPORTED_MEDIA_TYPE"
    | "PAYLOAD_TOO_LARGE"
    | "IDEMPOTENCY_CONFLICT"
    | "STORAGE_UNAVAILABLE"
    | "AUDIT_WRITE_FAILED"
): Promise<CaptureServiceError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CaptureServiceError);
    expect(error).toMatchObject({ name: "CaptureServiceError", code });
    return error as CaptureServiceError;
  }
  throw new Error(`expected CaptureServiceError with code ${code}`);
}

describe("createCaptureService", () => {
  it("creates one received Capture in object, metadata, then audit order", async () => {
    const { service, store, objects, audit, operations } = setup();

    await expect(service.receive(input())).resolves.toEqual({
      kind: "created",
      capture: captureRecord()
    });

    expect(operations).toEqual([
      "metadata:find",
      "object:put",
      "metadata:create",
      "audit:ensure"
    ]);
    expect(Array.from((objects as MemoryObjects).stored.get(HELLO_DIGEST) ?? [])).toEqual([
      104, 101, 108, 108, 111
    ]);
    await expect(store.get(CAPTURE_ID)).resolves.toEqual(captureRecord());
    expect((audit as MemoryAudit).events.get(EVENT_ID)).toEqual({
      schema_version: 1,
      event_id: EVENT_ID,
      capture_id: CAPTURE_ID,
      type: "capture.received",
      actor: "web:user",
      occurred_at: CREATED_AT,
      object_digest: HELLO_DIGEST
    });
    expect(Object.keys(service).sort()).toEqual(["get", "receive"]);
  });

  it("returns the original for a duplicate key and ensures no second audit event", async () => {
    const { service, store, objects, audit } = setup();

    await service.receive(input());
    await expect(service.receive(input())).resolves.toEqual({
      kind: "duplicate",
      capture: captureRecord()
    });

    expect((store as MemoryStore).createCalls).toBe(1);
    expect((objects as MemoryObjects).calls).toBe(1);
    expect((audit as MemoryAudit).attempts).toHaveLength(2);
    expect((audit as MemoryAudit).events.size).toBe(1);
  });

  it("repairs the same deterministic audit event when receipt is retried after audit failure", async () => {
    const audit = new MemoryAudit();
    audit.failuresRemaining = 1;
    const { service, store, objects } = setup({ audit });

    await expectCode(service.receive(input()), "AUDIT_WRITE_FAILED");
    await expect(service.receive(input())).resolves.toEqual({
      kind: "duplicate",
      capture: captureRecord()
    });

    expect((store as MemoryStore).createCalls).toBe(1);
    expect((objects as MemoryObjects).calls).toBe(1);
    expect(audit.attempts).toHaveLength(2);
    expect(audit.attempts[0]).toEqual(audit.attempts[1]);
    expect(audit.events.size).toBe(1);
  });

  it("returns IDEMPOTENCY_CONFLICT for the same key with different bytes before object storage", async () => {
    const { service, objects, audit } = setup();
    await service.receive(input());

    await expectCode(
      service.receive(input({ bytes: new TextEncoder().encode("different") })),
      "IDEMPOTENCY_CONFLICT"
    );

    expect((objects as MemoryObjects).calls).toBe(1);
    expect((audit as MemoryAudit).attempts).toHaveLength(1);
  });

  it.each([
    ["filename", { filename: "different.png" }],
    ["MIME", { mimeType: "image/webp" }],
    ["note", { note: "different note" }],
    ["source URL", { sourceUrl: "https://example.com/different" }]
  ])("detects changed %s in canonical duplicate metadata", async (_label, overrides) => {
    const { service, objects, audit } = setup();
    await service.receive(input());

    await expectCode(
      service.receive(input(overrides as Partial<ReceiveCaptureInput>)),
      "IDEMPOTENCY_CONFLICT"
    );
    expect((objects as MemoryObjects).calls).toBe(1);
    expect((audit as MemoryAudit).attempts).toHaveLength(1);
  });

  it("rejects unsupported MIME before any storage call", async () => {
    const { service, operations } = setup();

    await expectCode(
      service.receive(input({ mimeType: "image/gif" })),
      "UNSUPPORTED_MEDIA_TYPE"
    );
    expect(operations).toEqual([]);
  });

  it("rejects empty and oversized bytes before any storage call", async () => {
    const { service, operations } = setup({ maxUploadBytes: 5 });

    await expectCode(service.receive(input({ bytes: new Uint8Array() })), "INVALID_INPUT");
    await expectCode(
      service.receive(input({ bytes: new Uint8Array(6).fill(1) })),
      "PAYLOAD_TOO_LARGE"
    );
    expect(operations).toEqual([]);
  });

  it.each([
    ["HTTP source URL", { sourceUrl: "http://example.com/source" }],
    ["malformed source URL", { sourceUrl: "not a URL" }],
    ["overlong note", { note: "x".repeat(4_001) }]
  ])("rejects invalid %s before storage", async (_label, overrides) => {
    const { service, operations } = setup();

    await expectCode(
      service.receive(input(overrides as Partial<ReceiveCaptureInput>)),
      "INVALID_INPUT"
    );
    expect(operations).toEqual([]);
  });

  it("maps object failure to STORAGE_UNAVAILABLE and leaves metadata empty", async () => {
    const objects = new MemoryObjects();
    objects.failure = new Error("injected object failure");
    const { service, store, audit } = setup({ objects });

    await expectCode(service.receive(input()), "STORAGE_UNAVAILABLE");

    expect((store as MemoryStore).createCalls).toBe(0);
    expect((store as MemoryStore).records.size).toBe(0);
    expect((audit as MemoryAudit).attempts).toHaveLength(0);
  });

  it("re-reads a matching winner after metadata conflict and returns it as duplicate", async () => {
    const operations: string[] = [];
    const store = new MemoryStore(operations);
    const winner = captureRecord({ id: WINNER_ID, created_at: "2026-09-16T02:03:05.000Z" });
    store.create = async () => {
      operations.push("metadata:create");
      store.createCalls += 1;
      store.seed(winner);
      return "conflict";
    };
    const objects = new MemoryObjects(operations);
    const audit = new MemoryAudit(operations);
    const { service } = setup({ store, objects, audit });

    await expect(service.receive(input())).resolves.toEqual({
      kind: "duplicate",
      capture: winner
    });
    expect(operations).toEqual([
      "metadata:find",
      "object:put",
      "metadata:create",
      "metadata:find",
      "audit:ensure"
    ]);
    expect(audit.attempts[0]?.event_id).toBe(WINNER_EVENT_ID);
    expect(store.records.has(CAPTURE_ID)).toBe(false);
  });

  it("returns AUDIT_WRITE_FAILED while the durable Capture remains queryable", async () => {
    const audit = new MemoryAudit();
    audit.failuresRemaining = 1;
    const { service, store } = setup({ audit });

    await expectCode(service.receive(input()), "AUDIT_WRITE_FAILED");

    expect((store as MemoryStore).records.get(CAPTURE_ID)).toEqual(captureRecord());
    await expect(service.get(CAPTURE_ID)).resolves.toEqual(captureRecord());
  });
});
