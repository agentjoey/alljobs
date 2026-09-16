import { constants } from "node:fs";
import { access, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { isSafeRelativePackagePath } from "../packages/schemas";
import type { P4ErrorCode } from "../packages/types";

export const TARGET_SENTINEL_FILE = ".caphub-target.json";

export class ProjectionPathError extends Error {
  constructor(
    readonly code: P4ErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "ProjectionPathError";
  }
}

export interface ValidatedTargetRoot {
  root: string;
  alias: string;
  sentinelPath: string;
}

interface SentinelContents {
  schema_version: 1;
  caphub: true;
  alias: string;
}

const UNSAFE_DIRECTORY_WRITE_BITS = 0o022;

export async function writeTargetSentinel(root: string, alias: string): Promise<void> {
  const sentinel: SentinelContents = { schema_version: 1, caphub: true, alias };
  await writeFile(join(root, TARGET_SENTINEL_FILE), `${JSON.stringify(sentinel, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

async function readSentinel(path: string): Promise<SentinelContents> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "Caphub target sentinel is missing or unreadable");
  }
  const sentinel = parsed as Partial<SentinelContents>;
  if (sentinel.schema_version !== 1 || sentinel.caphub !== true || typeof sentinel.alias !== "string") {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "Caphub target sentinel is not owned by Caphub");
  }
  return sentinel as SentinelContents;
}

async function assertNoManagedAncestor(root: string): Promise<void> {
  let current = dirname(root);
  for (let depth = 0; depth < 64; depth += 1) {
    if (current === dirname(current)) return;
    try {
      await access(join(current, TARGET_SENTINEL_FILE), constants.F_OK);
      throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target root is nested inside another Caphub-managed root");
    } catch (error) {
      if (error instanceof ProjectionPathError) throw error;
    }
    current = dirname(current);
  }
}

export async function validateTargetRoot(options: {
  root: string;
  alias: string;
  workspaceRoots?: readonly string[];
}): Promise<ValidatedTargetRoot> {
  const { root: candidate, alias } = options;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(alias)) {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target alias is not a bounded safe alias");
  }
  if (!isAbsolute(candidate) || candidate.includes("*") || candidate.includes("?")
    || candidate.includes("$") || candidate.startsWith("~") || candidate.includes("\\")) {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target root must be an explicit absolute path without variables or globs");
  }
  if (candidate === "/" || candidate === homedir()) {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target root must not be / or the home directory");
  }

  const workspaceRoots = options.workspaceRoots ?? [process.cwd()];
  const direct = await lstat(candidate).catch(() => {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target root does not exist");
  });
  if (direct.isSymbolicLink()) {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target root must not be a symlink");
  }
  const canonicalRoot = await realpath(candidate).catch(() => {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target root does not exist");
  });
  if (canonicalRoot !== resolve(candidate)) {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target root path must be canonical (no symlinked components)");
  }
  for (const workspace of workspaceRoots) {
    if (canonicalRoot === (await realpath(workspace).catch(() => resolve(workspace)))) {
      throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target root must not be a workspace or repository root");
    }
  }

  const metadata = await lstat(canonicalRoot).catch(() => {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target root is not a readable directory");
  });
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || metadata.uid !== currentUid
    || (metadata.mode & UNSAFE_DIRECTORY_WRITE_BITS) !== 0) {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "target root must be an owned real directory without group/other write bits");
  }

  await assertNoManagedAncestor(canonicalRoot);

  const sentinelPath = join(canonicalRoot, TARGET_SENTINEL_FILE);
  const sentinelMetadata = await lstat(sentinelPath).catch(() => {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "Caphub target sentinel is missing");
  });
  if (sentinelMetadata.isSymbolicLink() || !sentinelMetadata.isFile() || sentinelMetadata.uid !== currentUid) {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "Caphub target sentinel must be an owned regular file");
  }
  const sentinel = await readSentinel(sentinelPath);
  if (sentinel.alias !== alias) {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "Caphub target sentinel is bound to a different alias");
  }

  return { root: canonicalRoot, alias, sentinelPath };
}

export async function resolveSafeDescendant(
  target: ValidatedTargetRoot,
  relativePath: string
): Promise<string> {
  if (!isSafeRelativePackagePath(relativePath)) {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", `unsafe relative path: ${JSON.stringify(relativePath)}`);
  }
  const segments = relativePath.split("/");
  let current = target.root;
  for (const segment of segments) {
    current = join(current, segment);
    const metadata = await lstat(current).catch(() => null);
    if (metadata && metadata.isSymbolicLink()) {
      throw new ProjectionPathError("UNSAFE_TARGET_ROOT", `descendant ${JSON.stringify(segment)} is a symlink`);
    }
  }
  const resolved = await realpath(dirname(current)).catch(() => null);
  if (resolved && (resolved !== dirname(current) || !resolved.startsWith(target.root + sep))) {
    throw new ProjectionPathError("UNSAFE_TARGET_ROOT", "resolved descendant escapes the target root");
  }
  return current;
}
