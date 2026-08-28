import { open, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { getLocksDir } from "../paths";
import type { MutationResult } from "./store";

// Locks older than this are presumed abandoned by a crashed holder.
const STALE_LOCK_MS = 10 * 60 * 1000;

export class ProjectLockError extends Error {
  constructor(slug: string) {
    super(`Project "${slug}" is currently locked by another operation`);
    this.name = "ProjectLockError";
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // EPERM means the process exists but belongs to another user
    return err?.code === "EPERM";
  }
}

async function isLockStale(lockFile: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(lockFile, "utf8");
  } catch {
    // Unreadable lock: treat as live to avoid breaking mutual exclusion
    return false;
  }

  const [pidRaw, tsRaw] = raw.split("\n");
  const pid = Number.parseInt(pidRaw, 10);
  const timestamp = Number.parseInt(tsRaw, 10);

  // Holder process is gone (same-pid holders are never reclaimed this way)
  if (Number.isFinite(pid) && pid !== process.pid && !isProcessAlive(pid)) {
    return true;
  }
  // Lock held longer than any sane operation
  if (Number.isFinite(timestamp) && Date.now() - timestamp > STALE_LOCK_MS) {
    return true;
  }
  return false;
}

async function acquireLock(lockFile: string) {
  const fileHandle = await open(lockFile, "wx");
  try {
    await fileHandle.writeFile(`${process.pid}\n${Date.now()}\n`, "utf8");
  } catch (err) {
    // The lock file was already created by open('wx'); don't leave it behind
    try {
      await fileHandle.close();
    } catch {
      // Best-effort cleanup
    }
    try {
      await unlink(lockFile);
    } catch {
      // Best-effort cleanup
    }
    throw err;
  }
  return fileHandle;
}

export async function withProjectLock<T>(
  slug: string,
  fn: () => Promise<T>,
  root?: string
): Promise<T> {
  const locksDir = getLocksDir(root);
  const lockFile = resolve(locksDir, `${slug}.lock`);

  let fileHandle: any;
  try {
    fileHandle = await acquireLock(lockFile);
  } catch (err: any) {
    if (err.code !== "EEXIST") throw err;
    if (!(await isLockStale(lockFile))) {
      throw new ProjectLockError(slug);
    }
    // Reclaim the stale lock and retry acquisition once
    try {
      await unlink(lockFile);
    } catch {
      // Best-effort cleanup
    }
    try {
      fileHandle = await acquireLock(lockFile);
    } catch (retryErr: any) {
      if (retryErr.code === "EEXIST") throw new ProjectLockError(slug);
      throw retryErr;
    }
  }

  try {
    return await fn();
  } finally {
    try {
      if (fileHandle) {
        await fileHandle.close();
      }
      await unlink(lockFile);
    } catch {
      // Best-effort cleanup
    }
  }
}

/**
 * Wraps withProjectLock for MutationResult-returning store mutations:
 * lock contention surfaces as `{ ok: false, code: "LOCKED" }` instead of throwing.
 */
export async function withProjectLockGuard<T>(
  slug: string,
  fn: () => Promise<MutationResult<T>>,
  root?: string
): Promise<MutationResult<T>> {
  try {
    return await withProjectLock(slug, fn, root);
  } catch (err) {
    if (err instanceof ProjectLockError) {
      return { ok: false, code: "LOCKED", message: err.message };
    }
    throw err;
  }
}
