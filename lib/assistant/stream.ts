import { assistantStreamEventSchema, type AssistantStreamEvent } from "./contracts";

const encoder = new TextEncoder();

/** Serializes exactly one validated, browser-safe event as one NDJSON line. */
export function encodeAssistantEvent(event: AssistantStreamEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(assistantStreamEventSchema.parse(event))}\n`);
}

/** Parses one complete NDJSON line. Consumers must buffer partial transport chunks first. */
export function decodeAssistantEvent(line: string): AssistantStreamEvent {
  return assistantStreamEventSchema.parse(JSON.parse(line));
}
