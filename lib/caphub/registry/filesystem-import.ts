import "server-only";

import { createHash } from "node:crypto";
import { constants, type Dirent } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { z } from "zod";
import { canonicalJson, digestCanonicalJson } from "../analysis/digest";
import { captureAuditEventSchema, captureRecordSchema, idempotencyKeySchema } from "../domain/schemas";
import type { CaptureAuditEvent, CaptureRecord } from "../domain/types";
import type { CaptureAuditLog, CaptureStore } from "../storage/contracts";
import { captureReceivedEventId } from "../storage/audit-log";
import { assertSecureDirectoryChain, assertSecureFileHandle } from "../storage/local-objects";
import { idempotencyRecordPath, resolveCaphubRoot } from "../storage/paths";

const MAX_CAPTURE_RECORDS = 10_000;
const MAX_CAPTURE_JSON_BYTES = 16 * 1024;
const MAX_IDEMPOTENCY_JSON_BYTES = 4 * 1024;
const MAX_AUDIT_FILE_BYTES = 16 * 1024 * 1024;
const MAX_OBJECT_BYTES = 20 * 1024 * 1024;
const MAX_INVENTORY_FILES = 40_000;
const MAX_AUDIT_FILES = 1_200;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

const idempotencyRecordSchema = z.object({
  schema_version: z.literal(1),
  idempotency_key: idempotencyKeySchema,
  capture_id: captureRecordSchema.shape.id
}).strict();

export interface CaptureImportManifestV1 {
  schema_version: 1;
  source_digest: string;
  captures: Array<{
    capture_id: string;
    capture_digest: string;
    event_id: string;
    object_digest: string;
    object_bytes: number;
  }>;
  counts: { captures: number; events: number; objects: number };
}

interface InventoryFile {
  path: string;
  relativePath: string;
  bytes: Buffer;
  digest: string;
}

interface CaptureInventory {
  manifest: CaptureImportManifestV1;
  captures: CaptureRecord[];
  events: Map<string, CaptureAuditEvent>;
}

async function secureRead(root: string, path: string, maximumBytes: number): Promise<InventoryFile> {
  await assertSecureDirectoryChain(root, dirname(path));
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await assertSecureFileHandle(handle);
    const stat = await handle.stat();
    if (stat.size > maximumBytes) throw new Error("Caphub import file exceeds its bounded size");
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < stat.size) {
      const { bytesRead } = await handle.read(bytes, offset, stat.size - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) throw new Error("Caphub import file changed during read");
    await assertSecureDirectoryChain(root, dirname(path));
    const relativePath = relative(root, path);
    if (!relativePath || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
      throw new Error("Caphub import path escaped its root");
    }
    return {
      path,
      relativePath,
      bytes,
      digest: createHash("sha256").update(bytes).digest("hex")
    };
  } finally {
    await handle.close();
  }
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`invalid ${label} JSON`);
  }
}

async function listDirectory(root: string, path: string): Promise<Dirent<string>[]> {
  try {
    await assertSecureDirectoryChain(root, path);
    return await readdir(path, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function assertRegularEntry(entry: { isFile(): boolean; isSymbolicLink(): boolean }, label: string): void {
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`${label} must contain only secure regular files`);
}

async function scanCaptureInventory(rawRoot: string): Promise<CaptureInventory> {
  const root = resolveCaphubRoot(rawRoot);
  await assertSecureDirectoryChain(root, root);
  const sourceFiles: InventoryFile[] = [];

  const captureDirectory = join(root, "records", "captures");
  const captureEntries = (await listDirectory(root, captureDirectory)).sort((a, b) => a.name.localeCompare(b.name));
  if (captureEntries.length > MAX_CAPTURE_RECORDS) throw new Error("too many filesystem Captures to import");
  const captures: CaptureRecord[] = [];
  const captureById = new Map<string, CaptureRecord>();
  const captureByKey = new Map<string, CaptureRecord>();
  for (const entry of captureEntries) {
    assertRegularEntry(entry, "Capture directory");
    if (!/^cap_[a-f0-9]{32}\.json$/.test(entry.name)) throw new Error("unrecognized Capture record file");
    const file = await secureRead(root, join(captureDirectory, entry.name), MAX_CAPTURE_JSON_BYTES);
    sourceFiles.push(file);
    const capture = captureRecordSchema.parse(parseJson(file.bytes, "Capture record"));
    if (`${capture.id}.json` !== entry.name || captureById.has(capture.id)) throw new Error("duplicate or mismatched Capture record");
    if (captureByKey.has(capture.idempotency_key)) throw new Error("duplicate Capture idempotency key");
    captureById.set(capture.id, capture);
    captureByKey.set(capture.idempotency_key, capture);
    captures.push(capture);
  }

  const indexDirectory = join(root, "records", "idempotency");
  const indexEntries = (await listDirectory(root, indexDirectory)).sort((a, b) => a.name.localeCompare(b.name));
  if (indexEntries.length > MAX_CAPTURE_RECORDS) throw new Error("too many Capture idempotency indices to import");
  const indexedCaptures = new Set<string>();
  for (const entry of indexEntries) {
    assertRegularEntry(entry, "idempotency index directory");
    if (!/^[a-f0-9]{64}\.json$/.test(entry.name)) throw new Error("unrecognized idempotency index file");
    const file = await secureRead(root, join(indexDirectory, entry.name), MAX_IDEMPOTENCY_JSON_BYTES);
    sourceFiles.push(file);
    const index = idempotencyRecordSchema.parse(parseJson(file.bytes, "idempotency index"));
    const capture = captureById.get(index.capture_id);
    if (!capture || capture.idempotency_key !== index.idempotency_key
      || idempotencyRecordPath(root, index.idempotency_key) !== file.path
      || indexedCaptures.has(index.capture_id)) {
      throw new Error("idempotency index conflicts with its Capture");
    }
    indexedCaptures.add(index.capture_id);
  }
  if (indexedCaptures.size !== captures.length) throw new Error("Capture is missing its idempotency index");

  const eventsDirectory = join(root, "events");
  const eventEntries = (await listDirectory(root, eventsDirectory)).sort((a, b) => a.name.localeCompare(b.name));
  if (eventEntries.length > MAX_AUDIT_FILES + 1) throw new Error("too many Capture audit files to import");
  const events = new Map<string, CaptureAuditEvent>();
  for (const entry of eventEntries) {
    if (entry.isDirectory() && entry.name === "model-calls") continue;
    assertRegularEntry(entry, "Capture audit directory");
    if (!/^\d{4}-(0[1-9]|1[0-2])\.jsonl$/.test(entry.name)) throw new Error("unrecognized Capture audit file");
    const file = await secureRead(root, join(eventsDirectory, entry.name), MAX_AUDIT_FILE_BYTES);
    sourceFiles.push(file);
    if (file.bytes.length > 0 && file.bytes.at(-1) !== 0x0a) throw new Error("partial Capture audit event tail");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    for (const line of text.split("\n")) {
      if (!line) continue;
      const event = captureAuditEventSchema.parse(parseJson(Buffer.from(line, "utf8"), "Capture audit event"));
      if (event.event_id !== captureReceivedEventId(event.capture_id) || events.has(event.event_id)) {
        throw new Error("duplicate or non-deterministic Capture audit event");
      }
      events.set(event.event_id, event);
    }
  }

  const expectedObjectDigests = new Set(captures.map(({ object }) => object.digest));
  const objectFiles = new Map<string, InventoryFile>();
  const objectRoot = join(root, "objects", "sha256");
  const objectShards = (await listDirectory(root, objectRoot)).sort((a, b) => a.name.localeCompare(b.name));
  if (objectShards.length > 256) throw new Error("too many immutable object shards");
  for (const shard of objectShards) {
    if (shard.isSymbolicLink() || !shard.isDirectory() || !/^[a-f0-9]{2}$/.test(shard.name)) {
      throw new Error("invalid object shard directory");
    }
    const shardPath = join(objectRoot, shard.name);
    const shardEntries = (await listDirectory(root, shardPath)).sort((a, b) => a.name.localeCompare(b.name));
    if (objectFiles.size + shardEntries.length > expectedObjectDigests.size) {
      throw new Error("unreferenced immutable Capture object");
    }
    for (const entry of shardEntries) {
      assertRegularEntry(entry, "object shard");
      if (!DIGEST_PATTERN.test(entry.name) || entry.name.slice(0, 2) !== shard.name || objectFiles.has(entry.name)) {
        throw new Error("invalid immutable object path");
      }
      const file = await secureRead(root, join(shardPath, entry.name), MAX_OBJECT_BYTES);
      if (file.digest !== entry.name) throw new Error("immutable object digest mismatch");
      sourceFiles.push(file);
      objectFiles.set(entry.name, file);
    }
  }
  if (objectFiles.size !== expectedObjectDigests.size
    || [...objectFiles.keys()].some((digest) => !expectedObjectDigests.has(digest))) {
    throw new Error("unreferenced or missing immutable Capture object");
  }

  const summaries = captures.map((capture) => {
    const eventId = captureReceivedEventId(capture.id);
    const event = events.get(eventId);
    const object = objectFiles.get(capture.object.digest);
    if (!event || event.capture_id !== capture.id || event.object_digest !== capture.object.digest
      || event.occurred_at !== capture.created_at) {
      throw new Error("Capture audit evidence is missing or conflicts with its Capture");
    }
    if (!object || object.bytes.length !== capture.object.bytes) throw new Error("Capture object size conflicts with metadata");
    return {
      capture_id: capture.id,
      capture_digest: digestCanonicalJson(capture),
      event_id: event.event_id,
      object_digest: capture.object.digest,
      object_bytes: capture.object.bytes
    };
  });
  if (events.size !== captures.length) throw new Error("Capture audit log contains an unindexed event");
  if (sourceFiles.length > MAX_INVENTORY_FILES) throw new Error("filesystem Capture inventory exceeds its file bound");
  const sourceDigest = digestCanonicalJson(sourceFiles
    .map(({ relativePath, digest, bytes }) => ({ path: relativePath, digest, bytes: bytes.length }))
    .sort((left, right) => left.path.localeCompare(right.path)));
  const manifest: CaptureImportManifestV1 = {
    schema_version: 1,
    source_digest: sourceDigest,
    captures: summaries,
    counts: { captures: captures.length, events: events.size, objects: objectFiles.size }
  };
  return { manifest, captures, events };
}

export async function planFilesystemCaptureImport(input: { root: string }): Promise<CaptureImportManifestV1> {
  return (await scanCaptureInventory(input.root)).manifest;
}

function sameCapture(left: CaptureRecord, right: CaptureRecord): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export async function applyFilesystemCaptureImport(input: {
  root: string;
  expectedSourceDigest: string;
  captures: CaptureStore;
  audit: CaptureAuditLog;
}): Promise<{ created: number; existing: number; sourceDigest: string }> {
  if (!DIGEST_PATTERN.test(input.expectedSourceDigest)) throw new Error("expected source digest is invalid");
  const inventory = await scanCaptureInventory(input.root);
  if (inventory.manifest.source_digest !== input.expectedSourceDigest) {
    throw new Error("filesystem Capture source changed after planning; digest mismatch");
  }

  const existingIds = new Set<string>();
  for (const capture of inventory.captures) {
    const [byId, byKey] = await Promise.all([
      input.captures.get(capture.id),
      input.captures.findByIdempotencyKey(capture.idempotency_key)
    ]);
    if (byId === null && byKey === null) continue;
    if (!byId || !byKey || !sameCapture(byId, capture) || !sameCapture(byKey, capture)) {
      throw new Error("Registry Capture or idempotency conflict");
    }
    existingIds.add(capture.id);
  }

  let created = 0;
  let existing = existingIds.size;
  for (const capture of inventory.captures) {
    if (!existingIds.has(capture.id)) {
      const result = await input.captures.create(capture);
      if (result === "created") {
        created += 1;
      } else {
        const [byId, byKey] = await Promise.all([
          input.captures.get(capture.id),
          input.captures.findByIdempotencyKey(capture.idempotency_key)
        ]);
        if (!byId || !byKey || !sameCapture(byId, capture) || !sameCapture(byKey, capture)) {
          throw new Error("Registry Capture conflicted during import");
        }
        existing += 1;
      }
    }
    const event = inventory.events.get(captureReceivedEventId(capture.id));
    if (!event) throw new Error("Capture audit evidence disappeared during import");
    await input.audit.ensure(event);
  }
  return { created, existing, sourceDigest: inventory.manifest.source_digest };
}
