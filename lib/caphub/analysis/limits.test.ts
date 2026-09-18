import { describe, expect, it } from "vitest";
import { CAPHUB_ANALYSIS_LIMITS } from "./limits";

describe("CAPHUB_ANALYSIS_LIMITS", () => {
  it("freezes the approved P2 concurrency, image, provider, source, and token ceilings", () => {
    expect(CAPHUB_ANALYSIS_LIMITS).toEqual({
      concurrency: 1,
      maxImages: 8,
      maxAggregateImageBytes: 40 * 1024 * 1024,
      maxAggregatePixels: 80_000_000,
      maxPixelsPerImage: 40_000_000,
      preprocessingTimeoutMs: 60_000,
      ocrTimeoutMsPerImage: 15_000,
      maxVisualObservationOutputTokens: 1_800,
      maxVisualObservationBytes: 64 * 1024,
      providerTimeoutMs: { minimax: 60_000, kimi: 120_000, deepseek: 120_000 },
      maxSchemaCorrections: 1,
      maxProviderCallsPerJob: 8,
      maxInputBytes: {
        extraction: 2_097_152,
        research: 1_048_576,
        assessment: 1_048_576,
        critic: 1_048_576
      },
      maxTotalTokensPerJob: 256_000,
      maxSearchQueries: 4,
      maxFetchedSources: 8,
      sourceFetchTimeoutMs: 10_000,
      maxCompressedSourceBytes: 2 * 1024 * 1024,
      maxDecompressedSourceBytes: 4 * 1024 * 1024,
      maxRedirects: 2,
      maxOutputTokens: {
        extraction: 4_096,
        research: 8_192,
        assessment: 6_144,
        critic: 4_096
      }
    });
  });

  it("is immutable at runtime, including nested budget groups", () => {
    expect(Object.isFrozen(CAPHUB_ANALYSIS_LIMITS)).toBe(true);
    expect(Object.isFrozen(CAPHUB_ANALYSIS_LIMITS.providerTimeoutMs)).toBe(true);
    expect(Object.isFrozen(CAPHUB_ANALYSIS_LIMITS.maxInputBytes)).toBe(true);
    expect(Object.isFrozen(CAPHUB_ANALYSIS_LIMITS.maxOutputTokens)).toBe(true);
  });
});
