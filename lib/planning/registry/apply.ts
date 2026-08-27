import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ControlHostResolvedPaths } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import {
  getNativeRoadmapFilePath,
  getNativeTasksFilePath
} from "../paths";
import type { NativePlanningStore, MutationResult } from "../native/store";
import type { GitRunner } from "../providers/git-runner";
import { inspectCandidate, type InspectCandidateInput } from "./inspect";
import type { RegistrationProposal } from "./proposal";

export async function applyRegistration(
  proposal: RegistrationProposal,
  expectedDigest: string,
  options: {
    paths: ControlHostResolvedPaths;
    store: NativePlanningStore;
    gitRunner: GitRunner;
  }
): Promise<MutationResult<ProjectRegistryEntry>> {
  const { paths, store, gitRunner } = options;
  const project = proposal.project;

  // 1. Re-inspect candidate to guarantee zero stale writes
  const freshProposal = await inspectCandidate({
    slug: project.slug,
    name: project.name,
    type: project.type,
    workModes: project.work_modes,
    candidatePath: project.trusted_path,
    gitRemote: project.git_remote,
    gitBranch: project.git_branch,
    executionLocations: project.execution_locations,
    config: paths.config,
    store,
    gitRunner
  });

  if (freshProposal.proposalDigest !== expectedDigest) {
    return {
      ok: false,
      code: "STALE_WRITE",
      message: `Proposal state changed (expected "${expectedDigest}", computed "${freshProposal.proposalDigest}"); zero writes performed.`
    };
  }

  if (freshProposal.blockers.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Cannot apply proposal with active blockers: ${freshProposal.blockers.map(b => b.message).join("; ")}`
    };
  }

  // 2. Write project registry entry
  const createResult = await store.createProject(project);
  if (!createResult.ok) {
    return createResult;
  }

  // 3. For code projects, stage bare mirror
  if (project.type === "code") {
    const mirrorPath = resolve(paths.mirrorsDir, `${project.slug}.git`);
    const source = project.git_remote || project.trusted_path;
    if (source && !existsSync(mirrorPath)) {
      const cloneRes = await gitRunner.run([
        "clone",
        "--bare",
        "--no-checkout",
        source,
        mirrorPath
      ]);
      if (cloneRes.exitCode !== 0) {
        return {
          ok: false,
          code: "FILESYSTEM_ERROR",
          message: `Failed to initialize bare mirror: ${cloneRes.stderr}`
        };
      }
    }
  } else {
    // 4. For business projects, initialize native files if missing
    const roadmapPath = getNativeRoadmapFilePath(project.slug, paths.homeDir);
    if (!existsSync(roadmapPath)) {
      await writeFile(roadmapPath, `# Roadmap — ${project.name}\n\n`, "utf8");
    }

    const tasksPath = getNativeTasksFilePath(project.slug, paths.homeDir);
    if (!existsSync(tasksPath)) {
      await writeFile(tasksPath, `# Tasks — ${project.name}\n\n`, "utf8");
    }
  }

  return createResult;
}
