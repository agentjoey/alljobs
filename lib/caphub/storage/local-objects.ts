import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  unlink,
  type FileHandle
} from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { captureMimeTypeSchema, objectRefSchema } from "../domain/schemas";
import type { CaptureMimeType, ObjectRef } from "../domain/types";
import type { CaptureObjectStore } from "./contracts";
import { objectPath, resolveCaphubRoot } from "./paths";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const UNSAFE_WRITE_BITS = 0o022;

export class CaphubStorageSecurityError extends Error {
  readonly code = "unsafe_caphub_storage" as const;

  constructor(message: string) {
    super(message);
    this.name = "CaphubStorageSecurityError";
  }
}

export class ImmutableObjectMismatchError extends Error {
  readonly code = "immutable_object_mismatch" as const;

  constructor() {
    super("immutable object mismatch at its SHA-256 address");
    this.name = "ImmutableObjectMismatchError";
  }
}

export interface ImmutableObjectFileOperations {
  publish(tempPath: string, finalPath: string): Promise<void>;
}

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    throw new CaphubStorageSecurityError("current uid is unavailable");
  }
  return process.getuid();
}

async function assertSecureDirectory(path: string): Promise<void> {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    throw new CaphubStorageSecurityError(
      `unable to inspect required Caphub directory (${(error as NodeJS.ErrnoException).code ?? "unknown"})`
    );
  }
  if (stat.isSymbolicLink()) {
    throw new CaphubStorageSecurityError("required Caphub directory must not be a symlink");
  }
  if (!stat.isDirectory()) {
    throw new CaphubStorageSecurityError("required Caphub path is not a directory");
  }
  if (stat.uid !== currentUid()) {
    throw new CaphubStorageSecurityError("required Caphub directory is not owned by the current uid");
  }
  if ((stat.mode & UNSAFE_WRITE_BITS) !== 0) {
    throw new CaphubStorageSecurityError(
      "required Caphub directory must not be group or other writable"
    );
  }
}

export async function ensureSecureDirectoryChain(root: string, targetDirectory: string): Promise<void> {
  const resolvedRoot = resolveCaphubRoot(root);
  const suffix = relative(resolvedRoot, targetDirectory);
  if (suffix === "" || suffix === ".") {
    await assertSecureDirectory(resolvedRoot);
    return;
  }
  if (suffix.startsWith(`..${sep}`) || suffix === "..") {
    throw new CaphubStorageSecurityError("required directory escapes the Caphub root");
  }

  let current = resolvedRoot;
  await assertSecureDirectory(current);
  for (const segment of suffix.split(sep)) {
    if (!segment) continue;
    current = join(current, segment);
    try {
      await mkdir(current, { mode: DIRECTORY_MODE });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    await assertSecureDirectory(current);
  }
}

export async function assertSecureDirectoryChain(root: string, targetDirectory: string): Promise<void> {
  const resolvedRoot = resolveCaphubRoot(root);
  const suffix = relative(resolvedRoot, targetDirectory);
  if (suffix.startsWith(`..${sep}`) || suffix === "..") {
    throw new CaphubStorageSecurityError("required directory escapes the Caphub root");
  }
  let current = resolvedRoot;
  await assertSecureDirectory(current);
  if (suffix === "" || suffix === ".") return;
  for (const segment of suffix.split(sep)) {
    if (!segment) continue;
    current = join(current, segment);
    await assertSecureDirectory(current);
  }
}

export async function assertSecureFileHandle(handle: FileHandle): Promise<void> {
  const stat = await handle.stat();
  if (!stat.isFile()) {
    throw new CaphubStorageSecurityError("Caphub file handle is not a regular file");
  }
  if (stat.uid !== currentUid()) {
    throw new CaphubStorageSecurityError("Caphub file is not owned by the current uid");
  }
  if ((stat.mode & UNSAFE_WRITE_BITS) !== 0) {
    throw new CaphubStorageSecurityError("Caphub file must not be group or other writable");
  }
}

export async function syncDirectory(path: string): Promise<void> {
  await assertSecureDirectory(path);
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    const stat = await handle.stat();
    if (!stat.isDirectory() || stat.uid !== currentUid() || (stat.mode & UNSAFE_WRITE_BITS) !== 0) {
      throw new CaphubStorageSecurityError("Caphub directory handle is not secure");
    }
    await handle.sync();
    await assertSecureDirectory(path);
  } finally {
    await handle.close();
  }
}

async function writeAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, offset);
    if (bytesWritten <= 0) throw new Error("unable to make progress writing immutable object");
    offset += bytesWritten;
  }
}

async function defaultPublish(tempPath: string, finalPath: string): Promise<void> {
  await link(tempPath, finalPath);
  await syncDirectory(dirname(finalPath));
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

async function readSecureFile(root: string, path: string, expectedLength: number): Promise<Buffer> {
  const parent = dirname(path);
  await assertSecureDirectoryChain(root, parent);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await assertSecureFileHandle(handle);
    await assertSecureDirectoryChain(root, parent);
    const stat = await handle.stat();
    if (stat.size !== expectedLength) throw new ImmutableObjectMismatchError();
    const bytes = await readAllAt(handle, stat.size);
    await assertSecureDirectoryChain(root, parent);
    return bytes;
  } finally {
    await handle.close();
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export class LocalCaptureObjectStore implements CaptureObjectStore {
  private readonly root: string;
  private readonly operations: ImmutableObjectFileOperations;

  constructor(root: string, operations: Partial<ImmutableObjectFileOperations> = {}) {
    this.root = resolveCaphubRoot(root);
    this.operations = { publish: operations.publish ?? defaultPublish };
  }

  async putImmutable(input: {
    bytes: Uint8Array;
    mimeType: CaptureMimeType;
  }): Promise<ObjectRef> {
    captureMimeTypeSchema.parse(input.mimeType);
    if (
      !ArrayBuffer.isView(input.bytes) ||
      input.bytes.BYTES_PER_ELEMENT !== 1 ||
      input.bytes.byteLength === 0
    ) {
      throw new TypeError("immutable object bytes must be a non-empty Uint8Array");
    }

    const digest = createHash("sha256").update(input.bytes).digest("hex");
    const ref = objectRefSchema.parse({
      algorithm: "sha256",
      digest,
      key: `sha256/${digest.slice(0, 2)}/${digest}`,
      bytes: input.bytes.byteLength
    });
    const finalPath = objectPath(this.root, digest);
    const parent = dirname(finalPath);
    await ensureSecureDirectoryChain(this.root, parent);

    try {
      const existing = await readSecureFile(this.root, finalPath, input.bytes.byteLength);
      if (!sameBytes(existing, input.bytes)) throw new ImmutableObjectMismatchError();
      return ref;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const tempPath = join(parent, `.${digest}.${randomUUID()}.tmp`);
    await assertSecureDirectoryChain(this.root, parent);
    const handle = await open(
      tempPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
      FILE_MODE
    );
    try {
      await assertSecureFileHandle(handle);
      await assertSecureDirectoryChain(this.root, parent);
      await writeAll(handle, input.bytes);
      await handle.sync();
      const staged = await readAllAt(handle, input.bytes.byteLength);
      if (!sameBytes(staged, input.bytes)) throw new ImmutableObjectMismatchError();
      await assertSecureDirectoryChain(this.root, parent);
      try {
        await this.operations.publish(tempPath, finalPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      await assertSecureDirectoryChain(this.root, parent);
    } finally {
      await handle.close();
      try {
        await unlink(tempPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    const durable = await readSecureFile(this.root, finalPath, input.bytes.byteLength);
    if (!sameBytes(durable, input.bytes)) throw new ImmutableObjectMismatchError();
    return ref;
  }
}
