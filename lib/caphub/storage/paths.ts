import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { captureIdSchema, idempotencyKeySchema } from "../domain/schemas";

const SHA256_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CaphubPathError extends Error {
  readonly code = "invalid_caphub_path" as const;

  constructor(message: string) {
    super(message);
    this.name = "CaphubPathError";
  }
}

export function resolveCaphubRoot(root: string): string {
  if (typeof root !== "string" || root.length === 0) {
    throw new CaphubPathError("Caphub state root is required");
  }
  if (root.includes("~")) {
    throw new CaphubPathError("Caphub state root must be fully resolved (no '~')");
  }
  if (/[$`*?[\]{}!]/.test(root)) {
    throw new CaphubPathError("Caphub state root must not contain variables or glob characters");
  }
  if (!isAbsolute(root)) {
    throw new CaphubPathError("Caphub state root must be an absolute, resolved path");
  }

  const resolved = resolve(root);
  if (resolved !== root) {
    throw new CaphubPathError("Caphub state root must already be fully resolved");
  }

  const segments = resolved.split(sep).filter((part) => part.length > 0);
  if (
    segments.length < 2 ||
    segments[segments.length - 1] !== "caphub" ||
    segments[segments.length - 2] !== "state"
  ) {
    throw new CaphubPathError(
      "Caphub state root must be the resolved '<ALLJOBS_HOME>/state/caphub' directory"
    );
  }

  let realRoot: string;
  try {
    realRoot = realpathSync(resolved);
  } catch {
    throw new CaphubPathError("Caphub state root must exist and resolve to a directory");
  }
  if (realRoot !== resolved) {
    throw new CaphubPathError("Caphub state root must not contain symlink aliases");
  }
  if (!lstatSync(realRoot).isDirectory()) {
    throw new CaphubPathError("Caphub state root must resolve to a directory");
  }

  return resolved;
}

function assertNoExistingSymlink(root: string, target: string): void {
  const suffix = relative(root, target);
  let current = root;

  for (const segment of suffix.split(sep)) {
    if (segment.length === 0) continue;
    current = join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new CaphubPathError("resolved path crosses a symlink beneath the Caphub state root");
      }
    } catch (error) {
      if (error instanceof CaphubPathError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new CaphubPathError("unable to inspect a Caphub path component");
    }
  }
}

function joinUnder(root: string, ...segments: string[]): string {
  const resolvedRoot = resolveCaphubRoot(root);
  const joined = resolve(join(resolvedRoot, ...segments));
  if (!joined.startsWith(resolvedRoot + sep)) {
    throw new CaphubPathError("resolved path escapes the Caphub state root");
  }
  assertNoExistingSymlink(resolvedRoot, joined);
  return joined;
}

function assertCaptureId(value: string): string {
  const parsed = captureIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new CaphubPathError(`invalid Capture ID: ${JSON.stringify(value)}`);
  }
  return parsed.data;
}

function assertDigest(value: string): string {
  if (typeof value !== "string" || !SHA256_DIGEST_PATTERN.test(value)) {
    throw new CaphubPathError(`invalid SHA-256 digest: ${JSON.stringify(value)}`);
  }
  return value;
}

function assertIdempotencyKey(value: string): string {
  const parsed = idempotencyKeySchema.safeParse(value);
  if (!parsed.success || value.includes("/") || value.includes("\\")) {
    throw new CaphubPathError(`invalid idempotency key: ${JSON.stringify(value)}`);
  }
  return parsed.data;
}

function assertMonth(value: string): string {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) {
    throw new CaphubPathError(`invalid event month: ${JSON.stringify(value)}`);
  }
  return value;
}

function hashIdempotencyKey(value: string): string {
  return createHash("sha256").update(assertIdempotencyKey(value), "utf8").digest("hex");
}

export function captureRecordPath(root: string, captureId: string): string {
  return joinUnder(root, "records", "captures", `${assertCaptureId(captureId)}.json`);
}

export function idempotencyRecordPath(root: string, idempotencyKey: string): string {
  return joinUnder(root, "records", "idempotency", `${hashIdempotencyKey(idempotencyKey)}.json`);
}

export function objectPath(root: string, digest: string): string {
  const validatedDigest = assertDigest(digest);
  return joinUnder(root, "objects", "sha256", validatedDigest.slice(0, 2), validatedDigest);
}

export function eventsPath(root: string, month: string): string {
  return joinUnder(root, "events", `${assertMonth(month)}.jsonl`);
}

export function idempotencyLockPath(root: string, idempotencyKey: string): string {
  return joinUnder(root, "locks", `${hashIdempotencyKey(idempotencyKey)}.lock`);
}
