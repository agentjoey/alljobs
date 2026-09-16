import { z } from "zod";
import { digestCanonicalJson, canonicalJson } from "../analysis/digest";
import { CAPHUB_ANALYSIS_LIMITS } from "../analysis/limits";
import type {
  JobModelBudget,
  ModelCallIdFactory,
  StructuredStageHumanReviewReason,
  StructuredStageResult
} from "../workflow/contracts";
import { buildModelCallAuditEvent } from "../workflow/audit";
import type { ModelCallAuditStore } from "../workflow/contracts";
import {
  ProviderInvocationError,
  type ProviderFailureCode,
  type StructuredProvider,
  type StructuredProviderInput,
  type StructuredProviderOutput,
  type StructuredProviderStage
} from "./contracts";

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative()
}).strict();

type WithoutSignal<T> = T extends unknown ? Omit<T, "signal"> : never;
type StructuredProviderInputWithoutSignal = WithoutSignal<StructuredProviderInput>;

export interface RunStructuredStageRequest<T> {
  jobId: string;
  captureId: string;
  stage: StructuredProviderStage;
  input: unknown;
  schema: z.ZodType<T>;
  provider: StructuredProvider;
  auditStore: ModelCallAuditStore;
  budget: JobModelBudget;
  clock: () => string;
  idFactory?: ModelCallIdFactory;
  authMode?: "api_key" | "local_login";
  signal?: AbortSignal;
  timeoutMs?: number;
}

function providerReason(code: ProviderFailureCode): StructuredStageHumanReviewReason {
  return code === "UNAVAILABLE" ? "PROVIDER_UNAVAILABLE" : code;
}

function auditFailureCode(code: ProviderFailureCode) {
  switch (code) {
    case "ABORTED":
    case "PERMISSION":
      return "POLICY_DENIED" as const;
    case "BILLING":
      return "QUOTA" as const;
    case "UNAVAILABLE":
      return "PROVIDER_UNAVAILABLE" as const;
    default:
      return code;
  }
}

function validationIssuePaths(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.length > 0
    ? issue.path.map(String).join(".")
    : "$"
  ))].sort();
}

function combineSignal(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(external?.reason);
  external?.addEventListener("abort", onAbort, { once: true });
  if (external?.aborted) controller.abort(external.reason);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("provider deadline exceeded"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    }
  };
}

async function invokeWithDeadline(
  provider: StructuredProvider,
  input: StructuredProviderInputWithoutSignal,
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): Promise<StructuredProviderOutput> {
  const combined = combineSignal(externalSignal, timeoutMs);
  let abortListener: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(new ProviderInvocationError(
        combined.timedOut() ? "TIMEOUT" : "ABORTED"
      ));
      combined.signal.addEventListener("abort", abortListener, { once: true });
      if (combined.signal.aborted) abortListener();
    });
    return await Promise.race([
      provider.invoke({ ...input, signal: combined.signal } as StructuredProviderInput),
      aborted
    ]);
  } finally {
    if (abortListener) combined.signal.removeEventListener("abort", abortListener);
    combined.cleanup();
  }
}

export async function runStructuredStage<T>(
  request: RunStructuredStageRequest<T>
): Promise<StructuredStageResult<T>> {
  let serializedInput: string;
  try {
    serializedInput = canonicalJson(request.input);
  } catch {
    return { kind: "human_review", reason: "INVALID_OUTPUT" };
  }

  const originalInputDigest = digestCanonicalJson(request.input);
  const originalInputBytes = Buffer.byteLength(serializedInput, "utf8");
  if (originalInputBytes > CAPHUB_ANALYSIS_LIMITS.maxInputBytes[request.stage]) {
    return { kind: "human_review", reason: "INPUT_TOO_LARGE" };
  }

  let issuePaths: string[] | undefined;
  for (const attempt of [1, 2] as const) {
    if (request.budget.providerCalls >= CAPHUB_ANALYSIS_LIMITS.maxProviderCallsPerJob) {
      return { kind: "human_review", reason: "PROVIDER_CALL_LIMIT" };
    }

    const providerInput: StructuredProviderInputWithoutSignal = attempt === 1
      ? {
        kind: "initial",
        stage: request.stage,
        inputDigest: originalInputDigest,
        input: request.input
      }
      : {
        kind: "correction",
        stage: request.stage,
        inputDigest: originalInputDigest,
        correction: {
          originalInputDigest,
          validationIssuePaths: issuePaths ?? ["$"]
        }
      };
    const inputBytes = Buffer.byteLength(canonicalJson(
      providerInput.kind === "initial" ? providerInput.input : providerInput.correction
    ), "utf8");
    const auditBase = {
      jobId: request.jobId,
      captureId: request.captureId,
      stage: request.stage,
      provider: request.provider.provider,
      model: request.provider.model,
      attempt,
      inputDigest: originalInputDigest,
      inputBytes,
      occurredAt: request.clock(),
      ...(request.authMode ? { authMode: request.authMode } : {})
    };

    await request.auditStore.append(buildModelCallAuditEvent(
      auditBase,
      { type: "started" },
      request.idFactory
    ));
    request.budget.providerCalls += 1;

    let rawOutput: StructuredProviderOutput;
    try {
      rawOutput = await invokeWithDeadline(
        request.provider,
        providerInput,
        request.signal,
        request.timeoutMs ?? CAPHUB_ANALYSIS_LIMITS.providerTimeoutMs[request.provider.provider]
      );
    } catch (error) {
      const code = error instanceof ProviderInvocationError ? error.code : "UNAVAILABLE";
      await request.auditStore.append(buildModelCallAuditEvent(
        { ...auditBase, occurredAt: request.clock() },
        { type: "failed", errorCode: auditFailureCode(code) },
        request.idFactory
      ));
      return { kind: "human_review", reason: providerReason(code) };
    }

    const usage = usageSchema.safeParse(rawOutput.usage);
    if (!usage.success) {
      await request.auditStore.append(buildModelCallAuditEvent(
        { ...auditBase, occurredAt: request.clock() },
        { type: "failed", errorCode: "INVALID_OUTPUT" },
        request.idFactory
      ));
      return { kind: "human_review", reason: "INVALID_OUTPUT" };
    }
    request.budget.totalTokens += usage.data.inputTokens + usage.data.outputTokens;
    if (request.budget.totalTokens > CAPHUB_ANALYSIS_LIMITS.maxTotalTokensPerJob) {
      await request.auditStore.append(buildModelCallAuditEvent(
        { ...auditBase, occurredAt: request.clock() },
        { type: "failed", errorCode: "POLICY_DENIED" },
        request.idFactory
      ));
      return { kind: "human_review", reason: "TOKEN_LIMIT" };
    }

    const parsed = request.schema.safeParse(rawOutput.value);
    if (!parsed.success) {
      await request.auditStore.append(buildModelCallAuditEvent(
        { ...auditBase, occurredAt: request.clock() },
        { type: "failed", errorCode: "INVALID_OUTPUT" },
        request.idFactory
      ));
      if (attempt === 2) {
        return { kind: "human_review", reason: "SCHEMA_INVALID_TWICE" };
      }
      issuePaths = validationIssuePaths(parsed.error);
      continue;
    }

    await request.auditStore.append(buildModelCallAuditEvent(
      { ...auditBase, occurredAt: request.clock() },
      {
        type: "succeeded",
        outputDigest: digestCanonicalJson(parsed.data),
        inputTokens: usage.data.inputTokens,
        outputTokens: usage.data.outputTokens
      },
      request.idFactory
    ));
    return { kind: "success", value: parsed.data };
  }

  return { kind: "human_review", reason: "SCHEMA_INVALID_TWICE" };
}
