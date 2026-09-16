import type { ModelCallAuditEvent } from "../analysis/types";
import type { StructuredProviderStage } from "../providers/contracts";

export interface ModelCallAuditStore {
  append(event: ModelCallAuditEvent): Promise<void>;
}

export interface JobModelBudget {
  providerCalls: number;
  totalTokens: number;
}

export type StructuredStageHumanReviewReason =
  | "ABORTED"
  | "TIMEOUT"
  | "AUTHENTICATION"
  | "BILLING"
  | "PERMISSION"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_OUTPUT"
  | "SCHEMA_INVALID_TWICE"
  | "INPUT_TOO_LARGE"
  | "PROVIDER_CALL_LIMIT"
  | "TOKEN_LIMIT";

export type StructuredStageResult<T> =
  | { kind: "success"; value: T }
  | { kind: "human_review"; reason: StructuredStageHumanReviewReason };

export interface ModelCallIdentityInput {
  jobId: string;
  captureId: string;
  stage: StructuredProviderStage;
  provider: "minimax" | "kimi";
  model: string;
  attempt: 1 | 2;
  inputDigest: string;
}

export interface ModelCallIdFactory {
  callId(input: ModelCallIdentityInput): string;
  eventId(input: ModelCallIdentityInput, type: ModelCallAuditEvent["type"]): string;
}
