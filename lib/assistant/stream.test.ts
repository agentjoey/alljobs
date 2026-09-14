import { describe, expect, it } from "vitest";
import { decodeAssistantEvent, encodeAssistantEvent } from "./stream";

describe("assistant NDJSON stream", () => {
  it("encodes one strict event per newline and decodes it without accepting unknown fields", () => {
    const encoded = encodeAssistantEvent({ type: "run_status", stage: "preparing" });

    expect(new TextDecoder().decode(encoded)).toBe('{"type":"run_status","stage":"preparing"}\n');
    expect(decodeAssistantEvent('{"type":"run_status","stage":"preparing"}')).toEqual({
      type: "run_status",
      stage: "preparing"
    });
    expect(() => decodeAssistantEvent('{"type":"run_status","stage":"preparing","leak":true}')).toThrow();
  });

  it("rejects a model-shaped Backlog recommendation at the browser stream boundary", () => {
    expect(() => decodeAssistantEvent(JSON.stringify({
      type: "assistant_complete",
      stale: false,
      outcome: {
        kind: "management_answer",
        direct_answer: "Record this in Backlog.",
        confirmed_facts: [],
        inferences: [],
        unknowns: [],
        questions: [],
        recommendations: [{
          id: "backlog-candidate",
          title: "Record boundary evidence",
          rationale: "Keep reviewed evidence visible.",
          candidate_kind: "backlog"
        }],
        citations: []
      }
    }))).toThrow();
  });
});
