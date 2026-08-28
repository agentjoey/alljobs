import YAML from "yaml";
import type { ProofIssue } from "../domain/types";

export interface ParsedSection<T = Record<string, unknown>> {
  id: string;
  title: string;
  metadata: T;
  body: string;
  rawYaml: string;
  startOffset: number;
  endOffset: number;
}

export interface DocumentParseResult<T> {
  sections: ParsedSection<T>[];
  preamble: string;
  issues: ProofIssue[];
}

/**
 * Splits a markdown document into sections based on `## ` headings.
 * Looks for the first fenced yaml block (```yaml [alljobs] ... ```) in each section.
 */
export function parseSectionDocument<T = Record<string, unknown>>(
  source: string,
  sourcePath = ""
): DocumentParseResult<T> {
  const issues: ProofIssue[] = [];
  const sections: ParsedSection<T>[] = [];

  // Normalize line endings to LF for parsing
  const isCrlf = source.includes("\r\n");
  const normalizedSource = source.replace(/\r\n/g, "\n");

  // Regex to find level-2 headings: `^## ` (multiline)
  const headingRegex = /^##\s+([^\n]+)$/gm;
  const matches: { headingText: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(normalizedSource)) !== null) {
    matches.push({ headingText: match[1].trim(), index: match.index });
  }

  if (matches.length === 0) {
    return {
      sections: [],
      preamble: source,
      issues
    };
  }

  const preamble = normalizedSource.slice(0, matches[0].index);
  const seenIds = new Set<string>();

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextIndex = i + 1 < matches.length ? matches[i + 1].index : normalizedSource.length;
    const sectionContent = normalizedSource.slice(current.index, nextIndex);
    const startOffset = current.index;
    const endOffset = nextIndex;

    // Heading format: `## ID: Title` or `## Title`
    let id = "";
    let title = current.headingText;
    const colonIdx = current.headingText.indexOf(":");
    if (colonIdx > 0) {
      id = current.headingText.slice(0, colonIdx).trim();
      title = current.headingText.slice(colonIdx + 1).trim();
    }

    // Find first yaml code block: ```yaml ... ``` or ```yaml alljobs ... ```
    const yamlBlockRegex = /```ya?ml(?:\s+alljobs)?\n([\s\S]*?)\n```/;
    const yamlMatch = yamlBlockRegex.exec(sectionContent);

    let metadata: any = {};
    let rawYaml = "";
    let body = sectionContent;

    if (yamlMatch) {
      rawYaml = yamlMatch[1];
      try {
        metadata = YAML.parse(rawYaml) || {};
      } catch (err: any) {
        issues.push({
          scope: "object",
          code: "MALFORMED_YAML",
          sourcePath,
          objectId: id || title,
          message: `Malformed YAML in section "${current.headingText}": ${err.message}`
        });
        continue;
      }

      // If id is in metadata, prefer metadata id or ensure match
      if (metadata.id) {
        if (!id) {
          id = String(metadata.id);
        }
      }
      if (metadata.title && !title) {
        title = String(metadata.title);
      }

      // Body is everything after the yaml block
      const yamlEndPos = yamlMatch.index + yamlMatch[0].length;
      body = sectionContent.slice(yamlEndPos).trim();
    } else {
      // Missing YAML block
      issues.push({
        scope: "object",
        code: "MISSING_METADATA_BLOCK",
        sourcePath,
        objectId: id || title,
        message: `Missing yaml code block in section "${current.headingText}"`
      });
      continue;
    }

    if (!id) {
      id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    }

    if (seenIds.has(id)) {
      issues.push({
        scope: "object",
        code: "DUPLICATE_SECTION_ID",
        sourcePath,
        objectId: id,
        message: `Duplicate section ID "${id}" in "${sourcePath}"`
      });
      continue;
    }
    seenIds.add(id);

    sections.push({
      id,
      title,
      metadata: { ...metadata, id, title },
      body,
      rawYaml,
      startOffset,
      endOffset
    });
  }

  return {
    sections,
    preamble,
    issues
  };
}

/**
 * Replaces a section in the source document by target ID.
 * Preserves all surrounding bytes.
 */
export function replaceSection(
  source: string,
  targetId: string,
  renderedReplacement: string
): string {
  // parseSectionDocument computes offsets on LF-normalized text, so the
  // original source must be normalized before slicing or CRLF documents
  // drift by one byte per preceding line ending.
  const normalizedSource = source.replace(/\r\n/g, "\n");
  const parsed = parseSectionDocument(normalizedSource);
  const target = parsed.sections.find(s => s.id === targetId);
  if (!target) {
    throw new Error(`Section "${targetId}" not found in document`);
  }

  const before = normalizedSource.slice(0, target.startOffset);
  const after = normalizedSource.slice(target.endOffset);
  const trimmedReplacement = renderedReplacement.trimEnd();

  return `${before}${trimmedReplacement}\n\n${after.trimStart()}`;
}

/**
 * Appends a new section to the document, ensuring clean newline spacing.
 */
export function appendSection(
  source: string,
  renderedSection: string
): string {
  const trimmedSource = source.trimEnd();
  const trimmedSection = renderedSection.trim();
  if (!trimmedSource) {
    return `${trimmedSection}\n`;
  }
  return `${trimmedSource}\n\n${trimmedSection}\n`;
}
