import { z } from "zod";
import { canonicalJson, digestCanonicalJson } from "../analysis/digest";
import { CAPHUB_ANALYSIS_LIMITS } from "../analysis/limits";
import type { SourceCandidate } from "../research/source-gateway";
import { buildModelCallAuditEvent, type ModelCallAuditOutcome } from "../workflow/audit";
import type {
  JobModelBudget,
  ModelCallAuditStore,
  StructuredStageHumanReviewReason,
  StructuredStageResult
} from "../workflow/contracts";
import { ProviderInvocationError, type ProviderFailureCode } from "./contracts";
import type {
  MiniMaxWebSearchInput,
  MiniMaxWebSearchProvider,
  MiniMaxWebSearchResult
} from "./minimax-web-search";

const WEB_SEARCH_TIMEOUT_MS = 120_000;
const WEB_SEARCH_CONTRACT_VERSION = "caphub-minimax-web-search-v1";

const resultSchema = z.object({
  candidates: z.array(z.object({
    url: z.string().url(),
    title: z.string().trim().min(1),
    sourceKind: z.enum(["official", "repository", "package", "reputable", "community", "unknown"]),
    claims: z.array(z.string().trim().min(1)).min(1),
    content: z.string().trim().min(1).optional()
  }).strict()).min(1).max(CAPHUB_ANALYSIS_LIMITS.maxFetchedSources),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative()
  }).strict(),
  finishReason: z.literal("stop"),
  outputBytes: z.number().int().nonnegative()
}).strict();

function humanReviewReason(code: ProviderFailureCode): StructuredStageHumanReviewReason {
  return code === "UNAVAILABLE" ? "PROVIDER_UNAVAILABLE" : code;
}

function auditFailureCode(code: ProviderFailureCode) {
  if (code === "BILLING") return "QUOTA" as const;
  if (code === "UNAVAILABLE") return "PROVIDER_UNAVAILABLE" as const;
  if (code === "ABORTED" || code === "PERMISSION") return "POLICY_DENIED" as const;
  return code;
}

async function invokeWithDeadline(
  provider: Pick<MiniMaxWebSearchProvider, "search">,
  input: MiniMaxWebSearchInput,
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): Promise<MiniMaxWebSearchResult> {
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  if (externalSignal?.aborted) controller.abort(externalSignal.reason);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("web search deadline exceeded"));
  }, timeoutMs);
  let onAbort: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new ProviderInvocationError(timedOut ? "TIMEOUT" : "ABORTED"));
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    });
    return await Promise.race([
      provider.search(input, { signal: controller.signal }),
      aborted
    ]);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
  }
}

export async function runWebSearchStage(request: {
  jobId: string;
  captureId: string;
  input: MiniMaxWebSearchInput;
  provider: Pick<MiniMaxWebSearchProvider, "provider" | "model" | "search">;
  auditStore: ModelCallAuditStore;
  budget: JobModelBudget;
  clock: () => string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<StructuredStageResult<readonly SourceCandidate[]>> {
  let serializedInput: string;
  try {
    serializedInput = canonicalJson(request.input);
  } catch {
    return { kind: "human_review", reason: "INVALID_OUTPUT" };
  }
  if (request.signal?.aborted) return { kind: "human_review", reason: "ABORTED" };
  if (Buffer.byteLength(serializedInput, "utf8") > CAPHUB_ANALYSIS_LIMITS.maxInputBytes.research) {
    return { kind: "human_review", reason: "INPUT_TOO_LARGE" };
  }
  if (request.budget.providerCalls >= CAPHUB_ANALYSIS_LIMITS.maxProviderCallsPerJob) {
    return { kind: "human_review", reason: "PROVIDER_CALL_LIMIT" };
  }
  if (request.budget.totalTokens >= CAPHUB_ANALYSIS_LIMITS.maxTotalTokensPerJob) {
    return { kind: "human_review", reason: "TOKEN_LIMIT" };
  }

  const inputDigest = digestCanonicalJson(request.input);
  const auditBase = {
    jobId: request.jobId,
    captureId: request.captureId,
    stage: "research" as const,
    provider: request.provider.provider,
    model: request.provider.model,
    operation: "web_search" as const,
    contractVersion: WEB_SEARCH_CONTRACT_VERSION,
    authMode: "api_key" as const,
    attempt: 1 as const,
    inputDigest,
    inputBytes: Buffer.byteLength(serializedInput, "utf8"),
    occurredAt: request.clock()
  };
  await request.auditStore.append(buildModelCallAuditEvent(auditBase, { type: "started" }));
  request.budget.providerCalls += 1;

  let outcome: ModelCallAuditOutcome;
  let result: StructuredStageResult<readonly SourceCandidate[]>;
  try {
    const raw = await invokeWithDeadline(
      request.provider,
      request.input,
      request.signal,
      request.timeoutMs ?? WEB_SEARCH_TIMEOUT_MS
    );
    const parsed = resultSchema.safeParse(raw);
    if (!parsed.success) throw new ProviderInvocationError("INVALID_OUTPUT");
    request.budget.totalTokens += parsed.data.usage.inputTokens + parsed.data.usage.outputTokens;
    const terminal = {
      outputDigest: digestCanonicalJson(parsed.data.candidates),
      outputBytes: parsed.data.outputBytes,
      finishReason: parsed.data.finishReason,
      inputTokens: parsed.data.usage.inputTokens,
      outputTokens: parsed.data.usage.outputTokens
    };
    if (request.budget.totalTokens > CAPHUB_ANALYSIS_LIMITS.maxTotalTokensPerJob) {
      outcome = { type: "failed", errorCode: "POLICY_DENIED", ...terminal };
      result = { kind: "human_review", reason: "TOKEN_LIMIT" };
    } else {
      outcome = { type: "succeeded", ...terminal };
      result = { kind: "success", value: parsed.data.candidates };
    }
  } catch (error) {
    const code = error instanceof ProviderInvocationError ? error.code : "UNAVAILABLE";
    outcome = { type: "failed", errorCode: auditFailureCode(code) };
    result = { kind: "human_review", reason: humanReviewReason(code) };
  }
  await request.auditStore.append(buildModelCallAuditEvent(
    { ...auditBase, occurredAt: request.clock() },
    outcome
  ));
  return result;
}
