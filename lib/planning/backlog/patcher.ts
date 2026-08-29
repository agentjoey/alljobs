import "server-only";

import YAML from "yaml";
import { parseBacklogDocument } from "../markdown/backlog";
import type { BacklogItem } from "../domain/types";
import type { BacklogFieldChange } from "./ordering";

export type BacklogFieldPatch = BacklogFieldChange;

export type BacklogPatchResult =
  | {
      ok: true;
      content: string;
      changes: BacklogFieldChange[];
      ranges: Array<{ start: number; end: number }>;
    }
  | { ok: false; code: "FIELD_NOT_PATCHABLE" | "INVALID_BACKLOG" | "NOT_FOUND"; message: string };

type PatchOperation = { start: number; end: number; replacement: string };
type SourceSection = { id: string; yaml: string; yamlStart: number };
type BacklogPatchFailure = Extract<BacklogPatchResult, { ok: false }>;

const priorities = new Set(["P0", "P1", "P2"]);

function fail(code: BacklogPatchFailure["code"], message: string): BacklogPatchFailure {
  return { ok: false, code, message };
}

function parseSourceSections(source: string): SourceSection[] | BacklogPatchFailure {
  if (/^(<{7}|={7}|>{7})/m.test(source)) {
    return fail("INVALID_BACKLOG", "Backlog contains unresolved Git conflict markers.");
  }
  const headingPattern = /^##\s+([^\r\n]+)\r?$/gm;
  const headings: Array<{ id: string; start: number }> = [];
  const ids = new Set<string>();
  let heading: RegExpExecArray | null;
  while ((heading = headingPattern.exec(source)) !== null) {
    const headingText = heading[1].trim();
    const separator = headingText.indexOf(":");
    const id = (separator > 0 ? headingText.slice(0, separator) : headingText).trim();
    if (!id) return fail("INVALID_BACKLOG", "Backlog contains a section without an identifier.");
    if (ids.has(id)) return fail("INVALID_BACKLOG", `Backlog contains duplicate section ID "${id}".`);
    ids.add(id);
    headings.push({ id, start: heading.index });
  }
  if (headings.length === 0) return fail("INVALID_BACKLOG", "Backlog has no editable item sections.");

  const sections: SourceSection[] = [];
  const yamlPattern = /(```ya?ml(?:\s+alljobs)?\r?\n)([\s\S]*?)(\r?\n```)/g;
  for (let index = 0; index < headings.length; index += 1) {
    const current = headings[index];
    const end = headings[index + 1]?.start ?? source.length;
    const sectionSource = source.slice(current.start, end);
    const yamlMatches = [...sectionSource.matchAll(yamlPattern)];
    if (yamlMatches.length !== 1) {
      return fail("FIELD_NOT_PATCHABLE", `Backlog section "${current.id}" must contain exactly one block-style YAML metadata fence.`);
    }
    const match = yamlMatches[0];
    const yaml = match[2];
    const yamlStart = current.start + (match.index ?? 0) + match[1].length;
    sections.push({ id: current.id, yaml, yamlStart });
  }
  return sections;
}

function isFailure(value: SourceSection[] | BacklogPatchFailure): value is BacklogPatchFailure {
  return !Array.isArray(value);
}

function hasUnsupportedYamlFeatures(node: unknown): boolean {
  if (!node) return false;
  if (YAML.isAlias(node)) return true;
  if (typeof node === "object" && "anchor" in node && Boolean((node as { anchor?: unknown }).anchor)) return true;
  if (YAML.isMap(node)) {
    return node.items.some((pair) => hasUnsupportedYamlFeatures(pair.key) || hasUnsupportedYamlFeatures(pair.value));
  }
  if (YAML.isSeq(node)) return node.items.some((item) => hasUnsupportedYamlFeatures(item));
  return false;
}

function fieldPairs(section: SourceSection): Map<string, YAML.Pair<YAML.Node, YAML.Node | null>> | BacklogPatchFailure {
  const document = YAML.parseDocument(section.yaml, { keepSourceTokens: true, uniqueKeys: true, merge: false });
  if (document.errors.length > 0 || document.warnings.length > 0 || !YAML.isMap(document.contents)) {
    return fail("INVALID_BACKLOG", `Backlog section "${section.id}" contains invalid or non-map YAML.`);
  }
  if ((document.contents as { flow?: boolean }).flow || hasUnsupportedYamlFeatures(document.contents)) {
    return fail("FIELD_NOT_PATCHABLE", `Backlog section "${section.id}" uses unsupported YAML features.`);
  }

  const fields = new Map<string, YAML.Pair<YAML.Node, YAML.Node | null>>();
  for (const pair of document.contents.items) {
    if (!YAML.isScalar(pair.key) || typeof pair.key.value !== "string") {
      return fail("FIELD_NOT_PATCHABLE", `Backlog section "${section.id}" has a non-scalar metadata key.`);
    }
    const key = pair.key.value;
    if (key === "<<") return fail("FIELD_NOT_PATCHABLE", `Backlog section "${section.id}" uses a YAML merge key.`);
    if (fields.has(key)) return fail("FIELD_NOT_PATCHABLE", `Backlog section "${section.id}" has duplicate key "${key}".`);
    fields.set(key, pair);
  }
  return fields;
}

function isPatchFailure(value: Map<string, YAML.Pair<YAML.Node, YAML.Node | null>> | BacklogPatchFailure): value is BacklogPatchFailure {
  return !(value instanceof Map);
}

function scalarRange(pair: YAML.Pair<YAML.Node, YAML.Node | null>, field: string, section: SourceSection): [number, number] | BacklogPatchFailure {
  if (!YAML.isScalar(pair.value) || !pair.value.range || pair.value.range.length < 2) {
    return fail("FIELD_NOT_PATCHABLE", `Field "${field}" in section "${section.id}" must be a uniquely ranged scalar.`);
  }
  return [section.yamlStart + pair.value.range[0], section.yamlStart + pair.value.range[1]];
}

function scalarValue(pair: YAML.Pair<YAML.Node, YAML.Node | null>) {
  return YAML.isScalar(pair.value) ? pair.value.value : undefined;
}

function priorityToken(currentToken: string, priority: string) {
  if (currentToken.startsWith('"')) return `"${priority}"`;
  if (currentToken.startsWith("'")) return `'${priority}'`;
  return priority;
}

function validatePatches(patches: BacklogFieldPatch[]): BacklogPatchFailure | null {
  if (!Array.isArray(patches) || patches.length === 0) return fail("FIELD_NOT_PATCHABLE", "At least one field patch is required.");
  const ids = new Set<string>();
  for (const patch of patches as unknown as Array<Record<string, unknown>>) {
    if (Object.keys(patch).some((key) => key !== "itemId" && key !== "priority" && key !== "rank")) {
      return fail("FIELD_NOT_PATCHABLE", "Patch payload may contain only itemId, priority, and rank.");
    }
    if (typeof patch.itemId !== "string" || !patch.itemId || ids.has(patch.itemId)) {
      return fail("FIELD_NOT_PATCHABLE", "Each patch must name one unique Backlog item.");
    }
    if (typeof patch.priority !== "string" || !priorities.has(patch.priority)) {
      return fail("FIELD_NOT_PATCHABLE", "Patch priority must be P0, P1, or P2.");
    }
    if (patch.rank !== undefined && (!Number.isInteger(patch.rank) || (patch.rank as number) <= 0)) {
      return fail("FIELD_NOT_PATCHABLE", "Patch rank must be a positive integer when supplied.");
    }
    ids.add(patch.itemId);
  }
  return null;
}

function applyOperations(source: string, operations: PatchOperation[]) {
  let content = source;
  for (const operation of [...operations].sort((left, right) => right.start - left.start)) {
    content = `${content.slice(0, operation.start)}${operation.replacement}${content.slice(operation.end)}`;
  }
  return content;
}

function verifiesOutsideBytes(source: string, content: string, operations: PatchOperation[]) {
  const ordered = [...operations].sort((left, right) => left.start - right.start);
  let originalCursor = 0;
  let proposedCursor = 0;
  for (const operation of ordered) {
    const outsideLength = operation.start - originalCursor;
    if (source.slice(originalCursor, operation.start) !== content.slice(proposedCursor, proposedCursor + outsideLength)) return false;
    originalCursor = operation.end;
    proposedCursor += outsideLength + operation.replacement.length;
  }
  return source.slice(originalCursor) === content.slice(proposedCursor);
}

function stripOrdering(item: BacklogItem) {
  const { priority: _priority, rank: _rank, ...rest } = item;
  return rest;
}

function verifiesSemantics(source: string, content: string, patches: BacklogFieldPatch[]): BacklogPatchFailure | null {
  const original = parseBacklogDocument(source, "docs/BACKLOG.md");
  const proposed = parseBacklogDocument(content, "docs/BACKLOG.md");
  if (original.issues.length || proposed.issues.length || original.valid.length !== proposed.valid.length) {
    return fail("INVALID_BACKLOG", "Backlog structure is invalid before or after the exact field patch.");
  }
  const proposedById = new Map(proposed.valid.map((item) => [item.id, item]));
  const patchById = new Map(patches.map((patch) => [patch.itemId, patch]));
  for (const originalItem of original.valid) {
    const proposedItem = proposedById.get(originalItem.id);
    if (!proposedItem || JSON.stringify(stripOrdering(originalItem)) !== JSON.stringify(stripOrdering(proposedItem))) {
      return fail("INVALID_BACKLOG", `Backlog item "${originalItem.id}" changed outside priority/rank.`);
    }
    const patch = patchById.get(originalItem.id);
    if (!patch) {
      if (JSON.stringify(originalItem) !== JSON.stringify(proposedItem)) {
        return fail("INVALID_BACKLOG", `Unpatched Backlog item "${originalItem.id}" changed.`);
      }
      continue;
    }
    if (
      proposedItem.priority !== patch.priority ||
      (patch.rank !== undefined && proposedItem.rank !== patch.rank) ||
      (patch.rank === undefined && proposedItem.rank !== originalItem.rank)
    ) {
      return fail("INVALID_BACKLOG", `Patched Backlog item "${originalItem.id}" does not match its declared field change.`);
    }
  }
  return null;
}

export function patchBacklogFields(source: string, patches: BacklogFieldPatch[]): BacklogPatchResult {
  const patchValidation = validatePatches(patches);
  if (patchValidation) return patchValidation;
  const sections = parseSourceSections(source);
  if (isFailure(sections)) return sections;
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const operations: PatchOperation[] = [];

  for (const patch of patches) {
    const section = sectionById.get(patch.itemId);
    if (!section) return fail("NOT_FOUND", `Backlog item "${patch.itemId}" was not found.`);
    const fields = fieldPairs(section);
    if (isPatchFailure(fields)) return fields;
    const priority = fields.get("priority");
    if (!priority || !priorities.has(String(scalarValue(priority)))) {
      return fail("FIELD_NOT_PATCHABLE", `Backlog item "${patch.itemId}" has no patchable priority scalar.`);
    }
    const priorityRange = scalarRange(priority, "priority", section);
    if (Array.isArray(priorityRange) === false) return priorityRange;
    const currentPriorityToken = source.slice(priorityRange[0], priorityRange[1]);
    operations.push({ start: priorityRange[0], end: priorityRange[1], replacement: priorityToken(currentPriorityToken, patch.priority) });

    if (patch.rank === undefined) continue;
    const rank = fields.get("rank");
    if (rank) {
      const rankRange = scalarRange(rank, "rank", section);
      if (Array.isArray(rankRange) === false) return rankRange;
      if (!Number.isInteger(scalarValue(rank)) || (scalarValue(rank) as number) <= 0) {
        return fail("FIELD_NOT_PATCHABLE", `Backlog item "${patch.itemId}" has no patchable positive integer rank scalar.`);
      }
      operations.push({ start: rankRange[0], end: rankRange[1], replacement: String(patch.rank) });
      continue;
    }

    const priorityLineStart = source.lastIndexOf("\n", priorityRange[1] - 1) + 1;
    const priorityLineEnd = source.indexOf("\n", priorityRange[1]);
    if (priorityLineEnd < 0) return fail("FIELD_NOT_PATCHABLE", `Backlog item "${patch.itemId}" priority line has no safe insertion point.`);
    const indentation = /^\s*/.exec(source.slice(priorityLineStart, priorityRange[0]))?.[0] ?? "";
    const eol = source[priorityLineEnd - 1] === "\r" ? "\r\n" : "\n";
    operations.push({ start: priorityLineEnd + 1, end: priorityLineEnd + 1, replacement: `${indentation}rank: ${patch.rank}${eol}` });
  }

  const ordered = [...operations].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].end > ordered[index].start) return fail("FIELD_NOT_PATCHABLE", "Patch ranges overlap.");
  }
  const content = applyOperations(source, operations);
  if (!verifiesOutsideBytes(source, content, operations)) return fail("FIELD_NOT_PATCHABLE", "Patch changed bytes outside declared scalar ranges.");
  const semanticFailure = verifiesSemantics(source, content, patches);
  if (semanticFailure) return semanticFailure;

  return {
    ok: true,
    content,
    changes: patches,
    ranges: ordered.map(({ start, end }) => ({ start, end }))
  };
}
