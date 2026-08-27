import type { ProjectRegistryEntry } from "../domain/types";
import { setProjectArchivedState } from "../native/project-file";
import type { NativePlanningStore, MutationResult } from "../native/store";
import {
  computeLifecycleProposalDigest,
  type LifecycleProposal,
  type ProposalMessage
} from "./proposal";

export async function proposeArchive(
  slug: string,
  store: NativePlanningStore
): Promise<LifecycleProposal> {
  const warnings: ProposalMessage[] = [];
  const blockers: ProposalMessage[] = [];

  const project = await store.getProject(slug);
  if (!project) {
    blockers.push({
      code: "PROJECT_NOT_FOUND",
      message: `Project "${slug}" does not exist in registry`
    });
  } else if (project.archived) {
    blockers.push({
      code: "ALREADY_ARCHIVED",
      message: `Project "${slug}" is already archived`
    });
  }

  // Check active tasks
  const { tasks } = await store.readTasks(slug);
  const activeTasks = tasks.filter(t => t.status === "doing" || t.status === "todo" || t.status === "waiting");
  if (activeTasks.length > 0) {
    warnings.push({
      code: "ACTIVE_WORK_WARNING",
      message: `Project "${slug}" has ${activeTasks.length} active or pending tasks that will be frozen.`
    });
  }

  const proposalDigest = computeLifecycleProposalDigest({
    slug,
    action: "archive",
    blockers
  });

  return {
    proposalDigest,
    slug,
    action: "archive",
    warnings,
    blockers
  };
}

export async function applyArchive(
  slug: string,
  expectedDigest: string,
  store: NativePlanningStore,
  root?: string
): Promise<MutationResult<ProjectRegistryEntry>> {
  const freshProposal = await proposeArchive(slug, store);

  if (freshProposal.proposalDigest !== expectedDigest) {
    return {
      ok: false,
      code: "STALE_WRITE",
      message: `Archive proposal state changed; zero writes performed.`
    };
  }

  if (freshProposal.blockers.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Cannot archive project: ${freshProposal.blockers.map(b => b.message).join("; ")}`
    };
  }

  return setProjectArchivedState(slug, true, undefined, root);
}
