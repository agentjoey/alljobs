import "server-only";

import { randomUUID } from "node:crypto";
import { chmod, lstat, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadControlHostConfig, type ControlHostResolvedPaths } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import { computeDigest } from "../native/digest";
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
  atomicReplace?: (filePath: string, content: string) => Promise<void>;
  recordEvent?: typeof recordActivity;
}

type MutationFailure = { ok: false; code: BacklogMutationCode; message: string };
type ProposalResult = { ok: true; proposal: BacklogChangeProposal } | MutationFailure;
type ApplyResult = { ok: true; digest: string; changes: BacklogFieldChange[]; warnings: string[] } | MutationFailure;

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

async function atomicReplaceBacklog(filePath: string, content: string): Promise<void> {
  const link = await lstat(filePath);
  if (link.isSymbolicLink() || !link.isFile()) {
    throw new Error("Backlog path is no longer a regular file.");
  }
  const original = await stat(filePath);
  const tempPath = join(dirname(filePath), "." + randomUUID() + ".backlog.tmp");
  try {
    await writeFile(tempPath, content, { encoding: "utf8", mode: original.mode });
    await chmod(tempPath, original.mode);
    await rename(tempPath, filePath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Best-effort removal keeps a failed write from creating a repository backup.
    }
    throw error;
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
  const source = await readFile(localPaths.backlogPath, "utf8");
  const expectedFileDigest = computeDigest(source);
  if (resolved.source.backlogDigest !== expectedFileDigest) {
    return failure("STALE_WRITE", "Backlog changed while the proposal source was being inspected.");
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
      const current = await readFile(localPaths.backlogPath, "utf8");
      if (computeDigest(current) !== proposal.expectedFileDigest) {
        return failure("STALE_WRITE", "Backlog changed after review; no write was made.");
      }
      const patched = patchBacklogFields(current, rebuilt.proposal.changes);
      if (!patched.ok) return failure(patched.code, patched.message);
      try {
        await (deps.atomicReplace ?? atomicReplaceBacklog)(localPaths.backlogPath, patched.content);
      } catch {
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
