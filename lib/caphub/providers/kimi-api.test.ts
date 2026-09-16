import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { KIMI_API_BASE_URL, KIMI_API_MODEL, KimiApiAdapter, type KimiApiTransport } from "./kimi-api";

describe("KimiApiAdapter", () => {
  it("makes one fixed structured-output request without tools or retries", async () => {
    const transport = vi.fn<KimiApiTransport>(async () => ({
      output: { answer: "same" },
      usage: { inputTokens: 12, outputTokens: 4 }
    }));
    const adapter = new KimiApiAdapter({ apiKey: "test-secret", transport });
    const signal = new AbortController().signal;

    const result = await adapter.generate({
      stage: "assessment",
      prompt: "fixture",
      schema: z.object({ answer: z.string() }).strict(),
      maxOutputTokens: 100,
      signal
    });

    expect(result).toEqual({ output: { answer: "same" }, usage: { inputTokens: 12, outputTokens: 4 } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0]).toMatchObject({
      baseURL: KIMI_API_BASE_URL,
      model: KIMI_API_MODEL,
      apiKey: "test-secret",
      structuredOutput: true,
      maxRetries: 0,
      maxOutputTokens: 100,
      abortSignal: signal
    });
    expect(transport.mock.calls[0]?.[0]).not.toHaveProperty("tools");
    expect(transport.mock.calls[0]?.[0].baseURL).toBe("https://api.kimi.com/coding/v1");
    expect(transport.mock.calls[0]?.[0].model).toBe("k3-256k");
  });
});
