import { describe, expect, it } from "vitest";
import type { DeepSeekStageAdapter } from "./deepseek";
import { DeepSeekProvider } from "./deepseek";

const signal = new AbortController().signal;

function adapter(output: unknown): DeepSeekStageAdapter {
  return {
    async generate() {
      return { output, usage: { inputTokens: 3, outputTokens: 2 } };
    }
  };
}

describe("DeepSeekProvider", () => {
  it("uses DeepSeek only for research and assessment while preserving provider-neutral output", async () => {
    const provider = new DeepSeekProvider({ adapter: adapter({ schema_version: 1, answer: "same" }) });
    const input = {
      kind: "initial" as const,
      stage: "assessment" as const,
      inputDigest: "a".repeat(64),
      input: { evidence: [] },
      signal
    };

    await expect(provider.invoke(input)).resolves.toEqual({
      value: { schema_version: 1, answer: "same" },
      usage: { inputTokens: 3, outputTokens: 2 }
    });
    expect(provider.provider).toBe("deepseek");
    expect(provider.model).toBe("deepseek-flash");
  });

  it("rejects extraction and critic stage requests", async () => {
    const provider = new DeepSeekProvider({ adapter: adapter({}) });
    await expect(provider.invoke({
      kind: "initial",
      stage: "critic",
      inputDigest: "a".repeat(64),
      input: {},
      signal
    })).rejects.toMatchObject({ code: "PERMISSION" });
  });

  it("offers the active research and assessment worker methods", async () => {
    const provider = new DeepSeekProvider({ adapter: adapter({ schema_version: 1 }) });
    await expect(provider.research({}, { inputDigest: "d".repeat(64), signal })).resolves.toMatchObject({
      usage: { inputTokens: 3, outputTokens: 2 }
    });
    await expect(provider.assess({}, { inputDigest: "e".repeat(64), signal })).resolves.toMatchObject({
      usage: { inputTokens: 3, outputTokens: 2 }
    });
  });

  it("keeps correction requests source-free while carrying only validation paths", async () => {
    const prompts: string[] = [];
    const provider = new DeepSeekProvider({
      adapter: {
        async generate(request) {
          prompts.push(request.prompt);
          return { output: {}, usage: { inputTokens: 1, outputTokens: 1 } };
        }
      }
    });

    await provider.invoke({
      kind: "correction",
      stage: "research",
      inputDigest: "c".repeat(64),
      correction: { originalInputDigest: "c".repeat(64), validationIssuePaths: ["identity.status"] },
      signal
    });

    expect(prompts[0]).toContain("prompt_version=caphub-deepseek-v1");
    expect(prompts[0]).toContain("identity.status");
    expect(prompts[0]).not.toMatch(/untrusted_source|credential|response/i);
  });
});
