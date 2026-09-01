import "server-only";

import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { loadControlHostConfig } from "../planning/config";
import type { ProofIssue, ProjectRegistryEntry } from "../planning/domain/types";
import { computeDigest, decodeUtf8 } from "../planning/native/digest";
import { NativePlanningStore } from "../planning/native/store";
import { getNativeRoadmapFilePath, resolveDataRoot } from "../planning/paths";
import type { GitRunner } from "../planning/providers/git-runner";
import { NodeGitRunner } from "../planning/providers/git-runner";
import { resolveLocalPlanningPaths } from "../planning/providers/local-paths";
import { resolveCodePlanning } from "../planning/providers/source-resolver";
import type { AssistantContextManifest, AssistantMode, ManifestDocument, ManifestIssue } from "./contracts";
import { assistantContextManifestSchema } from "./contracts";
import { assistantDigest } from "./digest";
import { ASSISTANT_LIMITS } from "./limits";

const CONTEXT_POLICY_VERSION = 1;
const EMPTY_DIGEST = computeDigest("");

export interface SourceFragment {
  source_id: string;
  path: string;
  file_digest: string;
  heading: string | null;
  line_start: number | null;
  line_end: number | null;
  content: string;
}

export interface AssistantContextReceiptSource {
  source_id: string;
  path: string;
  digest: string;
  bytes: number;
  modified: boolean | null;
  optional: boolean;
  selected: boolean;
  read_at: string;
}

export interface AssistantContextReceipt {
  project_slug: string;
  source_mode: "local-working-tree" | "remote-commit" | "cached" | "native";
  head_revision?: string;
  sources: AssistantContextReceiptSource[];
  issues: ProofIssue[];
}

export interface AssistantContextBundle {
  manifest: AssistantContextManifest;
  receipt: AssistantContextReceipt;
  fragments: SourceFragment[];
}

export type AssistantEntryState =
  | { enabled: false; code: "NOT_CONFIGURED" | "INVALID_CONFIG"; message: string }
  | { enabled: true; receipt: AssistantContextReceipt; manifest_digest: string };

export class ContextAssemblyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ContextAssemblyError";
    this.code = code;
  }
}

export interface AssembleAssistantContextInput {
  projectSlug: string;
  root?: string;
  selectedOptionalSourceIds?: string[];
  mode?: AssistantMode;
  readAt?: string;
}

type RawRead =
  | { ok: true; content: string; digest: string; bytes: number }
  | { ok: false; issue: ProofIssue };

interface SourceDocument {
  sourceId: string;
  path: string;
  digest: string;
  bytes: number;
  modified: boolean | null;
  optional: boolean;
  selected: boolean;
  content: string;
  produceFragment: boolean;
  issues: ProofIssue[];
}

function isRepositoryRelativePath(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  if (isAbsolute(path)) return false;
  const segments = path.split(/[\\/]/);
  return !segments.includes("..") && !segments.includes("");
}

function sanitizeIssue(issue: ProofIssue, base?: string): ProofIssue {
  let sourcePath = issue.sourcePath;
  if (sourcePath && isAbsolute(sourcePath)) {
    if (base) {
      const rel = relative(base, sourcePath);
      sourcePath = !rel || rel.startsWith("..") || isAbsolute(rel) ? undefined : rel;
    } else {
      sourcePath = undefined;
    }
  }
  const result: ProofIssue = { scope: issue.scope, code: issue.code, message: issue.message };
  if (sourcePath) result.sourcePath = sourcePath;
  if (issue.objectId) result.objectId = issue.objectId;
  if (issue.field) result.field = issue.field;
  return result;
}

function toManifestIssue(issue: ProofIssue): ManifestIssue {
  return {
    scope: issue.scope,
    code: issue.code,
    ...(issue.sourcePath ? { source_path: issue.sourcePath } : {}),
    ...(issue.objectId ? { object_id: issue.objectId } : {}),
    ...(issue.field ? { field: issue.field } : {}),
    message: issue.message
  };
}

async function readContainedFile(absPath: string, container: string, sourcePath: string): Promise<RawRead> {
  let realContainer: string;
  try {
    realContainer = await realpath(container);
  } catch {
    realContainer = resolve(container);
  }

  let entry;
  try {
    entry = await lstat(absPath);
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
    return {
      ok: false,
      issue: {
        scope: "document",
        code: missing ? "CONTEXT_FILE_MISSING" : "CONTEXT_FILE_UNAVAILABLE",
        sourcePath,
        message: missing
          ? `Context file is missing at "${sourcePath}".`
          : `Context file cannot be inspected at "${sourcePath}".`
      }
    };
  }

  if (entry.isSymbolicLink()) {
    return {
      ok: false,
      issue: { scope: "document", code: "CONTEXT_FILE_SYMLINK", sourcePath, message: `Context file "${sourcePath}" must not be a symbolic link.` }
    };
  }
  if (!entry.isFile()) {
    return {
      ok: false,
      issue: { scope: "document", code: "CONTEXT_FILE_NOT_REGULAR", sourcePath, message: `Context file "${sourcePath}" must be a regular file.` }
    };
  }

  let realPath: string;
  try {
    realPath = await realpath(absPath);
  } catch {
    return {
      ok: false,
      issue: { scope: "document", code: "CONTEXT_FILE_UNAVAILABLE", sourcePath, message: `Context file "${sourcePath}" cannot be resolved safely.` }
    };
  }
  if (realPath !== realContainer && !realPath.startsWith(realContainer + sep)) {
    return {
      ok: false,
      issue: { scope: "document", code: "CONTEXT_PATH_ESCAPED", sourcePath, message: `Context file "${sourcePath}" resolves outside the workspace.` }
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(realPath);
  } catch {
    return {
      ok: false,
      issue: { scope: "document", code: "CONTEXT_FILE_READ_FAILED", sourcePath, message: `Context file "${sourcePath}" could not be read.` }
    };
  }

  try {
    return { ok: true, content: decodeUtf8(bytes), digest: computeDigest(bytes), bytes: bytes.length };
  } catch {
    return {
      ok: false,
      issue: { scope: "document", code: "INVALID_UTF8", sourcePath, message: `Context file "${sourcePath}" is not valid UTF-8.` }
    };
  }
}

async function readGitFile(runner: GitRunner, mirrorPath: string, ref: string, sourcePath: string): Promise<RawRead> {
  const result = await runner.run(["show", "--end-of-options", `${ref}:${sourcePath}`], {
    cwd: mirrorPath,
    denyExternalCommands: true
  });
  if (result.exitCode !== 0) {
    return {
      ok: false,
      issue: { scope: "document", code: "CONTEXT_FILE_UNAVAILABLE", sourcePath, message: `Could not read "${sourcePath}" from ${ref}.` }
    };
  }
  const content = result.stdout;
  return { ok: true, content, digest: computeDigest(content), bytes: Buffer.byteLength(content, "utf8") };
}

function toDocument(input: {
  sourceId: string;
  path: string;
  optional: boolean;
  selected: boolean;
  modified: boolean | null;
  read: RawRead;
  issues: ProofIssue[];
}): SourceDocument {
  if (input.read.ok) {
    return {
      sourceId: input.sourceId,
      path: input.path,
      digest: input.read.digest,
      bytes: input.read.bytes,
      modified: input.modified,
      optional: input.optional,
      selected: input.selected,
      content: input.read.content,
      produceFragment: input.issues.length === 0,
      issues: input.issues
    };
  }
  return {
    sourceId: input.sourceId,
    path: input.path,
    digest: EMPTY_DIGEST,
    bytes: 0,
    modified: input.modified,
    optional: input.optional,
    selected: input.selected,
    content: "",
    produceFragment: true,
    issues: [...input.issues, input.read.issue]
  };
}

function unselectedOptional(sourceId: string): SourceDocument {
  return {
    sourceId,
    path: sourceId,
    digest: "",
    bytes: 0,
    modified: null,
    optional: true,
    selected: false,
    content: "",
    produceFragment: false,
    issues: []
  };
}

interface RequiredSource {
  sourceId: string;
  kind: "roadmap" | "backlog";
}

function requiredSources(project: ProjectRegistryEntry): RequiredSource[] {
  const result: RequiredSource[] = [];
  if (project.work_modes.includes("implementation")) {
    result.push({ sourceId: "docs/ROADMAP.md", kind: "roadmap" });
  }
  result.push({ sourceId: "docs/BACKLOG.md", kind: "backlog" });
  return result;
}

export async function assembleAssistantContext(input: AssembleAssistantContextInput): Promise<AssistantContextBundle> {
  const {
    projectSlug,
    root,
    selectedOptionalSourceIds = [],
    mode = "standard",
    readAt = new Date().toISOString()
  } = input;

  const store = new NativePlanningStore(root);
  const project = await store.getProject(projectSlug);
  if (!project) {
    throw new ContextAssemblyError("PROJECT_NOT_FOUND", `Project "${projectSlug}" not found`);
  }

  const budgetBytes = ASSISTANT_LIMITS[mode].contextBytes;
  const optionalFileBytes = ASSISTANT_LIMITS.contextFileBytes;
  const selectedSet = new Set(selectedOptionalSourceIds);
  const optionalPaths = (project.assistant?.context_paths ?? []).slice().sort();

  const documents: SourceDocument[] = [];
  let sourceMode: AssistantContextReceipt["source_mode"];
  let headRevision: string | undefined;
  const receiptIssues: ProofIssue[] = [];

  if (project.type === "business") {
    sourceMode = "native";
    headRevision = "native";
    const dataRoot = resolveDataRoot(root);

    const roadmapRead = await readContainedFile(getNativeRoadmapFilePath(projectSlug, root), dataRoot, "roadmap");
    documents.push(
      toDocument({ sourceId: "roadmap", path: "roadmap", optional: false, selected: true, modified: null, read: roadmapRead, issues: [] })
    );

    for (const contextPath of optionalPaths) {
      if (!isRepositoryRelativePath(contextPath)) {
        documents.push(
          toDocument({
            sourceId: contextPath,
            path: contextPath,
            optional: true,
            selected: selectedSet.has(contextPath),
            modified: null,
            read: { ok: false, issue: { scope: "document", code: "CONTEXT_PATH_REJECTED", sourcePath: contextPath, message: `Context path "${contextPath}" is not repository-relative.` } },
            issues: []
          })
        );
        continue;
      }
      if (!selectedSet.has(contextPath)) {
        documents.push(unselectedOptional(contextPath));
        continue;
      }
      const read = await readContainedFile(resolve(dataRoot, ...contextPath.split("/")), dataRoot, contextPath);
      documents.push(toDocument({ sourceId: contextPath, path: contextPath, optional: true, selected: true, modified: null, read, issues: [] }));
    }
  } else {
    const paths = loadControlHostConfig(root);
    const resolved = await resolveCodePlanning({ project, paths, gitRunner: new NodeGitRunner() });
    sourceMode = resolved.source.mode;
    headRevision = resolved.source.headRevision;

    const required = requiredSources(project);
    const documentDiagnostics = new Map<string, ProofIssue[]>();
    for (const triage of resolved.projection.documents) {
      documentDiagnostics.set(triage.document, triage.diagnostics);
    }
    receiptIssues.push(...resolved.projection.issues.map((issue) => sanitizeIssue(issue)));

    if (sourceMode === "local-working-tree") {
      const local = await resolveLocalPlanningPaths(project, paths.config, { allowDegradedDocuments: true });
      const workspacePath = local.ok ? local.workspacePath : undefined;
      const roadmapModified = resolved.source.roadmapModified ?? null;
      const backlogModified = resolved.source.backlogModified ?? null;

      for (const source of required) {
        const modified = source.kind === "roadmap" ? roadmapModified : backlogModified;
        const issues = (documentDiagnostics.get(source.kind) ?? []).map((issue) =>
          sanitizeIssue(issue, workspacePath)
        );
        const read = local.ok
          ? await readContainedFile(join(workspacePath!, ...source.sourceId.split("/")), workspacePath!, source.sourceId)
          : { ok: false as const, issue: { scope: "document" as const, code: local.code, sourcePath: source.sourceId, message: local.message } };
        documents.push(
          toDocument({ sourceId: source.sourceId, path: source.sourceId, optional: false, selected: true, modified, read, issues })
        );
      }

      for (const contextPath of optionalPaths) {
        if (!isRepositoryRelativePath(contextPath)) {
          documents.push(
            toDocument({
              sourceId: contextPath,
              path: contextPath,
              optional: true,
              selected: selectedSet.has(contextPath),
              modified: null,
              read: { ok: false, issue: { scope: "document", code: "CONTEXT_PATH_REJECTED", sourcePath: contextPath, message: `Context path "${contextPath}" is not repository-relative.` } },
              issues: []
            })
          );
          continue;
        }
        if (!selectedSet.has(contextPath)) {
          documents.push(unselectedOptional(contextPath));
          continue;
        }
        const read = local.ok
          ? await readContainedFile(join(workspacePath!, ...contextPath.split("/")), workspacePath!, contextPath)
          : { ok: false as const, issue: { scope: "document" as const, code: local.code, sourcePath: contextPath, message: local.message } };
        documents.push(toDocument({ sourceId: contextPath, path: contextPath, optional: true, selected: true, modified: null, read, issues: [] }));
      }
    } else if (sourceMode === "remote-commit") {
      const mirrorPath = resolve(paths.mirrorsDir, `${project.slug}.git`);
      const ref = `refs/heads/${project.git_branch || "main"}`;
      const runner = new NodeGitRunner();

      for (const source of required) {
        const issues = (documentDiagnostics.get(source.kind) ?? []).map((issue) => sanitizeIssue(issue));
        const read = await readGitFile(runner, mirrorPath, ref, source.sourceId);
        documents.push(
          toDocument({ sourceId: source.sourceId, path: source.sourceId, optional: false, selected: true, modified: null, read, issues })
        );
      }

      for (const contextPath of optionalPaths) {
        if (!selectedSet.has(contextPath)) {
          documents.push(unselectedOptional(contextPath));
          continue;
        }
        const read = await readGitFile(runner, mirrorPath, ref, contextPath);
        documents.push(toDocument({ sourceId: contextPath, path: contextPath, optional: true, selected: true, modified: null, read, issues: [] }));
      }
    } else {
      for (const source of required) {
        const provenance = resolved.projection.provenance.find((entry) => entry.location === source.sourceId);
        documents.push({
          sourceId: source.sourceId,
          path: source.sourceId,
          digest: provenance?.digest ?? EMPTY_DIGEST,
          bytes: 0,
          modified: null,
          optional: false,
          selected: true,
          content: "",
          produceFragment: false,
          issues: []
        });
      }

      for (const contextPath of optionalPaths) {
        if (!selectedSet.has(contextPath)) {
          documents.push(unselectedOptional(contextPath));
          continue;
        }
        documents.push({
          sourceId: contextPath,
          path: contextPath,
          digest: EMPTY_DIGEST,
          bytes: 0,
          modified: null,
          optional: true,
          selected: true,
          content: "",
          produceFragment: false,
          issues: [{ scope: "document", code: "CONTEXT_FILE_UNAVAILABLE", sourcePath: contextPath, message: "Optional context files are unavailable for cached sources." }]
        });
      }
    }
  }

  const selectedDocuments = documents.filter((document) => document.selected);
  const totalBytes = selectedDocuments.reduce((sum, document) => sum + document.bytes, 0);
  if (totalBytes > budgetBytes) {
    throw new ContextAssemblyError(
      "CONTEXT_LIMIT",
      `Selected context is ${totalBytes} bytes, exceeding the ${budgetBytes}-byte ${mode} context budget.`
    );
  }
  for (const document of selectedDocuments) {
    if (document.optional && document.bytes > optionalFileBytes) {
      throw new ContextAssemblyError(
        "CONTEXT_LIMIT",
        `Optional context file "${document.path}" is ${document.bytes} bytes, exceeding the ${optionalFileBytes}-byte per-file limit.`
      );
    }
  }

  const manifestDocuments: ManifestDocument[] = selectedDocuments.map((document) => ({
    source_id: document.sourceId,
    path: document.path,
    digest: document.digest,
    bytes: document.bytes,
    modified: document.modified,
    optional: document.optional,
    selected: document.selected,
    read_at: readAt,
    issues: document.issues.map(toManifestIssue)
  }));

  const manifestBody = {
    project_slug: projectSlug,
    source_mode: sourceMode,
    ...(headRevision ? { head_revision: headRevision } : {}),
    documents: manifestDocuments,
    context_policy_version: CONTEXT_POLICY_VERSION
  };
  // `read_at` is receipt metadata, not source authority. Including a fresh
  // timestamp here would make an otherwise identical page/API re-read stale.
  const manifestDigest = assistantDigest({
    ...manifestBody,
    documents: manifestDocuments.map(({ read_at: _readAt, ...document }) => document)
  });
  const manifest: AssistantContextManifest = assistantContextManifestSchema.parse({
    ...manifestBody,
    manifest_digest: manifestDigest
  });

  const fragments: SourceFragment[] = selectedDocuments
    .filter((document) => document.produceFragment)
    .map((document) => ({
      source_id: document.sourceId,
      path: document.path,
      file_digest: document.digest,
      heading: null,
      line_start: document.content.length > 0 ? 1 : null,
      line_end: document.content.length > 0 ? document.content.split("\n").length : null,
      content: document.content
    }));

  const receipt: AssistantContextReceipt = {
    project_slug: projectSlug,
    source_mode: sourceMode,
    ...(headRevision ? { head_revision: headRevision } : {}),
    sources: documents.map((document) => ({
      source_id: document.sourceId,
      path: document.path,
      digest: document.digest,
      bytes: document.bytes,
      modified: document.modified,
      optional: document.optional,
      selected: document.selected,
      read_at: readAt
    })),
    issues: [...receiptIssues, ...documents.flatMap((document) => document.issues)]
  };

  return { manifest, receipt, fragments };
}

export async function prepareAssistantEntry(
  projectSlug: string,
  options: { root?: string } = {}
): Promise<AssistantEntryState> {
  let paths;
  try {
    paths = loadControlHostConfig(options.root);
  } catch {
    return {
      enabled: false,
      code: "NOT_CONFIGURED",
      message: "Management assistant is not configured on this Control Host."
    };
  }

  if (!paths.config.assistant?.enabled) {
    return {
      enabled: false,
      code: "NOT_CONFIGURED",
      message: "Management assistant is disabled on this Control Host."
    };
  }

  try {
    const bundle = await assembleAssistantContext({ projectSlug, root: options.root });
    return {
      enabled: true,
      receipt: bundle.receipt,
      manifest_digest: bundle.manifest.manifest_digest
    };
  } catch (err) {
    const message =
      err instanceof ContextAssemblyError
        ? `Management assistant cannot prepare context: ${err.message}`
        : "Management assistant configuration is invalid.";
    return { enabled: false, code: "INVALID_CONFIG", message };
  }
}
