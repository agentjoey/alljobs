import "server-only";

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, rename, unlink, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadControlHostConfig, type ControlHostResolvedPaths } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import { computeDigest, decodeUtf8 } from "../native/digest";
import { ProjectLockError, withProjectLock } from "../native/lock";
import { BACKLOG_ORDERING_APPLIED, recordActivity } from "../native/activity";
import { NativePlanningStore } from "../native/store";
import { NodeGitRunner, type GitRunner } from "../providers/git-runner";
import { resolveLocalPlanningPaths } from "../providers/local-paths";
import { resolveCodePlanning } from "../providers/source-resolver";
import { patchBacklogFields } from "./patcher";
import {
  analyzeBacklogOrdering,
  planBacklogOrderingChange,
  type BacklogFieldChange,
  type BacklogOrderingIntent
} from "./ordering";

export type BacklogMutationCode =
  | "SOURCE_NOT_WRITABLE" | "ORDERING_NOT_INITIALIZED" | "INVALID_BACKLOG"
  | "FIELD_NOT_PATCHABLE" | "STALE_WRITE" | "RANK_CONFLICT"
  | "LOCKED" | "NOT_FOUND" | "WRITE_FAILED";

export interface BacklogChangeProposal {
  projectSlug: string;
  intent: BacklogOrderingIntent;
  expectedFileDigest: string;
  headRevision?: string;
  backlogModified: boolean;
  sourceMode: "local-working-tree";
  changes: BacklogFieldChange[];
  renumbered: boolean;
  diff: string;
  proposalDigest: string;
}

export interface BacklogMutationDependencies {
  paths: ControlHostResolvedPaths;
  store: NativePlanningStore;
  gitRunner: GitRunner;
  beforeReplace?: () => Promise<void>;
  recordEvent?: typeof recordActivity;
}

type MutationFailure = { ok: false; code: BacklogMutationCode; message: string };
type ProposalResult = { ok: true; proposal: BacklogChangeProposal } | MutationFailure;
type ApplyResult = { ok: true; digest: string; changes: BacklogFieldChange[]; warnings: string[] } | MutationFailure;
type FileIdentity = { dev: bigint; ino: bigint };

class BacklogMutationError extends Error {
  constructor(readonly code: BacklogMutationCode, message: string) {
    super(message);
  }
}

function failure(code: BacklogMutationCode, message: string): MutationFailure {
  return { ok: false, code, message };
}

function isSafeProjectSlug(slug: string) {
  return /^[a-z0-9-]+$/.test(slug);
}

function normalizeIntent(intent: BacklogOrderingIntent): BacklogOrderingIntent {
  switch (intent.kind) {
    case "initialize":
      return { kind: "initialize" };
    case "repair":
      return { kind: "repair", phase: intent.phase, priority: intent.priority };
    case "change-priority":
      return { kind: "change-priority", itemId: intent.itemId, targetPriority: intent.targetPriority };
    case "move":
      return {
        kind: "move",
        itemId: intent.itemId,
        targetPriority: intent.targetPriority,
        beforeId: intent.beforeId,
        afterId: intent.afterId
      };
  }
}

function digestForProposal(proposal: Omit<BacklogChangeProposal, "proposalDigest">) {
  return computeDigest(JSON.stringify({
    projectSlug: proposal.projectSlug,
    intent: normalizeIntent(proposal.intent),
    expectedFileDigest: proposal.expectedFileDigest,
    headRevision: proposal.headRevision ?? null,
    backlogModified: proposal.backlogModified,
    sourceMode: proposal.sourceMode,
    changes: proposal.changes.map((change) => ({
      itemId: change.itemId,
      priority: change.priority,
      rank: change.rank
    })),
    renumbered: proposal.renumbered,
    diff: proposal.diff
  }));
}

function isProposalIntact(proposal: BacklogChangeProposal, suppliedDigest: string) {
  if (suppliedDigest !== proposal.proposalDigest) return false;
  const { proposalDigest: _ignored, ...unsigned } = proposal;
  return digestForProposal(unsigned) === proposal.proposalDigest;
}

function formatDiff(project: ProjectRegistryEntry, items: Awaited<ReturnType<typeof resolveCodePlanning>>["projection"]["backlog"], changes: BacklogFieldChange[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return changes.map((change) => {
    const before = itemById.get(change.itemId);
    const priority = String(before?.priority ?? "?") + " -> " + change.priority;
    const rank = change.rank === undefined ? "" : "; rank " + String(before?.rank ?? "absent") + " -> " + change.rank;
    return project.slug + " " + change.itemId + ": priority " + priority + rank;
  }).join("\n");
}

function identity(entry: { dev: bigint; ino: bigint }): FileIdentity {
  return { dev: entry.dev, ino: entry.ino };
}

function sameIdentity(left: FileIdentity, right: FileIdentity) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function readHandleBytes(handle: FileHandle) {
  const before = await handle.stat({ bigint: true });
  if (before.size > BigInt(2 * 1024 * 1024)) {
    throw new BacklogMutationError("INVALID_BACKLOG", "Backlog exceeds the 2 MiB safety limit; no write was made.");
  }
  const bytes = Buffer.alloc(Number(before.size) + 1);
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.read(bytes, offset, bytes.length - offset, offset);
    if (result.bytesRead === 0) break;
    offset += result.bytesRead;
  }
  const after = await handle.stat({ bigint: true });
  if (
    before.dev !== after.dev || before.ino !== after.ino ||
    before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
    BigInt(offset) !== after.size
  ) {
    throw new BacklogMutationError("STALE_WRITE", "Backlog changed while its write-boundary snapshot was read; no write was made.");
  }
  return bytes.subarray(0, offset);
}

async function assertStableTempPath(tempPath: string, expected: FileIdentity) {
  try {
    const entry = await lstat(tempPath, { bigint: true });
    if (entry.isSymbolicLink() || !entry.isFile() || !sameIdentity(identity(entry), expected)) {
      throw new Error("identity changed");
    }
  } catch {
    throw new BacklogMutationError("STALE_WRITE", "Temporary replacement identity changed; no write was made.");
  }
}

async function assertStablePath(
  workspacePath: string,
  docsPath: string,
  filePath: string,
  expected: { workspace: FileIdentity; docs: FileIdentity; file: FileIdentity }
) {
  try {
    const [workspace, docs, file, realWorkspace, realDocs] = await Promise.all([
      lstat(workspacePath, { bigint: true }),
      lstat(docsPath, { bigint: true }),
      lstat(filePath, { bigint: true }),
      realpath(workspacePath),
      realpath(docsPath)
    ]);
    if (
      workspace.isSymbolicLink() || !workspace.isDirectory() ||
      docs.isSymbolicLink() || !docs.isDirectory() ||
      file.isSymbolicLink() || !file.isFile() ||
      realWorkspace !== workspacePath || realDocs !== docsPath ||
      !sameIdentity(identity(workspace), expected.workspace) ||
      !sameIdentity(identity(docs), expected.docs) ||
      !sameIdentity(identity(file), expected.file)
    ) {
      throw new Error("identity changed");
    }
  } catch {
    throw new BacklogMutationError(
      "STALE_WRITE",
      "Backlog path identity changed at the write boundary; no write was made."
    );
  }
}

async function atomicReplaceBacklog(
  filePath: string,
  expectedDigest: string,
  changes: BacklogFieldChange[],
  beforeReplace?: () => Promise<void>
) {
  const docsPath = dirname(filePath);
  const workspacePath = dirname(docsPath);
  let workspaceHandle: FileHandle | undefined;
  let docsHandle: FileHandle | undefined;
  let fileHandle: FileHandle | undefined;
  let tempHandle: FileHandle | undefined;
  let tempPath: string | undefined;
  let tempCreated = false;
  let tempIdentity: FileIdentity | undefined;
  let expected: { workspace: FileIdentity; docs: FileIdentity; file: FileIdentity } | undefined;

  try {
    try {
      workspaceHandle = await open(workspacePath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      docsHandle = await open(docsPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      fileHandle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const [workspace, docs, file] = await Promise.all([
        workspaceHandle.stat({ bigint: true }),
        docsHandle.stat({ bigint: true }),
        fileHandle.stat({ bigint: true })
      ]);
      expected = { workspace: identity(workspace), docs: identity(docs), file: identity(file) };
      await assertStablePath(workspacePath, docsPath, filePath, expected);
    } catch (error) {
      if (error instanceof BacklogMutationError) throw error;
      throw new BacklogMutationError("STALE_WRITE", "Backlog path changed before replacement; no write was made.");
    }

    const sourceBytes = await readHandleBytes(fileHandle);
    if (computeDigest(sourceBytes) !== expectedDigest) {
      throw new BacklogMutationError("STALE_WRITE", "Backlog changed after review; no write was made.");
    }
    let source: string;
    try {
      source = decodeUtf8(sourceBytes);
    } catch {
      throw new BacklogMutationError("INVALID_BACKLOG", "Backlog must contain valid UTF-8; no write was made.");
    }
    const patched = patchBacklogFields(source, changes);
    if (!patched.ok) throw new BacklogMutationError(patched.code, patched.message);

    if (computeDigest(await readHandleBytes(fileHandle)) !== expectedDigest) {
      throw new BacklogMutationError("STALE_WRITE", "Backlog changed at the write boundary; no write was made.");
    }

    const fileMetadata = await fileHandle.stat({ bigint: true });
    await assertStablePath(workspacePath, docsPath, filePath, expected);
    tempPath = join(docsPath, "." + randomUUID() + ".backlog.tmp");
    tempHandle = await open(
      tempPath,
      constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      Number(fileMetadata.mode & BigInt(0o7777))
    );
    tempCreated = true;
    await tempHandle.writeFile(Buffer.from(patched.content, "utf8"));
    await tempHandle.chmod(Number(fileMetadata.mode & BigInt(0o7777)));
    await tempHandle.sync();
    tempIdentity = identity(await tempHandle.stat({ bigint: true }));

    await assertStablePath(workspacePath, docsPath, filePath, expected);
    await assertStableTempPath(tempPath, tempIdentity);
    if (computeDigest(await readHandleBytes(tempHandle)) !== computeDigest(Buffer.from(patched.content, "utf8"))) {
      throw new BacklogMutationError("STALE_WRITE", "Temporary replacement content changed; no write was made.");
    }
    if (computeDigest(await readHandleBytes(fileHandle)) !== expectedDigest) {
      throw new BacklogMutationError("STALE_WRITE", "Backlog changed at the write boundary; no write was made.");
    }

    await beforeReplace?.();
    if (computeDigest(await readHandleBytes(fileHandle)) !== expectedDigest) {
      throw new BacklogMutationError("STALE_WRITE", "Backlog changed immediately before replacement; no write was made.");
    }
    if (computeDigest(await readHandleBytes(tempHandle)) !== computeDigest(Buffer.from(patched.content, "utf8"))) {
      throw new BacklogMutationError("STALE_WRITE", "Temporary replacement changed immediately before installation; no write was made.");
    }
    await assertStablePath(workspacePath, docsPath, filePath, expected);
    await assertStableTempPath(tempPath, tempIdentity);
    await rename(tempPath, filePath);
    tempCreated = false;
    return patched;
  } catch (error) {
    if (tempCreated && tempPath && tempIdentity) {
      try {
        await assertStableTempPath(tempPath, tempIdentity);
        await unlink(tempPath);
      } catch {
        // Never unlink a temporary pathname after its identity changes.
      }
    }
    throw error;
  } finally {
    await Promise.allSettled([
      tempHandle?.close(),
      fileHandle?.close(),
      docsHandle?.close(),
      workspaceHandle?.close()
    ]);
  }
}

function defaultDependencies(): BacklogMutationDependencies {
  const paths = loadControlHostConfig();
  return {
    paths,
    store: new NativePlanningStore(),
    gitRunner: new NodeGitRunner()
  };
}

async function buildProposal(
  input: { projectSlug: string; intent: BacklogOrderingIntent },
  deps: BacklogMutationDependencies
): Promise<ProposalResult> {
  if (!isSafeProjectSlug(input.projectSlug)) return failure("NOT_FOUND", "Project was not found.");
  let project: ProjectRegistryEntry | null;
  try {
    project = await deps.store.getProject(input.projectSlug);
  } catch {
    return failure("NOT_FOUND", "Project could not be loaded.");
  }
  if (!project) return failure("NOT_FOUND", "Project was not found.");
  if (project.type !== "code" || project.archived) {
    return failure("SOURCE_NOT_WRITABLE", "Only active code projects with a local working tree are writable.");
  }

  const resolved = await resolveCodePlanning({ project, paths: deps.paths, gitRunner: deps.gitRunner });
  if (resolved.source.mode !== "local-working-tree") {
    return failure("SOURCE_NOT_WRITABLE", "The current planning source is not a writable local working tree.");
  }
  if (!resolved.source.writable) {
    return failure("INVALID_BACKLOG", resolved.source.reason ?? "The local Backlog is not valid for direct changes.");
  }

  const localPaths = await resolveLocalPlanningPaths(project, deps.paths.config);
  if (!localPaths.ok) {
    return failure("INVALID_BACKLOG", localPaths.message);
  }
  const sourceBytes = await readFile(localPaths.backlogPath);
  const expectedFileDigest = computeDigest(sourceBytes);
  if (resolved.source.backlogDigest !== expectedFileDigest) {
    return failure("STALE_WRITE", "Backlog changed while the proposal source was being inspected.");
  }
  let source: string;
  try {
    source = decodeUtf8(sourceBytes);
  } catch {
    return failure("INVALID_BACKLOG", "Backlog must contain valid UTF-8; no write was made.");
  }

  const ordering = analyzeBacklogOrdering(resolved.projection.backlog);
  const planned = planBacklogOrderingChange(resolved.projection.backlog, input.intent);
  if (!planned.ok) {
    return failure(planned.code === "VALIDATION_ERROR" ? "INVALID_BACKLOG" : planned.code, planned.message);
  }
  if (ordering.state === "repair-required" && input.intent.kind === "initialize") {
    return failure("RANK_CONFLICT", "Duplicate ranks require a lane repair proposal.");
  }

  const patched = patchBacklogFields(source, planned.changes);
  if (!patched.ok) return failure(patched.code, patched.message);

  const unsigned: Omit<BacklogChangeProposal, "proposalDigest"> = {
    projectSlug: project.slug,
    intent: normalizeIntent(input.intent),
    expectedFileDigest,
    headRevision: resolved.source.headRevision,
    backlogModified: Boolean(resolved.source.backlogModified),
    sourceMode: "local-working-tree" as const,
    changes: planned.changes,
    renumbered: planned.renumbered,
    diff: formatDiff(project, resolved.projection.backlog, planned.changes)
  };
  return { ok: true, proposal: { ...unsigned, proposalDigest: digestForProposal(unsigned) } };
}

export async function proposeBacklogOrderingChange(
  input: { projectSlug: string; intent: BacklogOrderingIntent },
  suppliedDependencies?: BacklogMutationDependencies
): Promise<ProposalResult> {
  return buildProposal(input, suppliedDependencies ?? defaultDependencies());
}

export async function applyBacklogOrderingChange(
  proposal: BacklogChangeProposal,
  proposalDigest: string,
  suppliedDependencies?: BacklogMutationDependencies
): Promise<ApplyResult> {
  const deps = suppliedDependencies ?? defaultDependencies();
  if (!isSafeProjectSlug(proposal.projectSlug)) return failure("NOT_FOUND", "Project was not found.");
  if (!isProposalIntact(proposal, proposalDigest)) {
    return failure("STALE_WRITE", "The proposal payload or digest is no longer valid.");
  }
  try {
    return await withProjectLock(proposal.projectSlug, async () => {
      const rebuilt = await buildProposal({ projectSlug: proposal.projectSlug, intent: proposal.intent }, deps);
      if (!rebuilt.ok) return rebuilt;
      if (
        rebuilt.proposal.expectedFileDigest !== proposal.expectedFileDigest ||
        rebuilt.proposal.proposalDigest !== proposal.proposalDigest
      ) {
        return failure("STALE_WRITE", "Backlog changed after review; no write was made.");
      }

      const project = await deps.store.getProject(proposal.projectSlug);
      if (!project) return failure("NOT_FOUND", "Project was not found.");
      const localPaths = await resolveLocalPlanningPaths(project, deps.paths.config);
      if (!localPaths.ok) return failure("INVALID_BACKLOG", localPaths.message);
      let patched: Awaited<ReturnType<typeof atomicReplaceBacklog>>;
      try {
        patched = await atomicReplaceBacklog(
          localPaths.backlogPath,
          proposal.expectedFileDigest,
          rebuilt.proposal.changes,
          deps.beforeReplace
        );
      } catch (error) {
        if (error instanceof BacklogMutationError) return failure(error.code, error.message);
        return failure("WRITE_FAILED", "The Backlog could not be replaced atomically; no change was applied.");
      }

      const digest = computeDigest(patched.content);
      const warnings: string[] = [];
      try {
        await (deps.recordEvent ?? recordActivity)({
          type: BACKLOG_ORDERING_APPLIED,
          project: proposal.projectSlug,
          details: {
            changes: rebuilt.proposal.changes,
            previousDigest: proposal.expectedFileDigest,
            resultingDigest: digest
          }
        }, deps.paths.homeDir);
      } catch {
        warnings.push("ACTIVITY_LOG_FAILED");
      }
      return { ok: true, digest, changes: rebuilt.proposal.changes, warnings };
    }, deps.paths.homeDir);
  } catch (error) {
    if (error instanceof ProjectLockError) return failure("LOCKED", error.message);
    return failure("WRITE_FAILED", "The Backlog write could not be completed.");
  }
}
