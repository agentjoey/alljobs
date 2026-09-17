import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

export const DEPLOYMENT_LOCK_DIRECTORY = ".caphub-deployment.lock";

export interface OperationRecord {
  schema_version: 1;
  deployment_id: string;
  plan_digest: string;
  action: "publish" | "rollback";
  stage: "versioned" | "realized" | "completed";
  release: {
    record_id: string;
    version: number;
    digest: string;
  };
  manifest_digest: string;
  created_at: string;
}

function isHex64(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/** Parse target-controlled operation JSON; malformed or inconsistent records
 * are unreadable rather than trusted. */
export async function readOperation(root: string, deploymentId: string): Promise<OperationRecord | null> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(join(root, "operations", `${deploymentId}.json`), "utf8"));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const release = record.release as Record<string, unknown> | undefined;
  if (record.schema_version !== 1
    || typeof record.deployment_id !== "string" || !/^dep_[a-f0-9]{32}$/.test(record.deployment_id)
    || !isHex64(record.plan_digest)
    || (record.action !== "publish" && record.action !== "rollback")
    || (record.stage !== "versioned" && record.stage !== "realized" && record.stage !== "completed")
    || !release
    || typeof release.record_id !== "string" || !/^rel_[a-f0-9]{32}$/.test(release.record_id)
    || !Number.isInteger(release.version) || (release.version as number) <= 0
    || !isHex64(release.digest)
    || !isHex64(record.manifest_digest)
    || typeof record.created_at !== "string") {
    return null;
  }
  return record as unknown as OperationRecord;
}

export async function writeOperation(root: string, record: OperationRecord): Promise<void> {
  const { mkdir, open, rename } = await import("node:fs/promises");
  await mkdir(join(root, "operations"), { recursive: true, mode: 0o700 });
  const path = join(root, "operations", `${record.deployment_id}.json`);
  const temporary = join("operations", `.${record.deployment_id}.json.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`);
  const handle = await open(join(root, temporary), "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(join(root, temporary), path);
}

export async function listIncompleteOperations(root: string): Promise<OperationRecord[]> {
  const { readdir } = await import("node:fs/promises");
  let names: string[] = [];
  try {
    names = await readdir(join(root, "operations"));
  } catch {
    return [];
  }
  const incomplete: OperationRecord[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    const record = await readOperation(root, name.replace(/\.json$/, ""));
    if (record && record.stage !== "completed") incomplete.push(record);
  }
  return incomplete;
}

export interface LockLease {
  schema_version: 1;
  operation_id: string;
  pid: number;
  acquired_at: string;
}

export class LockError extends Error {
  constructor(readonly code: "PUBLISH_RECOVERY_REQUIRED") {
    super(code);
    this.name = "LockError";
  }
}

export interface AcquireLeaseOptions {
  isProcessAlive?: (pid: number) => boolean;
  staleMs?: number;
  now?: () => number;
}

function defaultAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function writeLease(root: string, lockName: string, operationId: string, nowMs: number): Promise<void> {
  const { open, rename } = await import("node:fs/promises");
  const lease: LockLease = {
    schema_version: 1,
    operation_id: operationId,
    pid: process.pid,
    acquired_at: new Date(nowMs).toISOString()
  };
  const path = join(root, lockName, "owner.json");
  const temporary = join(root, lockName, `.owner.json.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

async function readLease(root: string, lockName: string): Promise<LockLease | null> {
  try {
    const parsed = JSON.parse(await readFile(join(root, lockName, "owner.json"), "utf8")) as Partial<LockLease>;
    if (parsed.schema_version !== 1 || typeof parsed.operation_id !== "string"
      || !Number.isInteger(parsed.pid) || typeof parsed.acquired_at !== "string") {
      return null;
    }
    return parsed as LockLease;
  } catch {
    return null;
  }
}

/**
 * Exclusive target lock with a provable-ownership lease. A second acquirer may
 * take over only when the existing lease names the SAME operation, the owner
 * pid is provably dead, and the lease is older than the staleness bound. A
 * live or unknown lock is left untouched and refuses with
 * PUBLISH_RECOVERY_REQUIRED.
 */
export async function acquireLeaseLock(
  root: string,
  lockName: string,
  operationId: string,
  options: AcquireLeaseOptions = {}
): Promise<() => Promise<void>> {
  const isAlive = options.isProcessAlive ?? defaultAlive;
  const staleMs = options.staleMs ?? 30_000;
  const now = options.now ?? Date.now;
  const lockPath = join(root, lockName);
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const lease = await readLease(root, lockName);
    const acquiredMs = lease ? Date.parse(lease.acquired_at) : Number.NaN;
    const provable = lease !== null
      && lease.operation_id === operationId
      && !isAlive(lease.pid)
      && Number.isFinite(acquiredMs)
      && now() - acquiredMs >= staleMs;
    if (!provable) {
      throw new LockError("PUBLISH_RECOVERY_REQUIRED");
    }
    await rm(lockPath, { recursive: true, force: true });
    await mkdir(lockPath, { mode: 0o700 });
  }
  await writeLease(root, lockName, operationId, now());
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await rm(lockPath, { recursive: true, force: true });
  };
}
