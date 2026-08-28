import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ControlHostResolvedPaths } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import {
  getNativeRoadmapFilePath,
  getNativeTasksFilePath
} from "../paths";
import { ProjectLockError, withProjectLock } from "../native/lock";
import type { NativePlanningStore, MutationResult } from "../native/store";
import type { GitResult, GitRunner } from "../providers/git-runner";
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

  // Anything failing after this point rolls back the registry entry
  // (best-effort) so registration stays all-or-nothing.
  const rollback = async () => {
    try {
      await store.removeProject(project.slug);
    } catch {
      // Best-effort compensation
    }
  };

  // 3. For code projects, stage bare mirror — serialized with the refresh
  // worker via the same per-project lock (same slug + homeDir namespace)
  if (project.type === "code") {
    const mirrorPath = resolve(paths.mirrorsDir, `${project.slug}.git`);
    const source = project.git_remote || project.trusted_path;
    if (source && !existsSync(mirrorPath)) {
      let cloneRes: GitResult;
      try {
        cloneRes = await withProjectLock(
          project.slug,
          () =>
            gitRunner.run([
              "clone",
              "--bare",
              "--no-checkout",
              "--",
              source,
              mirrorPath
            ]),
          paths.homeDir
        );
      } catch (err) {
        if (err instanceof ProjectLockError) {
          await rollback();
          return { ok: false, code: "LOCKED", message: err.message };
        }
        throw err;
      }
      if (cloneRes.exitCode !== 0) {
        await rollback();
        return {
          ok: false,
          code: "FILESYSTEM_ERROR",
          message: `Failed to initialize bare mirror: ${cloneRes.stderr}`
        };
      }
    }
  } else {
    // 4. For business projects, initialize native files under the SAME data
    // root the store reads from (not the control-host home)
    const dataRoot = store.root;
    try {
      const roadmapPath = getNativeRoadmapFilePath(project.slug, dataRoot);
      if (!existsSync(roadmapPath)) {
        await writeFile(roadmapPath, `# Roadmap — ${project.name}\n\n`, "utf8");
      }

      const tasksPath = getNativeTasksFilePath(project.slug, dataRoot);
      if (!existsSync(tasksPath)) {
        await writeFile(tasksPath, `# Tasks — ${project.name}\n\n`, "utf8");
      }
    } catch (err: any) {
      await rollback();
      return {
        ok: false,
        code: "FILESYSTEM_ERROR",
        message: `Failed to initialize native planning files: ${err.message}`
      };
    }
  }

  return createResult;
}
