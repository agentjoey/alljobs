import { describe, expect, it } from "vitest";
import { ASSISTANT_LIMITS } from "../assistant/limits";
import { controlHostAssistantConfigSchema, controlHostConfigSchema } from "./config";

describe("control host assistant config", () => {
  it("parses a valid enabled assistant config with fixed provider and model", () => {
    const parsed = controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M3" }
    });
    expect(parsed.assistant?.model).toBe("MiniMax-M3");
    expect(parsed.assistant?.provider).toBe("minimax");
    expect(parsed.assistant?.enabled).toBe(true);
  });

  it("defaults standard and deep limits to the fixed server limits", () => {
    const parsed = controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M3" }
    });
    expect(parsed.assistant?.standard).toEqual(ASSISTANT_LIMITS.standard);
    expect(parsed.assistant?.deep).toEqual(ASSISTANT_LIMITS.deep);
  });

  it("leaves assistant undefined when omitted", () => {
    const parsed = controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"] });
    expect(parsed.assistant).toBeUndefined();
  });

  it("rejects a non-minimax provider", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "openai", model: "MiniMax-M3" }
    })).toThrow();
  });

  it("rejects a model other than MiniMax-M3", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M2" }
    })).toThrow();
  });

  it("rejects an api_key field (no credential field exists)", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M3", api_key: "sk-secret" }
    })).toThrow();
  });

  it("rejects unknown assistant keys", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M3", system_prompt: "override" }
    })).toThrow();
  });

  it("accepts an explicitly disabled assistant", () => {
    const parsed = controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: false }
    });
    expect(parsed.assistant?.enabled).toBe(false);
  });

  it("parses the standalone assistant config schema with fixed limits", () => {
    const parsed = controlHostAssistantConfigSchema.parse({
      enabled: false,
      provider: "minimax",
      model: "MiniMax-M3",
      standard: {
        contextBytes: 256 * 1024,
        outputTokens: 4096,
        sourceFiles: 6,
        sourceBytes: 192 * 1024,
        toolCalls: 4
      },
      deep: {
        contextBytes: 512 * 1024,
        outputTokens: 8192,
        sourceFiles: 12,
        sourceBytes: 384 * 1024,
        toolCalls: 8
      }
    });
    expect(parsed.standard.contextBytes).toBe(256 * 1024);
  });
});
