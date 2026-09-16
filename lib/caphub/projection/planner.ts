import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { digestCanonicalJson } from "../analysis/digest";
import { sha256Hex } from "../packages/digest";
import { projectionEntrySchema } from "../packages/schemas";
import type { CapabilityPackage, P4ErrorCode, ProjectionEntry } from "../packages/types";
import { OBSIDIAN_MANAGED_START, parseObsidianDocument } from "./markers";
import { ProjectionPathError, resolveSafeDescendant, type ValidatedTargetRoot } from "./paths";
import { renderObsidianDocument } from "./render";

const ORPHAN_SCAN_MAX_DEPTH = 8;
const ORPHAN_SCAN_MAX_FILES = 200;
const ORPHAN_SCAN_MAX_FILE_BYTES = 1024 * 1024;
const DEFAULT_PREVIEW_BYTES = 4096;

/**
 * Deterministic system-managed Markdown for a Release projection page. Built
 * only from the immutable package payload; safe text by construction.
 */
export function projectionMarkdownForPackage(pkg: CapabilityPackage): string {
  return [
    `# ${pkg.title}`,
    "",
    pkg.description,
    "",
    `- Version: ${pkg.version}`,
    `- Kind: ${pkg.kind}`,
    `- License: ${pkg.license.spdx_id} (${pkg.license.provenance_confidence} confidence)`,
    `- Triggers: ${pkg.triggers.join("; ") || "none"}`,
    `- Known limits: ${pkg.known_limits.join("; ") || "none"}`,
    "",
    "## Instructions",
    "",
    pkg.instructions,
    ""
  ].join("\n");
}

export class ProjectionPlanError extends Error {
  constructor(
    readonly code: P4ErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "ProjectionPlanError";
  }
}

export interface ProjectionDocumentInput {
  record_id: string;
  record_version: number;
  record_digest: string;
  relative_path: string;
  managed_markdown: string;
  human_content?: string;
}

export interface ProjectionPlan {
  entries: ProjectionEntry[];
  preimage_digest: string;
  postimage_digest: string;
  diff: string;
  truncated: boolean;
}

async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") {
      return null;
    }
    if (error instanceof ProjectionPathError) throw error;
    throw error;
  }
}

async function collectOwnedFiles(root: string, directory: string, depth: number, output: string[]): Promise<void> {
  if (depth > ORPHAN_SCAN_MAX_DEPTH || output.length >= ORPHAN_SCAN_MAX_FILES) return;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (output.length >= ORPHAN_SCAN_MAX_FILES) return;
    if (entry.isSymbolicLink()) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectOwnedFiles(root, full, depth + 1, output);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      output.push(full);
    }
  }
}

export async function planProjection(input: {
  root: ValidatedTargetRoot;
  documents: ProjectionDocumentInput[];
  maxPreviewBytes?: number;
}): Promise<ProjectionPlan> {
  const paths = new Set<string>();
  for (const document of input.documents) {
    if (paths.has(document.relative_path)) {
      throw new ProjectionPlanError("PROJECTION_CONFLICT", `duplicate document path ${document.relative_path}`);
    }
    paths.add(document.relative_path);
  }

  const draftEntries: ProjectionEntry[] = [];

  for (const document of input.documents) {
    const targetPath = await resolveSafeDescendant(input.root, document.relative_path);
    const rendered = renderObsidianDocument({
      record_id: document.record_id,
      record_version: document.record_version,
      record_digest: document.record_digest,
      managed_markdown: document.managed_markdown,
      human_content: document.human_content
    });

    const existing = await readIfExists(targetPath);
    if (existing === null) {
      draftEntries.push({
        schema_version: 1,
        record_id: document.record_id,
        record_version: document.record_version,
        record_digest: document.record_digest,
        relative_path: document.relative_path,
        managed_digest: rendered.managed_digest,
        preimage_digest: null,
        postimage_digest: rendered.postimage_digest,
        action: "create",
        conflict_reason: null
      });
      continue;
    }

    const raw = existing.toString("utf8");
    const preimageDigest = sha256Hex(raw);
    let parsed;
    try {
      parsed = parseObsidianDocument(raw);
    } catch {
      draftEntries.push({
        schema_version: 1,
        record_id: document.record_id,
        record_version: document.record_version,
        record_digest: document.record_digest,
        relative_path: document.relative_path,
        managed_digest: rendered.managed_digest,
        preimage_digest: preimageDigest,
        postimage_digest: rendered.postimage_digest,
        action: "conflict",
        conflict_reason: "existing file is not owned by Caphub"
      });
      continue;
    }

    if (parsed.record_id !== document.record_id) {
      draftEntries.push({
        schema_version: 1,
        record_id: document.record_id,
        record_version: document.record_version,
        record_digest: document.record_digest,
        relative_path: document.relative_path,
        managed_digest: rendered.managed_digest,
        preimage_digest: preimageDigest,
        postimage_digest: rendered.postimage_digest,
        action: "conflict",
        conflict_reason: "existing file has a different stable record identity"
      });
      continue;
    }

    const unchanged = parsed.record_version === document.record_version
      && parsed.record_digest === document.record_digest
      && parsed.managed_digest === rendered.managed_digest;
    if (unchanged) continue;

    draftEntries.push({
      schema_version: 1,
      record_id: document.record_id,
      record_version: document.record_version,
      record_digest: document.record_digest,
      relative_path: document.relative_path,
      managed_digest: rendered.managed_digest,
      preimage_digest: preimageDigest,
      postimage_digest: rendered.postimage_digest,
      action: "update",
      conflict_reason: null
    });
  }

  const ownedCandidates: string[] = [];
  await collectOwnedFiles(input.root.root, input.root.root, 0, ownedCandidates);
  for (const candidate of ownedCandidates) {
    if (paths.has(candidate.slice(input.root.root.length + 1))) continue;
    const info = await stat(candidate);
    if (info.size > ORPHAN_SCAN_MAX_FILE_BYTES) continue;
    const raw = await readFile(candidate);
    const text = raw.toString("utf8");
    if (!text.includes(OBSIDIAN_MANAGED_START)) continue;
    try {
      const parsed = parseObsidianDocument(text);
      draftEntries.push({
        schema_version: 1,
        record_id: parsed.record_id,
        record_version: parsed.record_version,
        record_digest: parsed.record_digest,
        relative_path: candidate.slice(input.root.root.length + 1),
        managed_digest: parsed.managed_digest,
        preimage_digest: sha256Hex(text),
        postimage_digest: sha256Hex(text),
        action: "orphan",
        conflict_reason: null
      });
    } catch {
      // Not strictly owned (ambiguous markers); never guess. Leave untouched.
    }
  }

  draftEntries.sort((left, right) => (left.relative_path < right.relative_path ? -1 : 1));
  const entries = draftEntries.map((entry) => projectionEntrySchema.parse(entry));

  const preimage_digest = digestCanonicalJson({
    schema_version: 1,
    files: entries.map((entry) => ({
      path: entry.relative_path,
      action: entry.action,
      preimage: entry.preimage_digest
    }))
  });
  const postimage_digest = digestCanonicalJson({
    schema_version: 1,
    files: entries.map((entry) => ({
      path: entry.relative_path,
      action: entry.action,
      postimage: entry.postimage_digest
    }))
  });

  const maxPreviewBytes = input.maxPreviewBytes ?? DEFAULT_PREVIEW_BYTES;
  const lines: string[] = [];
  let truncated = false;
  for (const entry of entries) {
    const line = entry.action === "conflict"
      ? `conflict ${entry.relative_path} (${entry.conflict_reason})`
      : `${entry.action} ${entry.relative_path}`;
    const nextLength = lines.join("\n").length + line.length + 1;
    if (nextLength > maxPreviewBytes) {
      truncated = true;
      break;
    }
    lines.push(line);
  }
  const diff = truncated ? `${lines.join("\n")}\n... projection preview truncated ...\n` : `${lines.join("\n")}\n`;

  return { entries, preimage_digest, postimage_digest, diff, truncated };
}
