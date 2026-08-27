import { taskSchema } from "../domain/schemas";
import type { ProofIssue, Task, ValidationResult } from "../domain/types";
import { parseSectionDocument } from "./section-document";

export function parseTasksDocument(
  source: string,
  sourcePath = "",
  defaultProject = ""
): ValidationResult<Task> {
  const { sections, issues } = parseSectionDocument<any>(source, sourcePath);
  const valid: Task[] = [];

  for (const s of sections) {
    const rawData = {
      ...s.metadata,
      id: s.id,
      title: s.title,
      project: s.metadata.project || defaultProject,
      due: s.metadata.due || s.metadata.target
    };

    const parsed = taskSchema.safeParse(rawData);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      for (const err of parsed.error.issues) {
        issues.push({
          scope: "object",
          code: "INVALID_TASK_SCHEMA",
          sourcePath,
          objectId: s.id,
          field: err.path.join("."),
          message: `${err.message} on task "${s.id}"`
        });
      }
    }
  }

  return {
    valid,
    issues
  };
}
