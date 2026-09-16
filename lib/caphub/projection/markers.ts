import { sha256Hex } from "../packages/digest";

export const OBSIDIAN_MANAGED_START = "<!-- caphub:managed:start -->";
export const OBSIDIAN_MANAGED_END = "<!-- caphub:managed:end -->";
export const OBSIDIAN_HUMAN_START = "<!-- caphub:human:start -->";
export const OBSIDIAN_HUMAN_END = "<!-- caphub:human:end -->";

export const DEFAULT_HUMAN_CONTENT = [
  "## 我的判断",
  "",
  "## 使用经验",
  "",
  "## 可以组合的能力",
  "",
  "## 后续想法",
  ""
].join("\n");

export class ProjectionParseError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ProjectionParseError";
  }
}

export interface ParsedObsidianDocument {
  record_id: string;
  record_version: number;
  record_digest: string;
  managed_digest: string;
  managed_markdown: string;
  human_content: string;
  human_byte_start: number;
  human_byte_end: number;
  human_headings: string[];
}

const REQUIRED_FRONTMATTER_KEYS = [
  "caphub_schema",
  "caphub_record_id",
  "caphub_record_version",
  "caphub_record_digest",
  "caphub_managed_digest"
] as const;

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function parseFrontmatter(raw: string): {
  record_id: string;
  record_version: number;
  record_digest: string;
  managed_digest: string;
  length: number;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new ProjectionParseError("malformed Caphub frontmatter");
  const body = match[1];
  if (body.includes("\r")) throw new ProjectionParseError("unsafe line ending in frontmatter");
  const lines = body.split("\n");
  if (lines.length !== REQUIRED_FRONTMATTER_KEYS.length) {
    throw new ProjectionParseError("Caphub frontmatter must contain exactly the five system properties");
  }
  const values = new Map<string, string>();
  lines.forEach((line, index) => {
    const key = REQUIRED_FRONTMATTER_KEYS[index];
    const separator = line.indexOf(": ");
    if (separator === -1 || line.slice(0, separator) !== key) {
      throw new ProjectionParseError(`unexpected frontmatter key at line ${index + 1}; expected ${key}`);
    }
    const value = line.slice(separator + 2);
    if (values.has(key)) throw new ProjectionParseError(`duplicate frontmatter key ${key}`);
    values.set(key, value);
  });
  const recordId = values.get("caphub_record_id") ?? "";
  const recordVersion = values.get("caphub_record_version") ?? "";
  const recordDigest = values.get("caphub_record_digest") ?? "";
  const managedDigest = values.get("caphub_managed_digest") ?? "";
  if (values.get("caphub_schema") !== "1") throw new ProjectionParseError("unsupported caphub_schema");
  if (!/^rel_[a-f0-9]{32}$/.test(recordId)) {
    throw new ProjectionParseError("caphub_record_id is not a valid Release record ID");
  }
  if (!/^\d+$/.test(recordVersion) || Number.parseInt(recordVersion, 10) <= 0) {
    throw new ProjectionParseError("caphub_record_version is not a positive integer");
  }
  for (const [label, digest] of [["caphub_record_digest", recordDigest], ["caphub_managed_digest", managedDigest]]) {
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      throw new ProjectionParseError(`${label} is not a lowercase SHA-256 digest`);
    }
  }
  return {
    record_id: recordId,
    record_version: Number.parseInt(recordVersion, 10),
    record_digest: recordDigest,
    managed_digest: managedDigest,
    length: match[0].length
  };
}

export function parseObsidianDocument(raw: string): ParsedObsidianDocument {
  if (raw.startsWith("﻿")) {
    throw new ProjectionParseError("Caphub documents must not start with a BOM");
  }
  const frontmatter = parseFrontmatter(raw);
  const remainder = raw.slice(frontmatter.length);

  for (const marker of [OBSIDIAN_MANAGED_START, OBSIDIAN_MANAGED_END, OBSIDIAN_HUMAN_START, OBSIDIAN_HUMAN_END]) {
    if (countOccurrences(remainder, marker) !== 1) {
      throw new ProjectionParseError(`expected exactly one ${marker} marker`);
    }
  }

  if (!remainder.startsWith(`${OBSIDIAN_MANAGED_START}\n`)) {
    throw new ProjectionParseError("managed region must immediately follow the frontmatter");
  }
  let position = OBSIDIAN_MANAGED_START.length + 1;
  const managedEndAt = remainder.indexOf(`\n${OBSIDIAN_MANAGED_END}`, position);
  if (managedEndAt === -1) throw new ProjectionParseError("managed region is not closed");
  const managedMarkdown = remainder.slice(position, managedEndAt);

  position = managedEndAt + 1 + OBSIDIAN_MANAGED_END.length;
  if (!remainder.startsWith(`\n${OBSIDIAN_HUMAN_START}\n`, position)) {
    throw new ProjectionParseError("human region must immediately follow the managed region");
  }
  position += 1 + OBSIDIAN_HUMAN_START.length + 1;
  const humanStartIndex = position;
  const humanEndAt = remainder.indexOf(OBSIDIAN_HUMAN_END, position);
  if (humanEndAt === -1) throw new ProjectionParseError("human region is not closed");
  const humanContent = remainder.slice(position, humanEndAt);
  position = humanEndAt + OBSIDIAN_HUMAN_END.length;
  if (remainder.slice(position) !== "\n") {
    throw new ProjectionParseError("unexpected content after the human end marker");
  }

  const outsideHuman = remainder.slice(0, humanStartIndex) + remainder.slice(humanEndAt);
  if (outsideHuman.includes("\r")) {
    throw new ProjectionParseError("unsafe carriage return outside the human region");
  }

  const humanByteStart = byteLength(raw.slice(0, frontmatter.length + humanStartIndex));
  const headings: string[] = [];
  for (const match of humanContent.matchAll(/^##\s+(.+)$/gm)) {
    headings.push(match[1].trim());
  }

  return {
    record_id: frontmatter.record_id,
    record_version: frontmatter.record_version,
    record_digest: frontmatter.record_digest,
    managed_digest: frontmatter.managed_digest,
    managed_markdown: managedMarkdown,
    human_content: humanContent,
    human_byte_start: humanByteStart,
    human_byte_end: humanByteStart + byteLength(humanContent),
    human_headings: headings
  };
}
