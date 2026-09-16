import { describe, expect, it, vi } from "vitest";
import { MINIMAX_TOKEN_PLAN_MODEL } from "../../assistant/minimax-token-plan-core";
import type { StructuredProviderInput } from "./contracts";
import {
  MiniMaxProvider,
  type MiniMaxGenerationRequest,
  type MiniMaxGenerate
} from "./minimax";

const signal = new AbortController().signal;

function initial(input: unknown): StructuredProviderInput {
  return {
    kind: "initial",
    stage: "extraction",
    inputDigest: "a".repeat(64),
    input,
    signal
  };
}

describe("MiniMaxProvider", () => {
  it("sends normalized images as ordered file parts with a no-tool bounded request", async () => {
    const requests: MiniMaxGenerationRequest[] = [];
    const generate: MiniMaxGenerate = vi.fn(async (request) => {
      requests.push(request);
      return {
        text: JSON.stringify({ answer: "ok" }),
        usage: { inputTokens: 20, outputTokens: 8 }
      };
    });
    const provider = new MiniMaxProvider({ generate });

    const result = await provider.invoke(initial({
      preprocess: { capture_id: `cap_${"1".repeat(32)}`, ocr_blocks: [] },
      normalizedImages: [
        { index: 2, data: new Uint8Array([2]), mediaType: "image/png" },
        { index: 0, data: new Uint8Array([0]), mediaType: "image/png" },
        { index: 1, data: new Uint8Array([1]), mediaType: "image/png" }
      ]
    }));

    expect(result).toEqual({
      value: { answer: "ok" },
      usage: { inputTokens: 20, outputTokens: 8 }
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      model: MINIMAX_TOKEN_PLAN_MODEL,
      maxRetries: 0,
      maxOutputTokens: 4096,
      abortSignal: signal
    });
    expect(requests[0]).not.toHaveProperty("tools");
    const content = requests[0]?.messages[0]?.content;
    expect(Array.isArray(content) ? content.filter((part) => part.type === "file").map((part) =>
      Array.from(part.data as Uint8Array)[0]
    ) : []).toEqual([0, 1, 2]);
    expect(JSON.stringify(requests[0])).not.toMatch(/\b(shell|git|implement(?:ation)?)\b/i);
  });

  it("uses only digest and validation paths for a correction call", async () => {
    const requests: MiniMaxGenerationRequest[] = [];
    const provider = new MiniMaxProvider({
      generate: async (request) => {
        requests.push(request);
        return { text: "{}", usage: { inputTokens: 1, outputTokens: 1 } };
      }
    });

    await provider.invoke({
      kind: "correction",
      stage: "critic",
      inputDigest: "b".repeat(64),
      correction: {
        originalInputDigest: "b".repeat(64),
        validationIssuePaths: ["findings.0.severity"]
      },
      signal
    });

    const serialized = JSON.stringify(requests[0]);
    expect(serialized).toContain("findings.0.severity");
    expect(serialized).toContain("b".repeat(64));
    expect(serialized).not.toMatch(/api[_-]?key|reasoning|rejected response/i);
  });

  it("rejects stages outside extraction and critic without transport", async () => {
    const generate = vi.fn<MiniMaxGenerate>();
    const provider = new MiniMaxProvider({ generate });

    await expect(provider.invoke({
      ...initial({}),
      stage: "research"
    })).rejects.toMatchObject({ code: "PERMISSION" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("exposes extraction and critic entry points on the same closed contract", async () => {
    const stages: string[] = [];
    const provider = new MiniMaxProvider({
      generate: async (request) => {
        stages.push(request.messages[0]?.content[0]?.type === "text"
          ? request.messages[0].content[0].text
          : "");
        return { text: "{}", usage: { inputTokens: 1, outputTokens: 1 } };
      }
    });

    await provider.extract({ preprocess: {}, normalizedImages: [] }, {
      inputDigest: "c".repeat(64),
      signal
    });
    await provider.critique({ approvedEvidence: [] }, {
      inputDigest: "d".repeat(64),
      signal
    });

    expect(stages[0]).toContain("stage=extraction");
    expect(stages[1]).toContain("stage=critic");
  });
});
