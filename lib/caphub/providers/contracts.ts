import type { AnalysisStage } from "../analysis/types";

export type StructuredProviderName = "minimax" | "kimi";
export type StructuredProviderStage = Extract<
  AnalysisStage,
  "extraction" | "research" | "assessment" | "critic"
>;

export type ProviderFailureCode =
  | "ABORTED"
  | "TIMEOUT"
  | "AUTHENTICATION"
  | "BILLING"
  | "PERMISSION"
  | "UNAVAILABLE"
  | "INVALID_OUTPUT";

type StructuredProviderInputBase = {
  stage: StructuredProviderStage;
  inputDigest: string;
  signal: AbortSignal;
};

export type StructuredProviderInput =
  | (StructuredProviderInputBase & {
    kind: "initial";
    input: unknown;
  })
  | (StructuredProviderInputBase & {
    kind: "correction";
    correction: {
      originalInputDigest: string;
      validationIssuePaths: string[];
    };
  });

export interface StructuredProviderOutput {
  value: unknown;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface StructuredProvider {
  readonly provider: StructuredProviderName;
  readonly model: string;
  invoke(input: StructuredProviderInput): Promise<StructuredProviderOutput>;
}

export class ProviderInvocationError extends Error {
  readonly code: ProviderFailureCode;

  constructor(code: ProviderFailureCode, options?: ErrorOptions) {
    super(`Structured provider invocation failed: ${code}`, options);
    this.name = "ProviderInvocationError";
    this.code = code;
  }
}
