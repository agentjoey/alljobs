import { z } from "zod";
import { decodeAssistantEvent } from "@/lib/assistant/stream";
import type { AssistantMode, AssistantStreamEvent } from "@/lib/assistant/contracts";

const MAX_SESSION_BYTES = 16_000;
const storedSessionSchema = z.object({
  mode: z.enum(["standard", "deep"]),
  currentRun: z.object({
    directAnswer: z.string().max(12_000),
    manifestDigest: z.string().regex(/^[a-f0-9]{64}$/)
  }).strict().optional()
}).strict();

export type AssistantStoredSession = z.infer<typeof storedSessionSchema>;

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function sessionKey(projectSlug: string): string {
  return `alljobs:r2-assistant:v1:${projectSlug}`;
}

export function readAssistantSession(projectSlug: string, storage: SessionStorageLike): AssistantStoredSession | null {
  const raw = storage.getItem(sessionKey(projectSlug));
  if (!raw || raw.length > MAX_SESSION_BYTES) return null;
  try {
    return storedSessionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeAssistantSession(projectSlug: string, value: AssistantStoredSession, storage: SessionStorageLike): void {
  const serialized = JSON.stringify(storedSessionSchema.parse(value));
  if (serialized.length <= MAX_SESSION_BYTES) storage.setItem(sessionKey(projectSlug), serialized);
}

export interface ParsedAssistantNdjson {
  events: AssistantStreamEvent[];
  incomplete: boolean;
}

/** Parses complete transport lines only. A run is actionable only after a terminal outcome. */
export function parseAssistantNdjson(body: string): ParsedAssistantNdjson {
  const events = body
    .split("\n")
    .filter(Boolean)
    .map((line) => decodeAssistantEvent(line));
  const hasTerminalOutcome = events.some((event) => event.type === "assistant_complete" || event.type === "task_draft" || event.type === "backlog_proposal" || event.type === "assistant_error");
  return { events, incomplete: !hasTerminalOutcome };
}

export function defaultAssistantMode(value: AssistantStoredSession | null): AssistantMode {
  return value?.mode ?? "standard";
}
