import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getLogDir } from "../paths";

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
