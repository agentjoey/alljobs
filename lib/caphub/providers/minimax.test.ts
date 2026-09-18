import { afterEach, describe, expect, it, vi } from "vitest";
import { MINIMAX_TOKEN_PLAN_MODEL } from "../../assistant/minimax-token-plan-core";
import { ProviderInvocationError, type StructuredProviderInput } from "./contracts";
import {
  MiniMaxProvider,
  MiniMaxVisualObservationError,
  type MiniMaxExtractionInput,
  type MiniMaxGenerationRequest,
  type MiniMaxGenerate
} from "./minimax";

const signal = new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());

const observationInput: MiniMaxExtractionInput = {
  preprocess: {
    ocr_blocks: [{ image_index: 0, ocr_block_index: 0, text: "Example" }]
  },
  normalizedImages: [
    { index: 2, data: new Uint8Array([2]), mediaType: "image/png" },
    { index: 0, data: new Uint8Array([0]), mediaType: "image/png" },
    { index: 1, data: new Uint8Array([1]), mediaType: "image/png" }
  ]
};

const observationOptions = {
  inputDigest: "a".repeat(64),
  signal
};

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
  it.each([[401, "AUTHENTICATION"], [402, "BILLING"]] as const)(
    "redacts actual SDK HTTP %i errors at the observation boundary", async (status, code) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
        error: { message: "PRIVATE_RESPONSE TEST_SECRET", type: "invalid_request_error", code: "synthetic_failure" }
      }, { status, headers: { "x-private": "PRIVATE_HEADER" } }));
      vi.stubGlobal("fetch", fetch);
      const provider = new MiniMaxProvider({ apiKey: "TEST_SECRET" });
      const error = await provider.observe(observationInput, observationOptions).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(ProviderInvocationError);
      expect(error).toMatchObject({ code });
      expect(error).not.toHaveProperty("cause");
      expect(Object.keys(error as ProviderInvocationError).sort()).toEqual(["code", "name"]);
      expect(String(error)).not.toMatch(/PRIVATE_RESPONSE|PRIVATE_HEADER|TEST_SECRET|synthetic_failure/);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it("returns one bounded visual observation from ordered image parts", async () => {
    const requests: MiniMaxGenerationRequest[] = [];
    const provider = new MiniMaxProvider({
      generate: async (request) => {
        requests.push(request);
        return {
          text: "Image 0 visibly shows Example. OCR block 0 contains its name.",
          finishReason: "stop",
          usage: { inputTokens: 20, outputTokens: 18 }
        };
      }
    });

    await expect(provider.observe(observationInput, observationOptions)).resolves.toMatchObject({
      text: expect.stringContaining("Image 0"),
      finishReason: "stop",
      outputBytes: 61,
      usage: { inputTokens: 20, outputTokens: 18 }
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      model: MINIMAX_TOKEN_PLAN_MODEL,
      maxRetries: 0,
      maxOutputTokens: 1_800,
      abortSignal: signal
    });
    const content = requests[0]?.messages[0]?.content;
    expect(Array.isArray(content) ? content.filter((part) => part.type === "file").map((part) =>
      Array.from(part.data as Uint8Array)[0]
    ) : []).toEqual([0, 1, 2]);
    expect(JSON.stringify(requests[0])).not.toMatch(/output_schema|capture_id|preprocess_artifact_id|tools/i);
  });

  it("rejects a blank visual observation with redacted metadata", async () => {
    const provider = new MiniMaxProvider({
      generate: async () => ({
        text: "   ",
        finishReason: "stop",
        usage: { inputTokens: 20, outputTokens: 0 }
      })
    });

    const error = await provider.observe(observationInput, observationOptions).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(MiniMaxVisualObservationError);
    expect(error).toMatchObject({
      code: "INVALID_OUTPUT",
      metadata: {
        finishReason: "stop",
        outputBytes: 3,
        outputDigest: "0aad7da77d2ed59c396c99a74e49f3a4524dcdbcb5163251b1433d640247aeb4",
        usage: { inputTokens: 20, outputTokens: 0 }
      }
    });
    expect(Object.keys((error as MiniMaxVisualObservationError).metadata).sort()).toEqual([
      "finishReason",
      "outputBytes",
      "outputDigest",
      "usage"
    ]);
    expect(JSON.stringify(error)).not.toContain("   ");
  });

  it("rejects a visual observation above the UTF-8 byte ceiling", async () => {
    const oversized = "é".repeat(32_769);
    const provider = new MiniMaxProvider({
      generate: async () => ({
        text: oversized,
        finishReason: "stop",
        usage: { inputTokens: 20, outputTokens: 1_800 }
      })
    });

    const error = await provider.observe(observationInput, observationOptions).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(MiniMaxVisualObservationError);
    expect(error).toMatchObject({
      metadata: {
        finishReason: "stop",
        outputBytes: 65_538,
        outputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        usage: { inputTokens: 20, outputTokens: 1_800 }
      }
    });
    expect(JSON.stringify(error)).not.toContain(oversized.slice(0, 64));
  });

  it("rejects a truncated visual observation without exposing provider text", async () => {
    const providerText = "Image 0 shows secret-token-value";
    const provider = new MiniMaxProvider({
      generate: async () => ({
        text: providerText,
        finishReason: "length",
        usage: { inputTokens: 20, outputTokens: 1_800 }
      })
    });

    const error = await provider.observe(observationInput, observationOptions).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(MiniMaxVisualObservationError);
    expect(error).toMatchObject({
      metadata: {
        finishReason: "length",
        outputBytes: 32,
        outputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        usage: { inputTokens: 20, outputTokens: 1_800 }
      }
    });
    expect(JSON.stringify(error)).not.toContain(providerText);
    expect(JSON.stringify(error)).not.toContain("secret-token-value");
  });

  it("omits malformed usage from public visual-observation error metadata", async () => {
    const provider = new MiniMaxProvider({
      generate: async () => ({
        text: "Image 0 shows Example",
        finishReason: "stop",
        usage: { inputTokens: undefined, outputTokens: undefined }
      })
    });

    const error = await provider.observe(observationInput, observationOptions).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(MiniMaxVisualObservationError);
    expect((error as MiniMaxVisualObservationError).metadata).toEqual({
      finishReason: "stop",
      outputBytes: 21,
      outputDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(Object.keys((error as MiniMaxVisualObservationError).metadata).sort()).toEqual([
      "finishReason",
      "outputBytes",
      "outputDigest"
    ]);
  });

  it("rejects extraction through invoke before transport", async () => {
    const generate = vi.fn<MiniMaxGenerate>();
    const provider = new MiniMaxProvider({ generate });

    await expect(provider.invoke(initial(observationInput))).rejects.toMatchObject({ code: "PERMISSION" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects stages outside critic before transport", async () => {
    const generate = vi.fn<MiniMaxGenerate>();
    const provider = new MiniMaxProvider({ generate });

    await expect(provider.invoke({
      ...initial({}),
      stage: "research"
    })).rejects.toMatchObject({ code: "PERMISSION" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("preserves critic JSON generation", async () => {
    const requests: MiniMaxGenerationRequest[] = [];
    const provider = new MiniMaxProvider({
      generate: async (request) => {
        requests.push(request);
        return {
          text: JSON.stringify({ approved: true }),
          finishReason: "stop",
          usage: { inputTokens: 8, outputTokens: 3 }
        };
      }
    });

    await expect(provider.critique({ approvedEvidence: [] }, {
      inputDigest: "d".repeat(64),
      signal
    })).resolves.toEqual({
      value: { approved: true },
      usage: { inputTokens: 8, outputTokens: 3 }
    });
    expect(requests[0]).toMatchObject({ maxOutputTokens: 4_096, maxRetries: 0 });
    expect(JSON.stringify(requests[0])).not.toMatch(/"tools"/i);
  });

  it("uses only digest and validation paths for a critic correction call", async () => {
    const requests: MiniMaxGenerationRequest[] = [];
    const provider = new MiniMaxProvider({
      generate: async (request) => {
        requests.push(request);
        return {
          text: "{}",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 }
        };
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
});
