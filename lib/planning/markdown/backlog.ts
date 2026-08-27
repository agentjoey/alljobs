import { backlogItemSchema } from "../domain/schemas";
import type { BacklogItem, ProofIssue, ValidationResult } from "../domain/types";
import { parseSectionDocument } from "./section-document";

export function parseBacklogDocument(
  source: string,
  sourcePath = ""
): ValidationResult<BacklogItem> {
  const { sections, issues } = parseSectionDocument<any>(source, sourcePath);
  const valid: BacklogItem[] = [];

  for (const s of sections) {
    const rawData = {
      ...s.metadata,
      id: s.id,
      title: s.title,
      body: s.body
    };

    const parsed = backlogItemSchema.safeParse(rawData);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      for (const err of parsed.error.issues) {
        issues.push({
          scope: "object",
          code: "INVALID_BACKLOG_ITEM_SCHEMA",
          sourcePath,
          objectId: s.id,
          field: err.path.join("."),
          message: `${err.message} on backlog item "${s.id}"`
        });
      }
    }
  }

  return {
    valid,
    issues
  };
}
