import "server-only";

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, sep } from "node:path";
import { isDirectChildOfTrustedRoots, loadControlHostConfig } from "../planning/config";
import type { ProjectRegistryEntry } from "../planning/domain/types";
import { computeDigest, decodeUtf8 } from "../planning/native/digest";
import type { SourceFragment } from "./context";
import type { SourceGateRecord } from "./source-gates";

const MAX_SOURCE_FILE_BYTES = 64 * 1024;
const MAX_LIST_RESULTS = 4096;
const MAX_LIST_VISITS = 20_000;

const EXCLUDED_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "build", "coverage",
  ".cache", ".turbo", "vendor", "target", "tmp", "temp"
]);

const EXCLUDED_FILES =
  /(^|\/)(\.env(\..+)?|.*\.(pem|key|p12|pfx|crt|cer)|id_rsa|id_ed25519|credentials?(\..+)?|secrets?(\..+)?)$/i;

const ALLOWED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".kts", ".swift",
  ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".php", ".scala",
  ".lua", ".zig", ".ex", ".exs",
  ".vue", ".svelte", ".astro",
  ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".conf", ".cfg",
  ".editorconfig", ".gitignore", ".gitattributes", ".dockerignore",
  ".properties", ".lock",
  ".md", ".mdx", ".txt", ".rst", ".adoc",
  ".css", ".scss", ".sass", ".less",
  ".html", ".htm", ".svg", ".xml",
  ".sql", ".graphql", ".gql", ".prisma", ".proto",
  ".csv", ".tsv",
  ".sh", ".bash", ".zsh"
]);

export class SourceFileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SourceFileError";
    this.code = code;
  }
}

export interface SourceReadBudget {
  max_files: number;
  max_bytes: number;
  max_tool_calls: number;
  remaining_files: number;
  remaining_bytes: number;
  remaining_tool_calls: number;
}

export interface ListProjectFilesInput {
  project: ProjectRegistryEntry;
  budget: SourceReadBudget;
  prefix?: string;
  root?: string;
}

export interface ListProjectFilesResult {
  paths: string[];
  remaining_tool_calls: number;
}

export interface ReadProjectFilesInput {
  project: ProjectRegistryEntry;
  paths: string[];
  budget: SourceReadBudget;
  root?: string;
}

export interface ReadProjectFilesResult {
  fragments: SourceFragment[];
  remaining_tool_calls: number;
  remaining_bytes: number;
}

export interface AssistantReadTools {
  list_project_files?: (input: { prefix?: string }) => Promise<ListProjectFilesResult>;
  read_project_files?: (input: { paths: string[] }) => Promise<ReadProjectFilesResult>;
}

export function sourceBudgetFromGate(gate: SourceGateRecord): SourceReadBudget {
  return {
    max_files: gate.max_files,
    max_bytes: gate.max_bytes,
    max_tool_calls: gate.max_tool_calls,
    remaining_files: gate.max_files,
    remaining_bytes: gate.max_bytes,
    remaining_tool_calls: gate.max_tool_calls
  };
}

export function createAssistantReadTools(input: {
  project: ProjectRegistryEntry;
  gate: SourceGateRecord;
  root?: string;
}): AssistantReadTools {
  const budget = sourceBudgetFromGate(input.gate);
  return {
    ...(input.gate.capabilities.includes("list_project_files") ? {
      list_project_files: (opts = {}) =>
        listProjectFiles({ project: input.project, budget, prefix: opts.prefix, root: input.root })
    } : {}),
    ...(input.gate.capabilities.includes("read_project_files") ? {
      read_project_files: (opts) =>
        readProjectFiles({ project: input.project, paths: opts.paths, budget, root: input.root })
    } : {})
  };
}

function hasAllowedExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return ALLOWED_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

function validateRequestedPath(relPath: string): void {
  if (!relPath || typeof relPath !== "string") {
    throw new SourceFileError("SOURCE_PATH_REJECTED", "Source path must be a non-empty repository-relative string.");
  }
  if (isAbsolute(relPath)) {
    throw new SourceFileError("SOURCE_PATH_REJECTED", `Source path "${relPath}" must be repository-relative, not absolute.`);
  }
  if (relPath.includes("\\")) {
    throw new SourceFileError("SOURCE_PATH_REJECTED", `Source path "${relPath}" must use forward slashes.`);
  }
  const segments = relPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new SourceFileError("SOURCE_PATH_REJECTED", `Source path "${relPath}" contains traversal or empty segments.`);
  }
  for (const segment of segments.slice(0, -1)) {
    if (EXCLUDED_DIRS.has(segment) || EXCLUDED_FILES.test(segment)) {
      throw new SourceFileError("SOURCE_PATH_EXCLUDED", `Source path "${relPath}" traverses an excluded directory or file.`);
    }
  }
  const basename = segments[segments.length - 1];
  if (EXCLUDED_FILES.test(basename)) {
    throw new SourceFileError("SOURCE_PATH_EXCLUDED", `Source path "${relPath}" is excluded.`);
  }
}

function validatePrefix(prefix: string): void {
  if (isAbsolute(prefix)) {
    throw new SourceFileError("SOURCE_PATH_REJECTED", "Source prefix must be repository-relative, not absolute.");
  }
  if (prefix.includes("\\")) {
    throw new SourceFileError("SOURCE_PATH_REJECTED", "Source prefix must use forward slashes.");
  }
  const segments = prefix.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new SourceFileError("SOURCE_PATH_REJECTED", `Source prefix "${prefix}" contains traversal or empty segments.`);
  }
  for (const segment of segments) {
    if (EXCLUDED_DIRS.has(segment) || EXCLUDED_FILES.test(segment)) {
      throw new SourceFileError("SOURCE_PATH_EXCLUDED", `Source prefix "${prefix}" traverses an excluded directory or file.`);
    }
  }
}

async function resolveWorkspace(project: ProjectRegistryEntry, root?: string): Promise<string> {
  const candidatePath = project.trusted_path;
  if (!candidatePath) {
    throw new SourceFileError("SOURCE_WORKSPACE_UNAVAILABLE", `Project "${project.slug}" has no registered trusted workspace.`);
  }

  let entry;
  try {
    entry = await lstat(candidatePath);
  } catch {
    throw new SourceFileError("SOURCE_WORKSPACE_UNAVAILABLE", `Registered workspace is unavailable at "${candidatePath}".`);
  }
  if (entry.isSymbolicLink()) {
    throw new SourceFileError("SOURCE_WORKSPACE_SYMLINK", "Registered workspace must not be a symbolic link.");
  }
  if (!entry.isDirectory()) {
    throw new SourceFileError("SOURCE_WORKSPACE_NOT_DIRECTORY", "Registered workspace must be a directory.");
  }

  let paths;
  try {
    paths = loadControlHostConfig(root);
  } catch {
    throw new SourceFileError(
      "SOURCE_WORKSPACE_UNTRUSTED",
      `Project "${project.slug}" workspace cannot be verified: Control Host configuration is missing.`
    );
  }

  const containment = isDirectChildOfTrustedRoots(candidatePath, paths.config);
  if (!containment.trusted) {
    throw new SourceFileError(
      "SOURCE_WORKSPACE_UNTRUSTED",
      containment.reason ?? `Registered workspace "${candidatePath}" is not trusted.`
    );
  }

  return realpath(candidatePath);
}

async function readSingleFile(
  workspace: string,
  relPath: string
): Promise<{ fragment: SourceFragment; bytes: number }> {
  const segments = relPath.split("/");
  let current = workspace;
  for (let i = 0; i < segments.length; i++) {
    current = join(current, segments[i]);
    let entry;
    try {
      entry = await lstat(current);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new SourceFileError("SOURCE_FILE_NOT_FOUND", `Source file "${relPath}" does not exist.`);
      }
      throw new SourceFileError("SOURCE_FILE_UNAVAILABLE", `Source path "${relPath}" cannot be inspected.`);
    }
    if (entry.isSymbolicLink()) {
      throw new SourceFileError("SOURCE_SYMLINK_REJECTED", `Source path "${relPath}" contains a symbolic link.`);
    }
    if (i === segments.length - 1) {
      if (!entry.isFile()) {
        throw new SourceFileError("SOURCE_FILE_NOT_REGULAR", `Source path "${relPath}" is not a regular file.`);
      }
      if (entry.size > MAX_SOURCE_FILE_BYTES) {
        throw new SourceFileError(
          "SOURCE_FILE_TOO_LARGE",
          `Source file "${relPath}" exceeds the ${MAX_SOURCE_FILE_BYTES}-byte per-file limit.`
        );
      }
    } else if (!entry.isDirectory()) {
      throw new SourceFileError("SOURCE_PATH_REJECTED", `Source path "${relPath}" traverses a non-directory component.`);
    }
  }

  const basename = segments[segments.length - 1];
  if (!hasAllowedExtension(basename)) {
    throw new SourceFileError("SOURCE_EXTENSION_REJECTED", `Source file "${relPath}" has a disallowed extension.`);
  }

  const absPath = join(workspace, ...segments);
  let realPath: string;
  try {
    realPath = await realpath(absPath);
  } catch {
    throw new SourceFileError("SOURCE_FILE_UNAVAILABLE", `Source file "${relPath}" cannot be resolved.`);
  }
  const realWorkspace = await realpath(workspace);
  if (realPath !== realWorkspace && !realPath.startsWith(realWorkspace + sep)) {
    throw new SourceFileError("SOURCE_PATH_ESCAPED", `Source file "${relPath}" resolves outside the workspace.`);
  }

  const bytes = await readFile(realPath);
  if (bytes.includes(0)) {
    throw new SourceFileError("SOURCE_FILE_BINARY", `Source file "${relPath}" contains NUL bytes and is not a text file.`);
  }
  let content: string;
  try {
    content = decodeUtf8(bytes);
  } catch {
    throw new SourceFileError("SOURCE_FILE_BINARY", `Source file "${relPath}" is not valid UTF-8.`);
  }

  return {
    fragment: {
      source_id: relPath,
      path: relPath,
      file_digest: computeDigest(bytes),
      heading: null,
      line_start: null,
      line_end: null,
      content
    },
    bytes: bytes.length
  };
}

async function walk(dir: string, relBase: string, out: string[], state: { visited: number }): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    state.visited += 1;
    if (state.visited > MAX_LIST_VISITS) {
      throw new SourceFileError("SOURCE_LIST_TOO_LARGE", "Source tree exceeds the listing safety bound.");
    }
    const name = entry.name;
    const relPath = relBase ? `${relBase}/${name}` : name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(name) || EXCLUDED_FILES.test(name)) continue;
      await walk(join(dir, name), relPath, out, state);
    } else if (entry.isFile()) {
      if (EXCLUDED_FILES.test(name) || !hasAllowedExtension(name)) continue;
      if (out.length >= MAX_LIST_RESULTS) {
        throw new SourceFileError("SOURCE_LIST_TOO_LARGE", "Source listing exceeds the result bound.");
      }
      out.push(relPath);
    }
  }
}

export async function listProjectFiles(input: ListProjectFilesInput): Promise<ListProjectFilesResult> {
  const { project, budget, prefix, root } = input;
  if (budget.remaining_tool_calls <= 0) {
    throw new SourceFileError("SOURCE_TOOL_CALLS_EXHAUSTED", "Source inspection tool-call budget is exhausted.");
  }
  budget.remaining_tool_calls -= 1;

  if (prefix !== undefined && prefix !== "") {
    validatePrefix(prefix);
  }

  const workspace = await resolveWorkspace(project, root);

  const paths: string[] = [];
  await walk(workspace, "", paths, { visited: 0 });
  paths.sort();

  const filtered = prefix ? paths.filter((p) => p === prefix || p.startsWith(`${prefix}/`)) : paths;

  const listedPaths = filtered.slice(0, budget.remaining_files);
  budget.remaining_files -= listedPaths.length;
  return { paths: listedPaths, remaining_tool_calls: budget.remaining_tool_calls };
}

export async function readProjectFiles(input: ReadProjectFilesInput): Promise<ReadProjectFilesResult> {
  const { project, paths, budget } = input;
  if (budget.remaining_tool_calls <= 0) {
    throw new SourceFileError("SOURCE_TOOL_CALLS_EXHAUSTED", "Source inspection tool-call budget is exhausted.");
  }
  budget.remaining_tool_calls -= 1;

  const workspace = await resolveWorkspace(project, input.root);

  for (const path of paths) {
    validateRequestedPath(path);
  }
  if (paths.length > budget.remaining_files) {
    throw new SourceFileError(
      "SOURCE_FILES_EXCEEDED",
      `Requested ${paths.length} files but only ${budget.remaining_files} remain in the source-file budget.`
    );
  }

  const fragments: SourceFragment[] = [];
  let consumedBytes = 0;
  for (const path of paths) {
    const { fragment, bytes } = await readSingleFile(workspace, path);
    consumedBytes += bytes;
    if (consumedBytes > budget.remaining_bytes) {
      throw new SourceFileError(
        "SOURCE_BYTES_EXCEEDED",
        `Source content exceeds the ${budget.max_bytes}-byte budget.`
      );
    }
    fragments.push(fragment);
  }

  budget.remaining_files -= paths.length;
  budget.remaining_bytes -= consumedBytes;

  return {
    fragments,
    remaining_tool_calls: budget.remaining_tool_calls,
    remaining_bytes: budget.remaining_bytes
  };
}
