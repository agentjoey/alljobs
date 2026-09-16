import { digestCanonicalJson } from "../analysis/digest";
import type { PackageFile } from "./types";

export const DIFF_LIMITS = {
  maxFiles: 64,
  maxBytes: 256 * 1024,
  maxLinesPerFile: 200
} as const;

export interface DiffEntry {
  path: string;
  action: "create" | "update" | "delete";
  before_sha256: string | null;
  after_sha256: string | null;
  hunks: string;
}

export interface PackageDiff {
  entries: DiffEntry[];
  digest: string;
  truncated: boolean;
}

export interface PackageDiffOptions {
  baseFiles: PackageFile[] | null;
  nextFiles: PackageFile[];
  maxFiles?: number;
  maxBytes?: number;
  maxLinesPerFile?: number;
  redactRoots?: readonly string[];
}

function splitLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
  return normalized.length === 0 ? [] : normalized.split("\n");
}

function redact(text: string, roots: readonly string[]): string {
  let output = text;
  const sorted = roots.slice().sort((left, right) => right.length - left.length);
  for (const root of sorted) {
    if (root.length === 0) continue;
    output = output.split(root).join("<redacted-root>");
  }
  return output;
}

function unifiedHunks(path: string, before: PackageFile, after: PackageFile, maxLines: number): string {
  const oldLines = splitLines(before.content);
  const newLines = splitLines(after.content);
  const body: string[] = [];
  body.push(`--- a/${path}`);
  body.push(`+++ b/${path}`);
  body.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
  let emitted = 0;
  for (const line of oldLines) {
    if (emitted >= maxLines) {
      body.push("... diff truncated ...");
      return body.join("\n");
    }
    body.push(`-${line}`);
    emitted += 1;
  }
  for (const line of newLines) {
    if (emitted >= maxLines) {
      body.push("... diff truncated ...");
      return body.join("\n");
    }
    body.push(`+${line}`);
    emitted += 1;
  }
  return body.join("\n");
}

export function diffPackageFiles(options: PackageDiffOptions): PackageDiff {
  const maxFiles = options.maxFiles ?? DIFF_LIMITS.maxFiles;
  const maxBytes = options.maxBytes ?? DIFF_LIMITS.maxBytes;
  const maxLinesPerFile = options.maxLinesPerFile ?? DIFF_LIMITS.maxLinesPerFile;
  const redactRoots = options.redactRoots ?? [];

  const baseByPath = new Map((options.baseFiles ?? []).map((file) => [file.path, file]));
  const nextByPath = new Map(options.nextFiles.map((file) => [file.path, file]));
  const paths = new Set([...baseByPath.keys(), ...nextByPath.keys()]);

  const entries: DiffEntry[] = [];
  let truncated = false;
  let bytesUsed = 0;

  for (const path of [...paths].sort()) {
    const before = baseByPath.get(path) ?? null;
    const after = nextByPath.get(path) ?? null;
    if (before && after && before.sha256 === after.sha256) continue;

    let action: DiffEntry["action"];
    let hunks = "";
    if (before && after) {
      action = "update";
      hunks = unifiedHunks(path, before, after, maxLinesPerFile);
    } else if (after) {
      action = "create";
    } else {
      action = "delete";
    }
    hunks = redact(hunks, redactRoots);

    if (entries.length >= maxFiles || bytesUsed + hunks.length > maxBytes) {
      truncated = true;
      continue;
    }
    bytesUsed += hunks.length + path.length;
    entries.push({
      path,
      action,
      before_sha256: before?.sha256 ?? null,
      after_sha256: after?.sha256 ?? null,
      hunks
    });
  }

  return {
    entries,
    truncated,
    digest: digestCanonicalJson({
      schema_version: 1,
      entries: entries.map((entry) => ({
        path: entry.path,
        action: entry.action,
        before_sha256: entry.before_sha256,
        after_sha256: entry.after_sha256,
        hunks: entry.hunks
      }))
    })
  };
}
