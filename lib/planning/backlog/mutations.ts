import "server-only";

import { readFile } from "node:fs/promises";
import { loadControlHostConfig, type ControlHostResolvedPaths } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import { computeDigest, decodeUtf8 } from "../native/digest";
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
  | "NOT_FOUND";

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
}

type MutationFailure = { ok: false; code: BacklogMutationCode; message: string };
type ProposalResult = { ok: true; proposal: BacklogChangeProposal } | MutationFailure;

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

function formatDiff(project: ProjectRegistryEntry, items: Awaited<ReturnType<typeof resolveCodePlanning>>["projection"]["backlog"], changes: BacklogFieldChange[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return changes.map((change) => {
    const before = itemById.get(change.itemId);
    const priority = String(before?.priority ?? "?") + " -> " + change.priority;
    const rank = change.rank === undefined ? "" : "; rank " + String(before?.rank ?? "absent") + " -> " + change.rank;
    return project.slug + " " + change.itemId + ": priority " + priority + rank;
  }).join("\n");
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
