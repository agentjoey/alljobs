import { createHash } from "node:crypto";
import { modelCallAuditEventSchema } from "../analysis/schemas";
import type { ModelCallAuditEvent } from "../analysis/types";
import type {
  ModelCallAuditStore,
  ModelCallIdFactory,
  ModelCallIdentityInput
} from "./contracts";

export type ModelCallAuditBase = ModelCallIdentityInput & {
  inputBytes: number;
  occurredAt: string;
  authMode?: "api_key" | "local_login";
  contractVersion?: string;
};

type ModelCallTerminalMetadata = {
  finishReason?: string;
  outputBytes?: number;
  validationIssuePaths?: string[];
};

export type ModelCallAuditOutcome =
  | { type: "started" }
  | (ModelCallTerminalMetadata & {
    type: "succeeded";
    outputDigest: string;
    inputTokens: number;
    outputTokens: number;
  })
  | (ModelCallTerminalMetadata & {
    type: "failed";
    errorCode: Extract<ModelCallAuditEvent, { type: "failed" }>["error_code"];
    outputDigest?: string;
    inputTokens?: number;
    outputTokens?: number;
  });

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function identitySeed(input: ModelCallIdentityInput): string {
  return [
    input.jobId,
    input.captureId,
    input.stage,
    input.provider,
    input.model,
    input.attempt,
    input.inputDigest,
    ...(input.operation ? [input.operation] : [])
  ].join("\u0000");
}

export const deterministicModelCallIdFactory: ModelCallIdFactory = {
  callId(input) {
    return `call_${digest(identitySeed(input)).slice(0, 32)}`;
  },
  eventId(input, type) {
    return `mce_${digest(`${identitySeed(input)}\u0000${type}`).slice(0, 32)}`;
  }
};

export function deterministicModelCallIds(
  input: ModelCallIdentityInput,
  type: ModelCallAuditEvent["type"]
): { callId: string; eventId: string } {
  return {
    callId: deterministicModelCallIdFactory.callId(input),
    eventId: deterministicModelCallIdFactory.eventId(input, type)
  };
}

export function buildModelCallAuditEvent(
  base: ModelCallAuditBase,
  outcome: ModelCallAuditOutcome,
  idFactory: ModelCallIdFactory = deterministicModelCallIdFactory
): ModelCallAuditEvent {
  const identity: ModelCallIdentityInput = {
    jobId: base.jobId,
    captureId: base.captureId,
    stage: base.stage,
    provider: base.provider,
    model: base.model,
    attempt: base.attempt,
    inputDigest: base.inputDigest,
    ...(base.operation ? { operation: base.operation } : {})
  };
  const common = {
    schema_version: 1 as const,
    event_id: idFactory.eventId(identity, outcome.type),
    call_id: idFactory.callId(identity),
    job_id: base.jobId,
    capture_id: base.captureId,
    stage: base.stage,
    provider: base.provider,
    model: base.model,
    ...(base.operation ? { operation: base.operation } : {}),
    ...(base.contractVersion ? { contract_version: base.contractVersion } : {}),
    ...(base.authMode ? { auth_mode: base.authMode } : {}),
    attempt: base.attempt,
    input_digest: base.inputDigest,
    input_bytes: base.inputBytes,
    occurred_at: base.occurredAt
  };

  const terminalMetadata = outcome.type === "started" ? {} : {
    ...(outcome.finishReason !== undefined ? { finish_reason: outcome.finishReason } : {}),
    ...(outcome.outputBytes !== undefined ? { output_bytes: outcome.outputBytes } : {}),
    ...(outcome.validationIssuePaths !== undefined ? { validation_issue_paths: outcome.validationIssuePaths } : {})
  };
  const event = outcome.type === "started"
    ? { ...common, type: outcome.type }
    : outcome.type === "succeeded"
      ? {
        ...common,
        ...terminalMetadata,
        type: outcome.type,
        output_digest: outcome.outputDigest,
        input_tokens: outcome.inputTokens,
        output_tokens: outcome.outputTokens
      }
      : {
        ...common,
        ...terminalMetadata,
        type: outcome.type,
        error_code: outcome.errorCode,
        ...(outcome.outputDigest !== undefined ? { output_digest: outcome.outputDigest } : {}),
        ...(outcome.inputTokens !== undefined ? { input_tokens: outcome.inputTokens } : {}),
        ...(outcome.outputTokens !== undefined ? { output_tokens: outcome.outputTokens } : {})
      };

  return modelCallAuditEventSchema.parse(event);
}

export class InMemoryModelCallAuditStore implements ModelCallAuditStore {
  readonly events: ModelCallAuditEvent[] = [];

  async append(event: ModelCallAuditEvent): Promise<void> {
    this.events.push(modelCallAuditEventSchema.parse(event));
  }
}
