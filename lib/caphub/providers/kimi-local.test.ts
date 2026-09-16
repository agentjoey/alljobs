import { describe, expect, it } from "vitest";
import { KimiLocalAdapter } from "./kimi-local";

describe("KimiLocalAdapter", () => {
  it("returns provider-neutral metadata and always cleans the temporary root", async () => {
    let cleaned = false;
    const adapter = new KimiLocalAdapter({
      run: async () => ({
        terminalText: '{"answer":"same"}',
        eventCount: 3,
        stdoutBytes: 80,
        stderrBytes: 0,
        usage: { inputTokens: 7, outputTokens: 3 },
        cleanup: async () => { cleaned = true; }
      })
    });

    const result = await adapter.generate({
      stage: "research",
      prompt: "fixture",
      schema: undefined,
      maxOutputTokens: 100,
      signal: new AbortController().signal
    });

    expect(result).toEqual({ output: { answer: "same" }, usage: { inputTokens: 7, outputTokens: 3 } });
    expect(cleaned).toBe(true);
  });

  it("cleans the temporary root after malformed output", async () => {
    let cleaned = false;
    const adapter = new KimiLocalAdapter({
      run: async () => ({
        terminalText: "not-json",
        eventCount: 1,
        stdoutBytes: 8,
        stderrBytes: 0,
        usage: { inputTokens: 1, outputTokens: 1 },
        cleanup: async () => { cleaned = true; }
      })
    });
    await expect(adapter.generate({
      stage: "research",
      prompt: "fixture",
      schema: undefined,
      maxOutputTokens: 100,
      signal: new AbortController().signal
    })).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    expect(cleaned).toBe(true);
  });
});
