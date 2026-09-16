import { describe, expect, it } from "vitest";
import type { KimiStageAdapter } from "./kimi";
import { KimiProvider } from "./kimi";

const signal = new AbortController().signal;

function adapter(output: unknown): KimiStageAdapter {
  return {
    async generate() {
      return { output, usage: { inputTokens: 3, outputTokens: 2 } };
    }
  };
}

describe("KimiProvider", () => {
  it("returns the same provider-neutral shape in API and local-login modes", async () => {
    const expected = { schema_version: 1, answer: "same" };
    const input = {
      kind: "initial" as const,
      stage: "assessment" as const,
      inputDigest: "a".repeat(64),
      input: { evidence: [] },
      signal
    };

    const apiResult = await new KimiProvider({ mode: "api_key", adapter: adapter(expected) }).invoke(input);
    const localResult = await new KimiProvider({ mode: "local_login", adapter: adapter(expected) }).invoke(input);

    expect(apiResult).toEqual(localResult);
    expect(apiResult).toEqual({ value: expected, usage: { inputTokens: 3, outputTokens: 2 } });
  });

  it("permits only research and assessment stages", async () => {
    const provider = new KimiProvider({ mode: "api_key", adapter: adapter({}) });
    await expect(provider.invoke({
      kind: "initial",
      stage: "critic",
      inputDigest: "a".repeat(64),
      input: {},
      signal
    })).rejects.toMatchObject({ code: "PERMISSION" });
  });

  it("exposes research and assess entry points", async () => {
    const provider = new KimiProvider({ mode: "api_key", adapter: adapter({ ok: true }) });
    const options = { inputDigest: "b".repeat(64), signal };
    expect(await provider.research({ claims: [] }, options)).toMatchObject({ value: { ok: true } });
    expect(await provider.assess({ evidence: [] }, options)).toMatchObject({ value: { ok: true } });
  });

  it("keeps the strict output schema in correction requests without rejected content", async () => {
    const prompts: string[] = [];
    const provider = new KimiProvider({
      mode: "local_login",
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
      correction: {
        originalInputDigest: "c".repeat(64),
        validationIssuePaths: ["identity.status"]
      },
      signal
    });
    expect(prompts[0]).toContain('"additionalProperties":false');
    expect(prompts[0]).toContain("identity.status");
    expect(prompts[0]).not.toMatch(/rejected|credential|response/i);
  });
});
