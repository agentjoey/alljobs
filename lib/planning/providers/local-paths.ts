import "server-only";

import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { isDirectChildOfTrustedRoots, type ControlHostConfig } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";

const MAX_PLANNING_FILE_BYTES = 2 * 1024 * 1024;

export type LocalPlanningPathsResult =
  | { ok: true; workspacePath: string; roadmapPath: string; backlogPath: string }
  | {
      ok: false;
      state: "workspace-unavailable" | "unsafe" | "invalid-file";
      code: string;
      message: string;
    };

async function regularPlanningFile(path: string, label: "Roadmap" | "Backlog"): Promise<LocalPlanningPathsResult | null> {
  let entry;
  try {
    entry = await lstat(path);
  } catch {
    return {
      ok: false,
      state: "invalid-file",
      code: "PLANNING_FILE_MISSING",
      message: `${label} file is missing at "${path}".`
    };
  }

  if (entry.isSymbolicLink()) {
    return {
      ok: false,
      state: "unsafe",
      code: "PLANNING_FILE_SYMLINK",
      message: `${label} file must not be a symbolic link.`
    };
  }
  if (!entry.isFile()) {
    return {
      ok: false,
      state: "invalid-file",
      code: "PLANNING_FILE_NOT_REGULAR",
      message: `${label} file must be a regular file.`
    };
  }
  if (entry.size > MAX_PLANNING_FILE_BYTES) {
    return {
      ok: false,
      state: "invalid-file",
      code: "PLANNING_FILE_TOO_LARGE",
      message: `${label} file exceeds the 2 MiB safety limit.`
    };
  }
  return null;
}

/**
 * Resolves only server-derived planning paths for a registered trusted workspace.
 * A missing workspace is the single result that callers may use to fall back to
 * a mirror/cache; every present-but-unsafe or invalid local source is authoritative.
 */
export async function resolveLocalPlanningPaths(
  project: ProjectRegistryEntry,
  config: ControlHostConfig
): Promise<LocalPlanningPathsResult> {
  const candidatePath = project.trusted_path;
  if (!candidatePath) {
    return {
      ok: false,
      state: "workspace-unavailable",
      code: "WORKSPACE_PATH_MISSING",
      message: `Project "${project.slug}" has no registered trusted workspace.`
    };
  }

  let workspaceEntry;
  try {
    workspaceEntry = await lstat(candidatePath);
  } catch {
    return {
      ok: false,
      state: "workspace-unavailable",
      code: "WORKSPACE_UNAVAILABLE",
      message: `Registered workspace is unavailable at "${candidatePath}".`
    };
  }

  const containment = isDirectChildOfTrustedRoots(candidatePath, config);
  if (!containment.trusted || !containment.realCandidatePath) {
    return {
      ok: false,
      state: "unsafe",
      code: "UNTRUSTED_WORKSPACE",
      message: containment.reason ?? `Registered workspace "${candidatePath}" is not trusted.`
    };
  }
  if (workspaceEntry.isSymbolicLink()) {
    return {
      ok: false,
      state: "unsafe",
      code: "WORKSPACE_SYMLINK",
      message: "Registered workspace must not be a symbolic link."
    };
  }
  if (!workspaceEntry.isDirectory()) {
    return {
      ok: false,
      state: "unsafe",
      code: "WORKSPACE_NOT_DIRECTORY",
      message: "Registered workspace must be a directory."
    };
  }

  const workspacePath = await realpath(candidatePath);
  const docsPath = join(workspacePath, "docs");
  let docsEntry;
  try {
    docsEntry = await lstat(docsPath);
  } catch {
    return {
      ok: false,
      state: "invalid-file",
      code: "PLANNING_DIRECTORY_MISSING",
      message: "Planning documents directory is missing."
    };
  }
  if (docsEntry.isSymbolicLink()) {
    return {
      ok: false,
      state: "unsafe",
      code: "PLANNING_DIRECTORY_SYMLINK",
      message: "Planning documents directory must not be a symbolic link."
    };
  }
  if (!docsEntry.isDirectory()) {
    return {
      ok: false,
      state: "invalid-file",
      code: "PLANNING_DIRECTORY_NOT_DIRECTORY",
      message: "Planning documents path must be a directory."
    };
  }
  const roadmapPath = join(docsPath, "ROADMAP.md");
  const backlogPath = join(docsPath, "BACKLOG.md");
  const needsRoadmap = project.work_modes.includes("implementation");

  if (needsRoadmap) {
    const roadmapFailure = await regularPlanningFile(roadmapPath, "Roadmap");
    if (roadmapFailure) return roadmapFailure;
  }
  const backlogFailure = await regularPlanningFile(backlogPath, "Backlog");
  if (backlogFailure) return backlogFailure;

  return { ok: true, workspacePath, roadmapPath, backlogPath };
}
