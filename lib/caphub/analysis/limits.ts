export const CAPHUB_ANALYSIS_LIMITS = Object.freeze({
  concurrency: 1,
  maxImages: 8,
  maxAggregateImageBytes: 40 * 1024 * 1024,
  maxAggregatePixels: 80_000_000,
  maxPixelsPerImage: 40_000_000,
  preprocessingTimeoutMs: 60_000,
  ocrTimeoutMsPerImage: 15_000,
  providerTimeoutMs: Object.freeze({ minimax: 60_000, kimi: 120_000 }),
  maxSchemaCorrections: 1,
  maxProviderCallsPerJob: 8,
  maxInputBytes: Object.freeze({
    extraction: 2_097_152,
    research: 1_048_576,
    assessment: 1_048_576,
    critic: 1_048_576
  }),
  maxTotalTokensPerJob: 256_000,
  maxSearchQueries: 4,
  maxFetchedSources: 8,
  sourceFetchTimeoutMs: 10_000,
  maxCompressedSourceBytes: 2 * 1024 * 1024,
  maxDecompressedSourceBytes: 4 * 1024 * 1024,
  maxRedirects: 2,
  maxOutputTokens: Object.freeze({
    extraction: 4_096,
    research: 8_192,
    assessment: 6_144,
    critic: 4_096
  })
} as const);
