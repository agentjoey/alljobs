import { describe, expect, it } from "vitest";
import { parseAssistantNdjson, readAssistantSession, sessionKey, writeAssistantSession } from "./assistant-session";

const DIGEST = "a".repeat(64);

describe("assistant session", () => {
  it("uses a project-scoped storage key and preserves only the current visible run and mode", () => {
    const storage = new Map<string, string>();
    const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) };
    writeAssistantSession("sample-code", { mode: "deep", currentRun: { directAnswer: "Visible answer", manifestDigest: DIGEST } }, adapter);

    expect(sessionKey("sample-code")).toBe("alljobs:r2-assistant:v1:sample-code");
    expect(readAssistantSession("sample-code", adapter)).toEqual({ mode: "deep", currentRun: { directAnswer: "Visible answer", manifestDigest: DIGEST } });
    expect(storage.get(sessionKey("sample-code"))).not.toContain("reasoning");
    expect(storage.get(sessionKey("sample-code"))).not.toContain("source_fragment");
  });

  it("rejects malformed, oversized, or authority-bearing stored data", () => {
    const key = sessionKey("sample-code");
    const items = new Map<string, string>([
      [key, "not-json"],
      [sessionKey("oversized"), "x".repeat(16_001)],
      [sessionKey("unsafe"), JSON.stringify({ mode: "standard", currentRun: { directAnswer: "x", manifestDigest: DIGEST }, gate_id: "secret" })]
    ]);
    const storage = { getItem: (name: string) => items.get(name) ?? null, setItem: () => undefined };

    expect(readAssistantSession("sample-code", storage)).toBeNull();
    expect(readAssistantSession("oversized", storage)).toBeNull();
    expect(readAssistantSession("unsafe", storage)).toBeNull();
  });

  it("parses strict complete NDJSON lines and marks a truncated run incomplete", () => {
    expect(parseAssistantNdjson('{"type":"run_status","stage":"preparing"}\n')).toEqual({ events: [{ type: "run_status", stage: "preparing" }], incomplete: true });
    expect(parseAssistantNdjson('{"type":"assistant_error","code":"STALE_CONTEXT","message":"Refresh"}\n')).toEqual({
      events: [{ type: "assistant_error", code: "STALE_CONTEXT", message: "Refresh" }],
      incomplete: false
    });
  });

  it("recognizes the service's terminal outcome even when its final status line follows it", () => {
    expect(parseAssistantNdjson('{"type":"assistant_complete","stale":false,"outcome":{"kind":"management_answer","direct_answer":"Ready.","confirmed_facts":[],"inferences":[],"unknowns":[],"questions":[],"recommendations":[],"citations":[]}}\n{"type":"run_status","stage":"complete"}\n').incomplete).toBe(false);
  });
});
