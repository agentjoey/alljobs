import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectChildOfTrustedRoots, type ControlHostConfig } from "../config";
import { parseProjectRegistry } from "../domain/schemas";
import type { ProjectRegistryEntry, WorkMode } from "../domain/types";
import { computeDigest } from "../native/digest";
import type { NativePlanningStore } from "../native/store";
import type { GitRunner } from "../providers/git-runner";
import {
  computeProposalDigest,
  type ProposedWrite,
  type ProposalMessage,
  type RegistrationProposal
} from "./proposal";

export interface InspectCandidateInput {
  slug: string;
  name: string;
  type: "code" | "business";
  workModes: WorkMode[];
  candidatePath?: string;
  gitRemote?: string;
  gitBranch?: string;
  executionLocations?: string[];
  config: ControlHostConfig;
  store: NativePlanningStore;
  gitRunner: GitRunner;
}

export async function inspectCandidate(
  input: InspectCandidateInput
): Promise<RegistrationProposal> {
  const {
    slug,
    name,
    type,
    workModes,
    candidatePath,
    gitRemote,
    gitBranch = "main",
    executionLocations = [],
    config,
    store,
    gitRunner
  } = input;

  const warnings: ProposalMessage[] = [];
  const blockers: ProposalMessage[] = [];
  const writes: ProposedWrite[] = [];
  const documentFingerprints: Record<string, string> = {};
  let inspectedRevision: string | undefined;

  // 1. Validate Project Registry Schema
  let projectEntry: ProjectRegistryEntry;
  try {
    projectEntry = parseProjectRegistry({
      slug,
      name,
      type,
      work_modes: workModes,
      execution_locations: executionLocations,
      git_remote: gitRemote,
      git_branch: type === "code" ? gitBranch : undefined,
      trusted_path: type === "code" ? candidatePath : undefined,
      archived: false
    });
  } catch (err: any) {
    blockers.push({
      code: "INVALID_PROJECT_SCHEMA",
      message: err.message
    });
    projectEntry = {
      slug,
      name,
      type,
      work_modes: workModes,
      execution_locations: executionLocations,
      archived: false
    };
  }

  // 2. Slug collision check against active registry
  const existingProject = await store.getProject(slug);
  if (existingProject) {
    blockers.push({
      code: "SLUG_COLLISION",
      message: `A project with slug "${slug}" already exists (type: ${existingProject.type})`
    });
  }

  if (type === "code") {
    // 3. Trusted root containment for code projects
    if (!candidatePath && !gitRemote) {
      blockers.push({
        code: "MISSING_CODE_SOURCE",
        message: "Code projects require either a local candidatePath or gitRemote"
      });
    }

    let resolvedPath = candidatePath;
    if (candidatePath) {
      const containment = isDirectChildOfTrustedRoots(candidatePath, config);
      if (!containment.trusted) {
        blockers.push({
          code: "UNTRUSTED_CODE_ROOT",
          message: containment.reason || `Path "${candidatePath}" is not within configured trusted roots`
        });
      } else {
        resolvedPath = containment.realCandidatePath;
      }
    }

    // 4. Read-only Git Inspection
    if (resolvedPath && existsSync(resolvedPath)) {
      const revRes = await gitRunner.run(["rev-parse", gitBranch], { cwd: resolvedPath });
      if (revRes.exitCode === 0) {
        inspectedRevision = revRes.stdout.trim();

        // Check for docs/ROADMAP.md
        const roadmapRes = await gitRunner.run(
          ["show", `${gitBranch}:docs/ROADMAP.md`],
          { cwd: resolvedPath }
        );
        if (roadmapRes.exitCode === 0) {
          documentFingerprints["docs/ROADMAP.md"] = computeDigest(roadmapRes.stdout);
        } else {
          warnings.push({
            code: "MISSING_ROADMAP_DOCUMENT",
            message: `docs/ROADMAP.md was not found on branch "${gitBranch}"`
          });
        }

        // Check for docs/BACKLOG.md
        const backlogRes = await gitRunner.run(
          ["show", `${gitBranch}:docs/BACKLOG.md`],
          { cwd: resolvedPath }
        );
        if (backlogRes.exitCode === 0) {
          documentFingerprints["docs/BACKLOG.md"] = computeDigest(backlogRes.stdout);
        } else {
          warnings.push({
            code: "MISSING_BACKLOG_DOCUMENT",
            message: `docs/BACKLOG.md was not found on branch "${gitBranch}"`
          });
        }
      } else {
        warnings.push({
          code: "GIT_BRANCH_NOT_RESOLVED",
          message: `Branch "${gitBranch}" could not be resolved in "${resolvedPath}"`
        });
      }
    }

    writes.push({
      path: `data/projects/${slug}.json`,
      description: `Create project registry entry for code project "${slug}"`
    });
    writes.push({
      path: `~/.alljobs/mirrors/${slug}.git`,
      description: `Initialize read-only bare mirror for "${slug}"`
    });
  } else {
    // Business project proposed writes
    writes.push({
      path: `data/projects/${slug}.json`,
      description: `Create project registry entry for business project "${slug}"`
    });
    writes.push({
      path: `data/roadmaps/${slug}.md`,
      description: `Initialize native business roadmap for "${slug}"`
    });
    writes.push({
      path: `data/tasks/${slug}.md`,
      description: `Initialize native tasks ledger for "${slug}"`
    });
  }

  const proposalDigest = computeProposalDigest({
    project: projectEntry,
    inspectedRevision,
    documentFingerprints,
    writes,
    blockers
  });

  return {
    proposalDigest,
    project: projectEntry,
    inspectedRevision,
    documentFingerprints,
    writes,
    warnings,
    blockers
  };
}
