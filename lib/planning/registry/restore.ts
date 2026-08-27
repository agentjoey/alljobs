import { isDirectChildOfTrustedRoots, type ControlHostConfig } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import { setProjectArchivedState } from "../native/project-file";
import type { NativePlanningStore, MutationResult } from "../native/store";
import {
  computeLifecycleProposalDigest,
  type LifecycleProposal,
  type ProposalMessage
} from "./proposal";

export async function proposeRestore(
  slug: string,
  store: NativePlanningStore,
  config: ControlHostConfig
): Promise<LifecycleProposal> {
  const warnings: ProposalMessage[] = [];
  const blockers: ProposalMessage[] = [];

  const project = await store.getProject(slug);
  if (!project) {
    blockers.push({
      code: "PROJECT_NOT_FOUND",
      message: `Project "${slug}" does not exist in registry`
    });
  } else if (!project.archived) {
    blockers.push({
      code: "NOT_ARCHIVED",
      message: `Project "${slug}" is not currently archived`
    });
  } else if (project.type === "code" && project.trusted_path) {
    // Recheck containment on restore
    const containment = isDirectChildOfTrustedRoots(project.trusted_path, config);
    if (!containment.trusted) {
      blockers.push({
        code: "UNTRUSTED_RESTORE_PATH",
        message: `Project trusted path "${project.trusted_path}" is no longer in configured trusted roots.`
      });
    }
  }

  const proposalDigest = computeLifecycleProposalDigest({
    slug,
    action: "restore",
    blockers
  });

  return {
    proposalDigest,
    slug,
    action: "restore",
    warnings,
    blockers
  };
}

export async function applyRestore(
  slug: string,
  expectedDigest: string,
  options: {
    store: NativePlanningStore;
    config: ControlHostConfig;
    root?: string;
  }
): Promise<MutationResult<ProjectRegistryEntry>> {
  const { store, config, root } = options;
  const freshProposal = await proposeRestore(slug, store, config);

  if (freshProposal.proposalDigest !== expectedDigest) {
    return {
      ok: false,
      code: "STALE_WRITE",
      message: `Restore proposal state changed; zero writes performed.`
    };
  }

  if (freshProposal.blockers.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Cannot restore project: ${freshProposal.blockers.map(b => b.message).join("; ")}`
    };
  }

  return setProjectArchivedState(slug, false, undefined, root);
}
