export const ASSISTANT_LIMITS = {
  questionChars: 4_000,
  historyMessages: 12,
  historyChars: 32_000,
  contextPaths: 8,
  contextPathChars: 240,
  contextFileBytes: 64 * 1024,
  standard: {
    contextBytes: 256 * 1024,
    outputTokens: 4_096,
    sourceFiles: 6,
    sourceBytes: 192 * 1024,
    toolCalls: 4
  },
  deep: {
    contextBytes: 512 * 1024,
    outputTokens: 8_192,
    sourceFiles: 12,
    sourceBytes: 384 * 1024,
    toolCalls: 8
  },
  gateTtlMs: 10 * 60 * 1_000
} as const;

export type AssistantLimits = typeof ASSISTANT_LIMITS;
