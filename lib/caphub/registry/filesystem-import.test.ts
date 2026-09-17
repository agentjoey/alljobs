import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CaptureAuditEvent, CaptureRecord, CaptureStore } from "../storage/contracts";
import { FilesystemCaptureAuditLog, captureReceivedEventId } from "../storage/audit-log";
import { FilesystemCaptureStore } from "../storage/filesystem";
import { LocalCaptureObjectStore } from "../storage/local-objects";
import { idempotencyRecordPath, objectPath } from "../storage/paths";
import {
  applyFilesystemCaptureImport,
  planFilesystemCaptureImport
} from "./filesystem-import";

const roots: string[] = [];

function createRoot(): string {
  const fixture = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "caphub-filesystem-import-")));
  roots.push(fixture);
  chmodSync(fixture, 0o700);
  const home = join(fixture, "home");
  const state = join(home, "state");
  const root = join(state, "caphub");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const path of [home, state, root]) chmodSync(path, 0o700);
  return root;
}

async function addCapture(root: string, digit: string, key: string, createdAt: string): Promise<{
  capture: CaptureRecord;
  event: CaptureAuditEvent;
}> {
  const object = await new LocalCaptureObjectStore(root).putImmutable({
    bytes: new TextEncoder().encode(`image-${digit}`),
    mimeType: "image/png"
  });
  const capture: CaptureRecord = {
    schema_version: 1,
    id: `cap_${digit.repeat(32)}`,
    source: { kind: "web", original_filename: `${digit}.png` },
    note: `capture ${digit}`,
    mime_type: "image/png",
    object,
    idempotency_key: key,
    status: "received",
    human_review_required: true,
    created_at: createdAt
  };
  expect(await new FilesystemCaptureStore(root).create(capture)).toBe("created");
  const event: CaptureAuditEvent = {
    schema_version: 1,
    event_id: captureReceivedEventId(capture.id),
    capture_id: capture.id,
    type: "capture.received",
    actor: "web:user",
    occurred_at: capture.created_at,
    object_digest: capture.object.digest
  };
  expect(await new FilesystemCaptureAuditLog(root).ensure(event)).toBe("appended");
  return { capture, event };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("filesystem Capture import planning", () => {
  it("builds a deterministic manifest from exact captures, indices, events, and objects", async () => {
    const root = createRoot();
    const first = await addCapture(root, "1", "capture.request-20260917:first", "2026-09-17T01:00:00.000Z");
    const second = await addCapture(root, "2", "capture.request-20260917:second", "2026-09-17T02:00:00.000Z");
    const manifest = await planFilesystemCaptureImport({ root });
    expect(manifest.schema_version).toBe(1);
    expect(manifest.source_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.counts).toEqual({ captures: 2, events: 2, objects: 2 });
    expect(manifest.captures.map(({ capture_id }) => capture_id)).toEqual([first.capture.id, second.capture.id]);
    expect(manifest.captures[0]).toMatchObject({
      event_id: first.event.event_id,
      object_digest: first.capture.object.digest,
      object_bytes: first.capture.object.bytes
    });
    await expect(planFilesystemCaptureImport({ root })).resolves.toEqual(manifest);
  });

  it("rejects missing/conflicting indices and duplicate idempotency keys", async () => {
    const missingRoot = createRoot();
    const missing = await addCapture(missingRoot, "3", "capture.request-20260917:missing", "2026-09-17T03:00:00.000Z");
    unlinkSync(idempotencyRecordPath(missingRoot, missing.capture.idempotency_key));
    await expect(planFilesystemCaptureImport({ root: missingRoot })).rejects.toThrow(/index|idempotency/i);

    const conflictRoot = createRoot();
    const conflict = await addCapture(conflictRoot, "4", "capture.request-20260917:conflict", "2026-09-17T04:00:00.000Z");
    const indexPath = idempotencyRecordPath(conflictRoot, conflict.capture.idempotency_key);
    writeFileSync(indexPath, `${JSON.stringify({
      schema_version: 1,
      idempotency_key: conflict.capture.idempotency_key,
      capture_id: `cap_${"f".repeat(32)}`
    })}\n`, { mode: 0o600 });
    await expect(planFilesystemCaptureImport({ root: conflictRoot })).rejects.toThrow(/index|idempotency/i);

    const duplicateRoot = createRoot();
    const original = await addCapture(duplicateRoot, "5", "capture.request-20260917:duplicate", "2026-09-17T05:00:00.000Z");
    const duplicate = { ...original.capture, id: `cap_${"6".repeat(32)}` };
    const duplicatePath = join(duplicateRoot, "records", "captures", `${duplicate.id}.json`);
    writeFileSync(duplicatePath, `${JSON.stringify(duplicate)}\n`, { mode: 0o600 });
    await expect(planFilesystemCaptureImport({ root: duplicateRoot })).rejects.toThrow(/duplicate|idempotency/i);
  });

  it("rejects missing, conflicting, malformed, or partial audit evidence", async () => {
    const missingRoot = createRoot();
    await addCapture(missingRoot, "7", "capture.request-20260917:audit-missing", "2026-09-17T07:00:00.000Z");
    unlinkSync(join(missingRoot, "events", "2026-09.jsonl"));
    await expect(planFilesystemCaptureImport({ root: missingRoot })).rejects.toThrow(/audit|event/i);

    const malformedRoot = createRoot();
    await addCapture(malformedRoot, "8", "capture.request-20260917:audit-bad", "2026-09-17T08:00:00.000Z");
    const events = join(malformedRoot, "events", "2026-09.jsonl");
    writeFileSync(events, `${readFileSync(events, "utf8")}not-json`, { mode: 0o600 });
    await expect(planFilesystemCaptureImport({ root: malformedRoot })).rejects.toThrow(/partial|JSON|audit/i);
  });

  it("rejects missing/tampered/unreferenced objects and unsafe paths", async () => {
    const missingRoot = createRoot();
    const missing = await addCapture(missingRoot, "9", "capture.request-20260917:object-missing", "2026-09-17T09:00:00.000Z");
    unlinkSync(objectPath(missingRoot, missing.capture.object.digest));
    await expect(planFilesystemCaptureImport({ root: missingRoot })).rejects.toThrow(/object/i);

    const extraRoot = createRoot();
    await addCapture(extraRoot, "a", "capture.request-20260917:object-extra", "2026-09-17T10:00:00.000Z");
    await new LocalCaptureObjectStore(extraRoot).putImmutable({
      bytes: new TextEncoder().encode("unreferenced"),
      mimeType: "image/png"
    });
    await expect(planFilesystemCaptureImport({ root: extraRoot })).rejects.toThrow(/unreferenced|object/i);

    const unsafeRoot = createRoot();
    const unsafe = await addCapture(unsafeRoot, "b", "capture.request-20260917:unsafe", "2026-09-17T11:00:00.000Z");
    chmodSync(objectPath(unsafeRoot, unsafe.capture.object.digest), 0o660);
    await expect(planFilesystemCaptureImport({ root: unsafeRoot })).rejects.toThrow(/writable|secure|unsafe/i);

    const symlinkRoot = createRoot();
    const symlinked = await addCapture(symlinkRoot, "c", "capture.request-20260917:symlink", "2026-09-17T12:00:00.000Z");
    const target = objectPath(symlinkRoot, symlinked.capture.object.digest);
    const backup = `${target}.real`;
    writeFileSync(backup, readFileSync(target), { mode: 0o600 });
    unlinkSync(target);
    symlinkSync(backup, target);
    await expect(planFilesystemCaptureImport({ root: symlinkRoot })).rejects.toThrow(/symlink|secure|object/i);
  });
});

describe("filesystem Capture import application", () => {
  it("replans, rejects source changes, and preflights Registry conflicts before writes", async () => {
    const root = createRoot();
    await addCapture(root, "d", "capture.request-20260917:apply", "2026-09-17T13:00:00.000Z");
    const manifest = await planFilesystemCaptureImport({ root });
    await addCapture(root, "e", "capture.request-20260917:changed", "2026-09-17T14:00:00.000Z");
    const captures: CaptureStore = {
      get: async () => null,
      findByIdempotencyKey: async () => null,
      create: async () => "created"
    };
    await expect(applyFilesystemCaptureImport({
      root,
      expectedSourceDigest: manifest.source_digest,
      captures,
      audit: { ensure: async () => "appended" }
    })).rejects.toThrow(/digest|changed/i);

    const current = await planFilesystemCaptureImport({ root });
    let writes = 0;
    await expect(applyFilesystemCaptureImport({
      root,
      expectedSourceDigest: current.source_digest,
      captures: {
        get: async () => ({ ...(await new FilesystemCaptureStore(root).get(`cap_${"d".repeat(32)}`))!, note: "conflict" }),
        findByIdempotencyKey: async () => null,
        create: async () => { writes += 1; return "created"; }
      },
      audit: { ensure: async () => { writes += 1; return "appended"; } }
    })).rejects.toThrow(/conflict/i);
    expect(writes).toBe(0);
  });
});
