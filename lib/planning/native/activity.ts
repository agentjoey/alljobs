import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assistantRunRecordSchema, type AssistantRunRecord } from "../../assistant/contracts";
import { getLogDir } from "../paths";

export const BACKLOG_ORDERING_APPLIED = "BACKLOG_ORDERING_APPLIED";
export const ASSISTANT_RUN = "ASSISTANT_RUN";

export interface ActivityEvent {
  timestamp?: string;
  type: string;
  project: string;
  details?: Record<string, unknown>;
}

export async function recordActivity(event: ActivityEvent, root?: string): Promise<void> {
  const logDir = getLogDir(root);
  const logFile = resolve(logDir, "activity.jsonl");

  const entry = {
    timestamp: event.timestamp || new Date().toISOString(),
    type: event.type,
    project: event.project,
    details: event.details || {}
  };

  await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
}

/** Records only the strict operational receipt; callers must never pass model or source bodies. */
export async function recordAssistantRun(run: AssistantRunRecord, root?: string): Promise<void> {
  const receipt = assistantRunRecordSchema.parse(run);
  await recordActivity({ type: ASSISTANT_RUN, project: receipt.project, details: receipt }, root);
}
