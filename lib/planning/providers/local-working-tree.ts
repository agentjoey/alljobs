import "server-only";

import { readFile } from "node:fs/promises";
import { validateProjectRelations } from "../domain/relations";
import type { ProjectRegistryEntry, ProofIssue, RoadmapItem } from "../domain/types";
import { parseBacklogDocument } from "../markdown/backlog";
import { parseRoadmapDocument } from "../markdown/roadmap";
import { computeDigest, decodeUtf8 } from "../native/digest";
import type { ControlHostConfig } from "../config";
import type { ExternalProjection, ResolvedCodePlanning, SourceProvenance } from "./contracts";
import type { GitRunner } from "./git-runner";
import { resolveLocalPlanningPaths } from "./local-paths";

function hasConflictMarkers(content: string) {
  return /^(<{7}|={7}|>{7})/m.test(content);
}

function modifiedPaths(status: string) {
  const paths = new Set<string>();
  for (const line of status.split("\n")) {
    const path = line.slice(3).trim();
    if (path) paths.add(path);
  }
  return paths;
}

export async function readLocalWorkingTreePlanning(input: {
  project: ProjectRegistryEntry;
  config: ControlHostConfig;
  gitRunner: GitRunner;
}): Promise<ResolvedCodePlanning> {
  const { project, config, gitRunner } = input;
  const paths = await resolveLocalPlanningPaths(project, config);
  if (!paths.ok) throw new Error(`Cannot read local planning source: ${paths.code}`);

  const readAt = new Date().toISOString();
  const [backlogBytes, roadmapBytes] = await Promise.all([
    readFile(paths.backlogPath),
    project.work_modes.includes("implementation") ? readFile(paths.roadmapPath) : Promise.resolve(Buffer.alloc(0))
  ]);
  const issues: ProofIssue[] = [];
  let backlogContent = "";
  let roadmapContent = "";
  for (const [bytes, path, assign] of [
    [backlogBytes, paths.backlogPath, (value: string) => { backlogContent = value; }],
    [roadmapBytes, paths.roadmapPath, (value: string) => { roadmapContent = value; }]
  ] as const) {
    try {
      assign(decodeUtf8(bytes));
    } catch {
      issues.push({
        scope: "document",
        code: "INVALID_UTF8",
        sourcePath: path,
        message: "Planning documents must contain valid UTF-8; no direct write is allowed."
      });
    }
  }
  const roadmapResult = project.work_modes.includes("implementation")
    ? parseRoadmapDocument(roadmapContent, paths.roadmapPath, "phase")
    : { valid: [] as RoadmapItem[], issues: [] as ProofIssue[] };
  const backlogResult = parseBacklogDocument(backlogContent, paths.backlogPath);
  issues.push(...roadmapResult.issues, ...backlogResult.issues);

  for (const [content, path] of [[roadmapContent, paths.roadmapPath], [backlogContent, paths.backlogPath]] as const) {
    if (content && hasConflictMarkers(content)) {
      issues.push({
        scope: "document",
        code: "GIT_CONFLICT_MARKERS",
        sourcePath: path,
        message: "Planning files with Git conflict markers cannot be used for direct writes."
      });
    }
  }

  const relationResult = validateProjectRelations({
    project,
    roadmapItems: roadmapResult.valid,
    backlogItems: backlogResult.valid,
    tasks: [],
    sourcePath: paths.workspacePath
  });
  issues.push(...relationResult.issues);

  const [headResult, roadmapHeadResult, backlogHeadResult] = await Promise.all([
    gitRunner.run(["rev-parse", "--verify", "HEAD"], { cwd: paths.workspacePath, denyExternalCommands: true }),
    project.work_modes.includes("implementation")
      ? gitRunner.run(["show", "HEAD:docs/ROADMAP.md"], { cwd: paths.workspacePath, denyExternalCommands: true })
      : Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }),
    gitRunner.run(["show", "HEAD:docs/BACKLOG.md"], { cwd: paths.workspacePath, denyExternalCommands: true })
  ]);
  if (headResult.exitCode !== 0) {
    issues.push({
      scope: "document",
      code: "GIT_HEAD_UNAVAILABLE",
      sourcePath: paths.workspacePath,
      message: "The local planning source has no readable Git HEAD."
    });
  }
  if (roadmapHeadResult.exitCode !== 0 || backlogHeadResult.exitCode !== 0) {
    issues.push({
      scope: "document",
      code: "GIT_HEAD_CONTENT_UNAVAILABLE",
      sourcePath: paths.workspacePath,
      message: "The local planning source could not compare planning files with Git HEAD."
    });
  }

  const roadmapModified = roadmapHeadResult.exitCode === 0 && Boolean(roadmapBytes.length)
    ? computeDigest(Buffer.from(roadmapHeadResult.stdout, "utf8")) !== computeDigest(roadmapBytes)
    : false;
  const backlogModified = backlogHeadResult.exitCode === 0
    ? computeDigest(Buffer.from(backlogHeadResult.stdout, "utf8")) !== computeDigest(backlogBytes)
    : false;
  const revision = headResult.exitCode === 0 ? headResult.stdout.trim() : "unknown";
  const roadmapDigest = roadmapBytes.length ? computeDigest(roadmapBytes) : undefined;
  const backlogDigest = computeDigest(backlogBytes);
  const provenance: SourceProvenance[] = [
    ...(roadmapDigest ? [{ provider: "local-working-tree", location: "docs/ROADMAP.md", revision, digest: roadmapDigest, fetchedAt: readAt }] : []),
    { provider: "local-working-tree", location: "docs/BACKLOG.md", revision, digest: backlogDigest, fetchedAt: readAt }
  ];
  const projection: ExternalProjection = {
    project: project.slug,
    revision,
    fetchedAt: readAt,
    freshness: "fresh",
    roadmap: relationResult.valid[0]?.roadmapItems ?? roadmapResult.valid,
    backlog: relationResult.valid[0]?.backlogItems ?? backlogResult.valid,
    tasks: [],
    issues,
    provenance
  };

  return {
    projection,
    source: {
      mode: "local-working-tree",
      writable: issues.length === 0,
      reason: issues.length ? "Local planning source has validation or Git proof issues." : undefined,
      headRevision: revision,
      roadmapDigest,
      backlogDigest,
      roadmapModified,
      backlogModified,
      readAt
    }
  };
}
