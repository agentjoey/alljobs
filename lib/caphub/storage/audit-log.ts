import { createHash, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { captureAuditEventSchema, captureIdSchema } from "../domain/schemas";
import type { CaptureAuditEvent } from "../domain/types";
import type { CaptureAuditLog } from "./contracts";
import {
  assertSecureDirectoryChain,
  assertSecureFileHandle,
  ensureSecureDirectoryChain,
  syncDirectory
} from "./local-objects";
import { eventsPath, resolveCaphubRoot } from "./paths";

const FILE_MODE = 0o600;
const MAX_MONTHLY_AUDIT_BYTES = 16 * 1024 * 1024;
const auditChains = new Map<string, Promise<void>>();

export interface AuditFileOperations {
  append(handle: FileHandle, bytes: Uint8Array): Promise<void>;
  syncFile(handle: FileHandle): Promise<void>;
  syncParent(path: string): Promise<void>;
}

interface AuditScan {
  matching: CaptureAuditEvent | null;
  truncateTo: number | null;
}

export function captureReceivedEventId(captureId: string): string {
  const parsed = captureIdSchema.parse(captureId);
  return `evt_${createHash("sha256").update(parsed, "utf8").digest("hex").slice(0, 32)}`;
}

async function serializeByFile<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = auditChains.get(path) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  const marker = run.then(
    () => undefined,
    () => undefined
  );
  auditChains.set(path, marker);
  try {
    return await run;
  } finally {
    if (auditChains.get(path) === marker) auditChains.delete(path);
  }
}

async function appendAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes.subarray(offset));
    if (bytesWritten <= 0) throw new Error("unable to make progress appending Caphub audit event");
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

function sameEvent(left: CaptureAuditEvent, right: CaptureAuditEvent): boolean {
  const leftBytes = Buffer.from(JSON.stringify(left));
  const rightBytes = Buffer.from(JSON.stringify(right));
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function parseCompleteLines(bytes: Buffer, sought: CaptureAuditEvent): CaptureAuditEvent | null {
  if (bytes.byteLength === 0) return null;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  let matching: CaptureAuditEvent | null = null;
  for (const line of lines) {
    if (line.length === 0) throw new Error("invalid blank line in Caphub audit log");
    let decoded: unknown;
    try {
      decoded = JSON.parse(line);
    } catch {
      throw new Error("invalid JSON line in Caphub audit log");
    }
    const parsed = captureAuditEventSchema.parse(decoded);
    if (parsed.event_id !== captureReceivedEventId(parsed.capture_id)) {
      throw new Error("audit event_id is not deterministic for its Capture ID");
    }
    if (parsed.event_id === sought.event_id) {
      if (!sameEvent(parsed, sought)) {
        throw new Error("existing audit event_id has different immutable content");
      }
      matching = parsed;
    }
  }
  return matching;
}

async function scanAuditFile(
  root: string,
  path: string,
  sought: CaptureAuditEvent
): Promise<AuditScan> {
  const parent = dirname(path);
  await assertSecureDirectoryChain(root, parent);
  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { matching: null, truncateTo: null };
    }
    throw error;
  }
  try {
    await assertSecureFileHandle(handle);
    await assertSecureDirectoryChain(root, parent);
    const stat = await handle.stat();
    if (stat.size > MAX_MONTHLY_AUDIT_BYTES) {
      throw new Error("monthly Caphub audit log exceeds its bounded scan size");
    }
    const bytes = await readAllAt(handle, stat.size);
    await assertSecureDirectoryChain(root, parent);
    const hasPartialTail = bytes.length > 0 && bytes.at(-1) !== 0x0a;
    const lastNewline = hasPartialTail ? bytes.lastIndexOf(0x0a) : bytes.length - 1;
    const completeLength = hasPartialTail ? lastNewline + 1 : bytes.length;
    return {
      matching: parseCompleteLines(bytes.subarray(0, completeLength), sought),
      truncateTo: hasPartialTail ? completeLength : null
    };
  } finally {
    await handle.close();
  }
}

async function repairPartialTail(root: string, path: string, truncateTo: number): Promise<void> {
  const parent = dirname(path);
  await assertSecureDirectoryChain(root, parent);
  const handle = await open(path, constants.O_WRONLY | constants.O_NOFOLLOW);
  try {
    await assertSecureFileHandle(handle);
    await assertSecureDirectoryChain(root, parent);
    await handle.truncate(truncateTo);
    await handle.sync();
    await assertSecureDirectoryChain(root, parent);
  } finally {
    await handle.close();
  }
}

async function flushAuditFile(
  root: string,
  path: string,
  operations: AuditFileOperations
): Promise<void> {
  const parent = dirname(path);
  await assertSecureDirectoryChain(root, parent);
  const handle = await open(path, constants.O_WRONLY | constants.O_NOFOLLOW);
  try {
    await assertSecureFileHandle(handle);
    await assertSecureDirectoryChain(root, parent);
    await operations.syncFile(handle);
    await assertSecureDirectoryChain(root, parent);
    await operations.syncParent(parent);
  } finally {
    await handle.close();
  }
}

export class FilesystemCaptureAuditLog implements CaptureAuditLog {
  private readonly root: string;
  private readonly operations: AuditFileOperations;

  constructor(root: string, operations: Partial<AuditFileOperations> = {}) {
    this.root = resolveCaphubRoot(root);
    this.operations = {
      append: operations.append ?? appendAll,
      syncFile: operations.syncFile ?? ((handle) => handle.sync()),
      syncParent: operations.syncParent ?? syncDirectory
    };
  }

  async ensure(event: CaptureAuditEvent): Promise<"appended" | "existing"> {
    const parsed = captureAuditEventSchema.parse(event);
    if (parsed.event_id !== captureReceivedEventId(parsed.capture_id)) {
      throw new Error("audit event_id must be deterministic for its Capture ID");
    }
    const month = parsed.occurred_at.slice(0, 7);
    const path = eventsPath(this.root, month);

    return serializeByFile(path, async () => {
      const parent = dirname(path);
      await ensureSecureDirectoryChain(this.root, parent);
      const scan = await scanAuditFile(this.root, path, parsed);
      if (scan.truncateTo !== null) {
        await repairPartialTail(this.root, path, scan.truncateTo);
      }
      if (scan.matching) {
        await flushAuditFile(this.root, path, this.operations);
        return "existing";
      }

      const bytes = new TextEncoder().encode(`${JSON.stringify(parsed)}\n`);
      await assertSecureDirectoryChain(this.root, parent);
      const handle = await open(
        path,
        constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW,
        FILE_MODE
      );
      try {
        await assertSecureFileHandle(handle);
        await assertSecureDirectoryChain(this.root, parent);
        await this.operations.append(handle, bytes);
        await this.operations.syncFile(handle);
        await assertSecureDirectoryChain(this.root, parent);
        await this.operations.syncParent(parent);
      } finally {
        await handle.close();
      }
      return "appended";
    });
  }
}
