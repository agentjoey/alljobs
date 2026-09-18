import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson, digestCanonicalJson } from "../analysis/digest";
import { composeExtractionResultV2, ExtractionCompositionError, extractionDraftV2Schema } from "../analysis/extraction-v2";
import { CAPHUB_ANALYSIS_LIMITS } from "../analysis/limits";
import type { ExtractionResult, PreprocessResult } from "../analysis/types";
import { buildModelCallAuditEvent, type ModelCallAuditOutcome } from "../workflow/audit";
import type { JobModelBudget, ModelCallAuditStore, ModelCallIdFactory, ModelCallOperation, StructuredStageHumanReviewReason, StructuredStageResult } from "../workflow/contracts";
import { ProviderInvocationError } from "./contracts";
import type { DeepSeekProvider } from "./deepseek";
import { MiniMaxVisualObservationError, type MiniMaxExtractionInput, type MiniMaxProvider } from "./minimax";

export interface RunExtractionStageV2Request {
  jobId: string;
  captureId: string;
  preprocessArtifactId: string;
  input: MiniMaxExtractionInput & { preprocess: PreprocessResult };
  miniMax: Pick<MiniMaxProvider, "provider" | "model" | "observe">;
  deepSeek: Pick<DeepSeekProvider, "provider" | "model" | "structureExtraction">;
  auditStore: ModelCallAuditStore;
  budget: JobModelBudget;
  clock: () => string;
  idFactory?: ModelCallIdFactory;
  signal?: AbortSignal;
}

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative()
}).strict();

type FailedAudit = Extract<ModelCallAuditOutcome, { type: "failed" }>;
type TerminalMetadata = Omit<FailedAudit, "type" | "errorCode">;

function failureCode(reason: StructuredStageHumanReviewReason): FailedAudit["errorCode"] {
  switch (reason) {
    case "ABORTED":
    case "PERMISSION":
    case "TOKEN_LIMIT":
    case "INPUT_TOO_LARGE":
    case "PROVIDER_CALL_LIMIT":
      return "POLICY_DENIED";
    case "BILLING": return "QUOTA";
    case "SCHEMA_INVALID_TWICE": return "INVALID_OUTPUT";
    default: return reason;
  }
}

function failureReason(error: unknown, operation: ModelCallOperation): StructuredStageHumanReviewReason {
  if (error instanceof ExtractionCompositionError) return "HOST_EXTRACTION_LINKAGE_FAILED";
  if (error instanceof z.ZodError || (error instanceof ProviderInvocationError && error.code === "INVALID_OUTPUT")) {
    return operation === "visual_observation" ? "MINIMAX_INVALID_OBSERVATION" : "DEEPSEEK_STRUCTURE_FAILED";
  }
  if (error instanceof ProviderInvocationError) return error.code === "UNAVAILABLE" ? "PROVIDER_UNAVAILABLE" : error.code;
  return "PROVIDER_UNAVAILABLE";
}

async function withDeadline<T>(
  call: (signal: AbortSignal) => Promise<T>, external: AbortSignal | undefined, timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort();
  external?.addEventListener("abort", onExternalAbort, { once: true });
  if (external?.aborted) controller.abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let onAbort: (() => void) | undefined;
  try {
    if (controller.signal.aborted) throw new ProviderInvocationError("ABORTED");
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new ProviderInvocationError(timedOut ? "TIMEOUT" : "ABORTED"));
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([call(controller.signal), aborted]);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
  }
}

async function runOperation<T extends { usage: unknown }, V>(
  request: RunExtractionStageV2Request,
  inputDigest: string,
  operation: {
    provider: "minimax" | "deepseek";
    model: string;
    name: ModelCallOperation;
    contractVersion: string;
    inputBytes: number;
    call(signal: AbortSignal): Promise<T>;
    metadata(result: T): TerminalMetadata & { outputDigest: string };
    compose(result: T): V;
  }
): Promise<StructuredStageResult<V>> {
  if (request.signal?.aborted) return { kind: "human_review", reason: "ABORTED" };
  if (operation.inputBytes > CAPHUB_ANALYSIS_LIMITS.maxInputBytes.extraction) {
    return { kind: "human_review", reason: "INPUT_TOO_LARGE" };
  }
  if (request.budget.providerCalls >= CAPHUB_ANALYSIS_LIMITS.maxProviderCallsPerJob) {
    return { kind: "human_review", reason: "PROVIDER_CALL_LIMIT" };
  }
  if (request.budget.totalTokens >= CAPHUB_ANALYSIS_LIMITS.maxTotalTokensPerJob) {
    return { kind: "human_review", reason: "TOKEN_LIMIT" };
  }
  const base = {
    jobId: request.jobId, captureId: request.captureId, stage: "extraction" as const,
    provider: operation.provider, model: operation.model, attempt: 1 as const,
    operation: operation.name, contractVersion: operation.contractVersion,
    inputDigest, inputBytes: operation.inputBytes, occurredAt: request.clock()
  };
  await request.auditStore.append(buildModelCallAuditEvent(base, { type: "started" }, request.idFactory));
  request.budget.providerCalls += 1;

  let metadata: TerminalMetadata = {};
  let outcome: ModelCallAuditOutcome;
  let result: StructuredStageResult<V>;
  try {
    const raw = await withDeadline(operation.call, request.signal, CAPHUB_ANALYSIS_LIMITS.providerTimeoutMs[operation.provider]);
    const usage = usageSchema.parse(raw.usage);
    request.budget.totalTokens += usage.inputTokens + usage.outputTokens;
    const output = operation.metadata(raw);
    metadata = { ...output, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    if (request.budget.totalTokens > CAPHUB_ANALYSIS_LIMITS.maxTotalTokensPerJob) {
      result = { kind: "human_review", reason: "TOKEN_LIMIT" };
      outcome = { type: "failed", errorCode: "POLICY_DENIED", ...metadata };
    } else {
      result = { kind: "success", value: operation.compose(raw) };
      outcome = { type: "succeeded", ...output, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    }
  } catch (error) {
    let reason = failureReason(error, operation.name);
    if (error instanceof MiniMaxVisualObservationError) {
      const usage = usageSchema.safeParse(error.metadata.usage);
      metadata = {
        finishReason: error.metadata.finishReason, outputBytes: error.metadata.outputBytes,
        outputDigest: error.metadata.outputDigest,
        ...(usage.success ? { inputTokens: usage.data.inputTokens, outputTokens: usage.data.outputTokens } : {})
      };
      if (usage.success) request.budget.totalTokens += usage.data.inputTokens + usage.data.outputTokens;
      if (request.budget.totalTokens > CAPHUB_ANALYSIS_LIMITS.maxTotalTokensPerJob) reason = "TOKEN_LIMIT";
    }
    if (error instanceof z.ZodError) {
      metadata.validationIssuePaths = [...new Set(error.issues.map((issue) =>
        (issue.path.length ? issue.path.map(String).join(".") : "$").slice(0, 256)
      ))].sort().slice(0, 32);
    }
    result = { kind: "human_review", reason };
    outcome = { type: "failed", errorCode: failureCode(reason), ...metadata };
  }
  // A persistence failure must leave the started evidence unmatched for recovery.
  await request.auditStore.append(buildModelCallAuditEvent({ ...base, occurredAt: request.clock() }, outcome, request.idFactory));
  return result;
}

export async function runExtractionStageV2(request: RunExtractionStageV2Request): Promise<StructuredStageResult<ExtractionResult>> {
  let serializedInput: string;
  let inputDigest: string;
  try {
    // Match the canonical transport representation without trying to serialize Uint8Array as JSON.
    const input = {
      preprocess: request.input.preprocess,
      normalizedImages: request.input.normalizedImages.map((image) => ({
        index: image.index, mediaType: image.mediaType, dataBase64: Buffer.from(image.data).toString("base64")
      }))
    };
    serializedInput = canonicalJson(input);
    inputDigest = digestCanonicalJson(input);
  } catch {
    return { kind: "human_review", reason: "INVALID_OUTPUT" };
  }

  const observation = await runOperation(request, inputDigest, {
    provider: request.miniMax.provider, model: request.miniMax.model,
    name: "visual_observation", contractVersion: "caphub-minimax-visual-v2",
    inputBytes: Buffer.byteLength(serializedInput, "utf8"),
    call: (signal) => request.miniMax.observe(request.input, { inputDigest, signal }),
    metadata: (value) => ({
      outputDigest: createHash("sha256").update(value.text, "utf8").digest("hex"),
      outputBytes: value.outputBytes, finishReason: value.finishReason
    }),
    compose: (value) => value.text
  });
  if (observation.kind !== "success") return observation;

  const structuringInput = { observation: observation.value, preprocess: request.input.preprocess, inputDigest };
  return runOperation(request, inputDigest, {
    provider: request.deepSeek.provider, model: request.deepSeek.model,
    name: "schema_structuring", contractVersion: "caphub-deepseek-extraction-v2",
    inputBytes: Buffer.byteLength(canonicalJson(structuringInput), "utf8"),
    call: (signal) => request.deepSeek.structureExtraction(structuringInput, { signal }),
    metadata: (value) => ({
      outputDigest: digestCanonicalJson(value.output), outputBytes: Buffer.byteLength(canonicalJson(value.output), "utf8")
    }),
    compose: (value) => composeExtractionResultV2({
      captureId: request.captureId, preprocessArtifactId: request.preprocessArtifactId,
      preprocess: request.input.preprocess, draft: extractionDraftV2Schema.parse(value.output)
    })
  });
}
