import { roadmapItemSchema } from "../domain/schemas";
import type { ProofIssue, RoadmapItem, ValidationResult } from "../domain/types";
import { parseSectionDocument } from "./section-document";

export function parseRoadmapDocument(
  source: string,
  sourcePath = "",
  expectedKind: "phase" | "milestone" = "phase"
): ValidationResult<RoadmapItem> {
  const { sections, issues } = parseSectionDocument<any>(source, sourcePath);
  const valid: RoadmapItem[] = [];

  for (const s of sections) {
    const rawData = {
      ...s.metadata,
      id: s.id,
      title: s.title,
      kind: s.metadata.kind || expectedKind,
      summary: s.body || s.metadata.summary
    };

    const parsed = roadmapItemSchema.safeParse(rawData);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      for (const err of parsed.error.issues) {
        issues.push({
          scope: "object",
          code: "INVALID_ROADMAP_ITEM_SCHEMA",
          sourcePath,
          objectId: s.id,
          field: err.path.join("."),
          message: `${err.message} on roadmap item "${s.id}"`
        });
      }
    }
  }

  return {
    valid,
    issues
  };
}
