import { randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  open,
  unlink,
  type FileHandle
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import {
  captureIdSchema,
  captureRecordSchema,
  idempotencyKeySchema
} from "../domain/schemas";
import type { CaptureRecord } from "../domain/types";
import type { CaptureStore } from "./contracts";
import {
  assertSecureDirectoryChain,
  assertSecureFileHandle,
  ensureSecureDirectoryChain,
  syncDirectory
} from "./local-objects";
import {
  captureRecordPath,
  idempotencyRecordPath,
  resolveCaphubRoot
} from "./paths";

const FILE_MODE = 0o600;
const MAX_CAPTURE_JSON_BYTES = 16 * 1024;
const MAX_IDEMPOTENCY_JSON_BYTES = 4 * 1024;

const idempotencyRecordSchema = z.object({
  schema_version: z.literal(1),
  idempotency_key: idempotencyKeySchema,
  capture_id: captureIdSchema
}).strict();

type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;

export interface AtomicJsonFileOperations {
  writeTemp(handle: FileHandle, bytes: Uint8Array): Promise<void>;
}

const createChains = new Map<string, Promise<void>>();

async function serializeByPath<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = createChains.get(path) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  const marker = run.then(
    () => undefined,
    () => undefined
  );
  createChains.set(path, marker);
  try {
    return await run;
  } finally {
    if (createChains.get(path) === marker) createChains.delete(path);
  }
}

async function writeAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, offset);
    if (bytesWritten <= 0) throw new Error("unable to make progress writing Caphub JSON");
    offset += bytesWritten;
  }
}

async function readAllAt(handle: FileHandle, size: number): Promise<Buffer> {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return bytes.subarray(0, offset);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

async function atomicCreate(
  root: string,
  finalPath: string,
  bytes: Uint8Array,
  operations: AtomicJsonFileOperations
): Promise<boolean> {
  const parent = dirname(finalPath);
  await ensureSecureDirectoryChain(root, parent);
  await assertSecureDirectoryChain(root, parent);
  const tempPath = join(parent, `.${basename(finalPath)}.${randomUUID()}.tmp`);
  const handle = await open(
    tempPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
    FILE_MODE
  );
  try {
    await assertSecureFileHandle(handle);
    await assertSecureDirectoryChain(root, parent);
    await operations.writeTemp(handle, bytes);
    await handle.sync();
    const stat = await handle.stat();
    if (stat.size !== bytes.byteLength || !equalBytes(await readAllAt(handle, stat.size), bytes)) {
      throw new Error("staged Caphub JSON does not match the requested durable bytes");
    }
    await assertSecureDirectoryChain(root, parent);
    try {
      await link(tempPath, finalPath);
      await syncDirectory(parent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
    await assertSecureDirectoryChain(root, parent);
    return true;
  } finally {
    await handle.close();
    try {
      await unlink(tempPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function readOptionalFile(
  root: string,
  path: string,
  maximumBytes: number
): Promise<Buffer | null> {
  const parent = dirname(path);
  await assertSecureDirectoryChain(root, root);
  try {
    await lstat(parent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  await assertSecureDirectoryChain(root, parent);
  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    await assertSecureFileHandle(handle);
    await assertSecureDirectoryChain(root, parent);
    const stat = await handle.stat();
    if (stat.size > maximumBytes) throw new Error("Caphub JSON exceeds its bounded record size");
    const bytes = await readAllAt(handle, stat.size);
    await assertSecureDirectoryChain(root, parent);
    return bytes;
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

function canonicalCapture(record: CaptureRecord): string {
  return JSON.stringify(captureRecordSchema.parse(record));
}

export class FilesystemCaptureStore implements CaptureStore {
  private readonly root: string;
  private readonly operations: AtomicJsonFileOperations;

  constructor(root: string, operations: Partial<AtomicJsonFileOperations> = {}) {
    this.root = resolveCaphubRoot(root);
    this.operations = { writeTemp: operations.writeTemp ?? writeAll };
  }

  async get(id: string): Promise<CaptureRecord | null> {
    const path = captureRecordPath(this.root, id);
    const bytes = await readOptionalFile(this.root, path, MAX_CAPTURE_JSON_BYTES);
    if (bytes === null) return null;
    return captureRecordSchema.parse(parseJson(bytes, "Capture record"));
  }

  async findByIdempotencyKey(key: string): Promise<CaptureRecord | null> {
    const path = idempotencyRecordPath(this.root, key);
    const bytes = await readOptionalFile(this.root, path, MAX_IDEMPOTENCY_JSON_BYTES);
    if (bytes === null) return null;
    const index = idempotencyRecordSchema.parse(parseJson(bytes, "idempotency record"));
    if (index.idempotency_key !== key) {
      throw new Error("idempotency record does not match the requested key");
    }
    const capture = await this.get(index.capture_id);
    if (capture === null) throw new Error("idempotency record references a missing Capture");
    if (capture.idempotency_key !== key) {
      throw new Error("Capture does not match its idempotency record");
    }
    return capture;
  }

  async create(record: CaptureRecord): Promise<"created" | "conflict"> {
    const parsed = captureRecordSchema.parse(record);
    const indexPath = idempotencyRecordPath(this.root, parsed.idempotency_key);
    return serializeByPath(indexPath, async () => {
      if (await this.findByIdempotencyKey(parsed.idempotency_key)) return "conflict";

      const recordPath = captureRecordPath(this.root, parsed.id);
      const existing = await this.get(parsed.id);
      if (existing && canonicalCapture(existing) !== canonicalCapture(parsed)) return "conflict";

      const recordBytes = new TextEncoder().encode(`${canonicalCapture(parsed)}\n`);
      if (!existing) {
        const createdRecord = await atomicCreate(this.root, recordPath, recordBytes, this.operations);
        if (!createdRecord) {
          const winner = await this.get(parsed.id);
          if (!winner || canonicalCapture(winner) !== canonicalCapture(parsed)) return "conflict";
        }
      }

      const index: IdempotencyRecord = {
        schema_version: 1,
        idempotency_key: parsed.idempotency_key,
        capture_id: parsed.id
      };
      const indexBytes = new TextEncoder().encode(`${JSON.stringify(index)}\n`);
      const createdIndex = await atomicCreate(this.root, indexPath, indexBytes, this.operations);
      return createdIndex ? "created" : "conflict";
    });
  }
}
