import "server-only";

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ControlHostResolvedPaths } from "../config";
import type { ProjectRegistryEntry, ProofIssue } from "../domain/types";
import { triagePlanningDocument } from "../document-triage";
import type { ExternalProjection, ResolvedCodePlanning } from "./contracts";
import { GitMarkdownProvider } from "./git-markdown";
import type { GitRunner } from "./git-runner";
import { resolveLocalPlanningPaths } from "./local-paths";
import { readLocalWorkingTreePlanning } from "./local-working-tree";
import { getCachedProjection } from "./refresh";

function unavailableDocuments(project: ProjectRegistryEntry, issue: ProofIssue) {
  const docsPath = join(project.trusted_path ?? "", "docs");
  return [
    ...(project.work_modes.includes("implementation") ? [triagePlanningDocument({
      document: "roadmap" as const,
      sourcePath: join(docsPath, "ROADMAP.md"),
      parserIssues: [issue],
      canonicalItemCount: 0,
      unavailable: true
    })] : []),
    triagePlanningDocument({
      document: "backlog",
      sourcePath: join(docsPath, "BACKLOG.md"),
      parserIssues: [issue],
      canonicalItemCount: 0,
      unavailable: true
    })
  ];
}

function invalidLocalSource(project: ProjectRegistryEntry, code: string, message: string): ResolvedCodePlanning {
  const readAt = new Date().toISOString();
  const issue: ProofIssue = { scope: "document", code, sourcePath: project.trusted_path ?? "", message };
  const issues = [issue];
  return {
    projection: {
      project: project.slug,
      revision: "local-invalid",
      fetchedAt: readAt,
      freshness: "unavailable",
      roadmap: [],
      backlog: [],
      tasks: [],
      issues,
      provenance: [],
      documents: unavailableDocuments(project, issue)
    },
    source: { mode: "local-working-tree", writable: false, reason: message, readAt }
  };
}

function readOnlyProjection(projection: ExternalProjection, mode: "remote-commit" | "cached", reason?: string): ResolvedCodePlanning {
  const roadmap = projection.provenance.find((entry) => entry.location === "docs/ROADMAP.md");
  const backlog = projection.provenance.find((entry) => entry.location === "docs/BACKLOG.md");
  return {
    projection,
    source: {
      mode,
      writable: false,
      reason,
      headRevision: projection.revision,
      roadmapDigest: roadmap?.digest,
      backlogDigest: backlog?.digest,
      readAt: new Date().toISOString()
    }
  };
}

export async function resolveCodePlanning(input: {
  project: ProjectRegistryEntry;
  paths: ControlHostResolvedPaths;
  gitRunner: GitRunner;
}): Promise<ResolvedCodePlanning> {
  const { project, paths, gitRunner } = input;
  const localPaths = await resolveLocalPlanningPaths(project, paths.config, { allowDegradedDocuments: true });
  if (localPaths.ok) return readLocalWorkingTreePlanning({ project, config: paths.config, gitRunner });
  if (localPaths.state !== "workspace-unavailable") {
    return invalidLocalSource(project, localPaths.code, localPaths.message);
  }

  const mirrorPath = resolve(paths.mirrorsDir, `${project.slug}.git`);
  if (existsSync(mirrorPath)) {
    const remoteProjection = await new GitMarkdownProvider(gitRunner).projectRoadmap(project, {
      mirrorPath,
      ref: `refs/heads/${project.git_branch || "main"}`
    });
    if (remoteProjection.freshness !== "unavailable") return readOnlyProjection(remoteProjection, "remote-commit");
  }

  const cached = await getCachedProjection(project.slug, paths.cacheDir);
  if (cached) return readOnlyProjection(cached, "cached", "Registered workspace is unavailable; displaying the last cached projection.");

  const readAt = new Date().toISOString();
  const issue: ProofIssue = {
    scope: "document",
    code: "PLANNING_SOURCE_UNAVAILABLE",
    sourcePath: project.trusted_path ?? "",
    message: localPaths.message
  };
  return {
    projection: {
      project: project.slug,
      revision: "unavailable",
      fetchedAt: readAt,
      freshness: "unavailable",
      roadmap: [],
      backlog: [],
      tasks: [],
      issues: [issue],
      provenance: [],
      documents: unavailableDocuments(project, issue)
    },
    source: { mode: "cached", writable: false, reason: localPaths.message, readAt }
  };
}
