import "server-only";

import { readFile } from "node:fs/promises";
import { validateProjectRelations } from "../domain/relations";
import type { ProjectRegistryEntry, ProofIssue, RoadmapItem } from "../domain/types";
import { triagePlanningDocument } from "../document-triage";
import { parseBacklogDocument } from "../markdown/backlog";
import { parseRoadmapDocument } from "../markdown/roadmap";
import { computeDigest, decodeUtf8 } from "../native/digest";
import type { ControlHostConfig } from "../config";
import type { ExternalProjection, ResolvedCodePlanning, SourceProvenance } from "./contracts";
import type { GitRunner } from "./git-runner";
import { resolveLocalPlanningPaths, type LocalDocumentInspection } from "./local-paths";

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

interface LocalDocumentRead {
  bytes?: Buffer;
  content?: string;
  issues: ProofIssue[];
  missing: boolean;
  unavailable: boolean;
}

async function readInspectedDocument(inspection: LocalDocumentInspection): Promise<LocalDocumentRead> {
  if (!inspection.readable) {
    return {
      issues: [inspection.issue],
      missing: inspection.issue.code === "PLANNING_FILE_MISSING",
      unavailable: inspection.issue.code !== "PLANNING_FILE_MISSING"
    };
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(inspection.path);
  } catch {
    return {
      issues: [{
        scope: "document",
        code: "PLANNING_FILE_READ_FAILED",
        sourcePath: inspection.path,
        message: "Planning document could not be read after safe path inspection."
      }],
      missing: false,
      unavailable: true
    };
  }

  try {
    return { bytes, content: decodeUtf8(bytes), issues: [], missing: false, unavailable: false };
  } catch {
    return {
      bytes,
      issues: [{
        scope: "document",
        code: "INVALID_UTF8",
        sourcePath: inspection.path,
        message: "Planning documents must contain valid UTF-8; no direct write is allowed."
      }],
      missing: false,
      unavailable: true
    };
  }
}

function localModified(bytes: Buffer | undefined, head: { stdout: string; exitCode: number }) {
  if (head.exitCode === 0) {
    return bytes
      ? computeDigest(Buffer.from(head.stdout, "utf8")) !== computeDigest(bytes)
      : true;
  }
  return Boolean(bytes);
}

export async function readLocalWorkingTreePlanning(input: {
  project: ProjectRegistryEntry;
  config: ControlHostConfig;
  gitRunner: GitRunner;
}): Promise<ResolvedCodePlanning> {
  const { project, config, gitRunner } = input;
  const paths = await resolveLocalPlanningPaths(project, config, { allowDegradedDocuments: true });
  if (!paths.ok) throw new Error(`Cannot read local planning source: ${paths.code}`);

  const readAt = new Date().toISOString();
  const needsRoadmap = project.work_modes.includes("implementation");
  const [backlogDocument, roadmapDocument] = await Promise.all([
    readInspectedDocument(paths.backlog),
    needsRoadmap
      ? readInspectedDocument(paths.roadmap)
      : Promise.resolve<LocalDocumentRead>({ issues: [], missing: false, unavailable: false })
  ]);
  const roadmapResult = needsRoadmap && roadmapDocument.content !== undefined
    ? parseRoadmapDocument(roadmapDocument.content, paths.roadmap.path, "phase")
    : { valid: [] as RoadmapItem[], issues: [] as ProofIssue[] };
  const backlogResult = backlogDocument.content !== undefined
    ? parseBacklogDocument(backlogDocument.content, paths.backlog.path)
    : { valid: [], issues: [] as ProofIssue[] };
  const roadmapIssues = [...roadmapDocument.issues, ...roadmapResult.issues];
  const backlogIssues = [...backlogDocument.issues, ...backlogResult.issues];

  for (const [content, path, documentIssues] of [
    [roadmapDocument.content, paths.roadmap.path, roadmapIssues],
    [backlogDocument.content, paths.backlog.path, backlogIssues]
  ] as const) {
    if (content && hasConflictMarkers(content)) {
      documentIssues.push({
        scope: "document",
        code: "GIT_CONFLICT_MARKERS",
        sourcePath: path,
        message: "Planning files with Git conflict markers cannot be used for direct writes."
      });
    }
  }
  const issues: ProofIssue[] = [...roadmapIssues, ...backlogIssues];

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
    needsRoadmap
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
  const roadmapModified = needsRoadmap ? localModified(roadmapDocument.bytes, roadmapHeadResult) : false;
  const backlogModified = localModified(backlogDocument.bytes, backlogHeadResult);
  const revision = headResult.exitCode === 0 ? headResult.stdout.trim() : "unknown";
  const roadmapDigest = roadmapDocument.bytes ? computeDigest(roadmapDocument.bytes) : undefined;
  const backlogDigest = backlogDocument.bytes ? computeDigest(backlogDocument.bytes) : undefined;
  const provenance: SourceProvenance[] = [
    ...(roadmapDigest ? [{ provider: "local-working-tree", location: "docs/ROADMAP.md", revision, digest: roadmapDigest, fetchedAt: readAt }] : []),
    ...(backlogDigest ? [{ provider: "local-working-tree", location: "docs/BACKLOG.md", revision, digest: backlogDigest, fetchedAt: readAt }] : [])
  ];
  const documents = [
    ...(needsRoadmap ? [triagePlanningDocument({
      document: "roadmap",
      sourcePath: paths.roadmap.path,
      content: roadmapDocument.content,
      digest: roadmapDigest,
      revision,
      parserIssues: roadmapIssues,
      canonicalItemCount: roadmapResult.valid.length,
      missing: roadmapDocument.missing,
      unavailable: roadmapDocument.unavailable
    })] : []),
    triagePlanningDocument({
      document: "backlog",
      sourcePath: paths.backlog.path,
      content: backlogDocument.content,
      digest: backlogDigest,
      revision,
      parserIssues: backlogIssues,
      canonicalItemCount: backlogResult.valid.length,
      missing: backlogDocument.missing,
      unavailable: backlogDocument.unavailable
    })
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
    provenance,
    documents
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
