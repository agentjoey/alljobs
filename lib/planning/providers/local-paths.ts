import "server-only";

import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { isDirectChildOfTrustedRoots, type ControlHostConfig } from "../config";
import type { ProjectRegistryEntry, ProofIssue } from "../domain/types";

const MAX_PLANNING_FILE_BYTES = 2 * 1024 * 1024;

export type LocalDocumentInspection =
  | { readable: true; path: string }
  | { readable: false; path: string; issue: ProofIssue };

export type LocalPlanningPathsResult =
  | {
      ok: true;
      workspacePath: string;
      roadmapPath: string;
      backlogPath: string;
      roadmap: LocalDocumentInspection;
      backlog: LocalDocumentInspection;
    }
  | {
      ok: false;
      state: "workspace-unavailable" | "unsafe" | "invalid-file";
      code: string;
      message: string;
    };

function documentIssue(path: string, code: string, message: string): LocalDocumentInspection {
  return {
    readable: false,
    path,
    issue: { scope: "document", code, sourcePath: path, message }
  };
}

async function inspectPlanningFile(path: string, label: "Roadmap" | "Backlog"): Promise<LocalDocumentInspection> {
  let entry;
  try {
    entry = await lstat(path);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return documentIssue(
      path,
      missing ? "PLANNING_FILE_MISSING" : "PLANNING_FILE_UNAVAILABLE",
      missing
        ? `${label} file is missing at "${path}".`
        : `${label} file cannot be inspected safely at "${path}".`
    );
  }

  if (entry.isSymbolicLink()) {
    return documentIssue(path, "PLANNING_FILE_SYMLINK", `${label} file must not be a symbolic link.`);
  }
  if (!entry.isFile()) {
    return documentIssue(path, "PLANNING_FILE_NOT_REGULAR", `${label} file must be a regular file.`);
  }
  if (entry.size > MAX_PLANNING_FILE_BYTES) {
    return documentIssue(path, "PLANNING_FILE_TOO_LARGE", `${label} file exceeds the 2 MiB safety limit.`);
  }
  return { readable: true, path };
}

function inspectionFailure(inspection: Extract<LocalDocumentInspection, { readable: false }>): LocalPlanningPathsResult {
  return {
    ok: false,
    state: inspection.issue.code === "PLANNING_FILE_SYMLINK" ? "unsafe" : "invalid-file",
    code: inspection.issue.code,
    message: inspection.issue.message
  };
}

/**
 * Resolves only server-derived planning paths for a registered trusted workspace.
 * A missing workspace is the single result that callers may use to fall back to
 * a mirror/cache; every present-but-unsafe or invalid local source is authoritative.
 */
export async function resolveLocalPlanningPaths(
  project: ProjectRegistryEntry,
  config: ControlHostConfig,
  options: { allowDegradedDocuments?: boolean } = {}
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
  const roadmapPath = join(docsPath, "ROADMAP.md");
  const backlogPath = join(docsPath, "BACKLOG.md");
  let docsEntry;
  try {
    docsEntry = await lstat(docsPath);
  } catch (error) {
    if (options.allowDegradedDocuments && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ok: true,
        workspacePath,
        roadmapPath,
        backlogPath,
        roadmap: documentIssue(roadmapPath, "PLANNING_FILE_MISSING", `Roadmap file is missing at "${roadmapPath}".`),
        backlog: documentIssue(backlogPath, "PLANNING_FILE_MISSING", `Backlog file is missing at "${backlogPath}".`)
      };
    }
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
  const [roadmap, backlog] = await Promise.all([
    inspectPlanningFile(roadmapPath, "Roadmap"),
    inspectPlanningFile(backlogPath, "Backlog")
  ]);

  if (!options.allowDegradedDocuments) {
    if (project.work_modes.includes("implementation") && !roadmap.readable) return inspectionFailure(roadmap);
    if (!backlog.readable) return inspectionFailure(backlog);
  }

  return { ok: true, workspacePath, roadmapPath, backlogPath, roadmap, backlog };
}
