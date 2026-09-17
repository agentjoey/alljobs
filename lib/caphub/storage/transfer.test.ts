import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CaptureAuditEvent, CaptureMimeType, CaptureRecord, ObjectRef } from "../domain/types";
import { FilesystemCaptureAuditLog, captureReceivedEventId } from "./audit-log";
import type { ReadableCaptureObjectStore } from "./contracts";
import { FilesystemCaptureStore } from "./filesystem";
import { LocalCaptureObjectStore } from "./local-objects";
import {
  applyFilesystemObjectTransfer,
  planFilesystemObjectTransfer,
  type ImmutableObjectCatalog
} from "./transfer";

const roots: string[] = [];

function createRoot(): string {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "caphub-object-transfer-")));
  roots.push(root);
  chmodSync(root, 0o700);
  const caphub = join(root, "home", "state", "caphub");
  mkdirSync(caphub, { recursive: true, mode: 0o700 });
  for (const path of [join(root, "home"), join(root, "home", "state"), caphub]) chmodSync(path, 0o700);
  return caphub;
}

async function addCapture(root: string, digit: string, mimeType: CaptureMimeType = "image/png"): Promise<CaptureRecord> {
  const bytes = new TextEncoder().encode(`image-${digit}`);
  const object = await new LocalCaptureObjectStore(root).putImmutable({ bytes, mimeType });
  const capture: CaptureRecord = {
    schema_version: 1,
    id: `cap_${digit.repeat(32)}`,
    source: { kind: "web", original_filename: `${digit}.png` },
    note: "",
    mime_type: mimeType,
    object,
    idempotency_key: `capture.transfer-20260917:${digit}`,
    status: "received",
    human_review_required: true,
    created_at: "2026-09-17T00:00:00.000Z"
  };
  await new FilesystemCaptureStore(root).create(capture);
  const event: CaptureAuditEvent = {
    schema_version: 1,
    event_id: captureReceivedEventId(capture.id),
    capture_id: capture.id,
    type: "capture.received",
    actor: "web:user",
    occurred_at: capture.created_at,
    object_digest: object.digest
  };
  await new FilesystemCaptureAuditLog(root).ensure(event);
  return capture;
}

class MemoryRemoteObjects implements ImmutableObjectCatalog {
  readonly objects = new Map<string, Uint8Array>();
  readonly mimeTypes = new Map<string, CaptureMimeType>();
  readonly operations: string[] = [];
  corruptRead = false;

  async putImmutable(input: { bytes: Uint8Array; mimeType: CaptureMimeType }): Promise<ObjectRef> {
    this.operations.push("put");
    const digest = createHash("sha256").update(input.bytes).digest("hex");
    const ref: ObjectRef = {
      algorithm: "sha256", digest, key: `sha256/${digest.slice(0, 2)}/${digest}`, bytes: input.bytes.byteLength
    };
    const existing = this.objects.get(ref.key);
    if (existing && !Buffer.from(existing).equals(Buffer.from(input.bytes))) throw new Error("immutable mismatch");
    this.objects.set(ref.key, Uint8Array.from(input.bytes));
    this.mimeTypes.set(ref.key, input.mimeType);
    return ref;
  }

  async readImmutable(ref: ObjectRef): Promise<Uint8Array> {
    this.operations.push("get");
    const value = this.objects.get(ref.key);
    if (!value) throw new Error("missing remote object");
    if (!this.corruptRead) return Uint8Array.from(value);
    const corrupted = Uint8Array.from(value);
    corrupted[0] ^= 1;
    return corrupted;
  }

  async listImmutableKeys(prefix: string): Promise<string[]> {
    this.operations.push("list");
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("filesystem object transfer", () => {
  it("copies every manifest object, re-reads it, and proves the exact remote key set", async () => {
    const root = createRoot();
    const first = await addCapture(root, "1");
    const second = await addCapture(root, "2", "image/jpeg");
    const planned = await planFilesystemObjectTransfer({ root });
    const remote = new MemoryRemoteObjects();

    await expect(applyFilesystemObjectTransfer({
      root,
      expectedSourceDigest: planned.sourceDigest,
      source: new LocalCaptureObjectStore(root) as ReadableCaptureObjectStore,
      destination: remote
    })).resolves.toEqual({
      sourceDigest: planned.sourceDigest,
      objectCount: 2,
      verifiedObjectCount: 2
    });
    expect(await remote.listImmutableKeys("sha256/")).toEqual([first.object.key, second.object.key].sort());
    expect(remote.mimeTypes.get(second.object.key)).toBe("image/jpeg");
    expect(remote.operations).not.toContain("delete");
  });

  it("fails closed when the remote reread disagrees with the source digest", async () => {
    const root = createRoot();
    await addCapture(root, "3");
    const planned = await planFilesystemObjectTransfer({ root });
    const remote = new MemoryRemoteObjects();
    remote.corruptRead = true;

    await expect(applyFilesystemObjectTransfer({
      root,
      expectedSourceDigest: planned.sourceDigest,
      source: new LocalCaptureObjectStore(root) as ReadableCaptureObjectStore,
      destination: remote
    })).rejects.toThrow(/object|digest|mismatch/i);
    expect(remote.operations).not.toContain("delete");
  });
});
