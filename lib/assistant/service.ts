import "server-only";

import { randomUUID } from "node:crypto";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import type { AssistantContextBundle } from "./context";
import { assembleAssistantContext } from "./context";
import {
  assistantOutcomeSchema,
  type AssistantMode,
  type AssistantOutcome,
  type AssistantRequestIntent,
  type AssistantRunRecord,
  type AssistantSourceGateState,
  type AssistantStreamEvent,
  type AssistantPartialView,
  type SourceAccessProposal,
  type TaskDraft,
  type BacklogProposal,
  taskDraftSchema,
  backlogProposalSchema
} from "./contracts";
import { assistantDigest } from "./digest";
import { ASSISTANT_LIMITS } from "./limits";
import { createMiniMaxTokenPlanModel, MINIMAX_TOKEN_PLAN_MODEL } from "./minimax-token-plan";
import { buildAssistantPrompt } from "./prompt";
import { createSourceGate, consumeSourceGate, rejectSourceGate, type SourceGateRecord } from "./source-gates";
import { createAssistantReadTools } from "./source-files";
import { recordAssistantRun } from "../planning/native/activity";
import { NativePlanningStore } from "../planning/native/store";
import { buildAssistantBacklogHandoff } from "./handoff";

export interface AssistantModelResult {
  outcome: AssistantOutcome | TaskDraft | BacklogProposal;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface AssistantModelStream {
  partials: AsyncIterable<AssistantPartialView>;
  result: Promise<AssistantModelResult>;
}

export interface AssistantModelInput {
  context: AssistantContextBundle;
  intent: AssistantRequestIntent;
  signal: AbortSignal;
  sourceGate?: SourceGateRecord;
}

export type AssistantModelGenerator = (input: AssistantModelInput) => Promise<AssistantModelResult | AssistantModelStream> | AssistantModelStream;

export interface AssistantServiceDependencies {
  assembleContext?: (input: Parameters<typeof assembleAssistantContext>[0]) => Promise<AssistantContextBundle>;
  generate?: AssistantModelGenerator;
  recordActivity?: (run: AssistantRunRecord) => Promise<void>;
  createRunId?: () => string;
  now?: () => Date;
}

function modeFor(intent: AssistantRequestIntent, gate?: SourceGateRecord): AssistantMode {
  if (intent.intent === "ask" || intent.intent === "draft_task" || intent.intent === "draft_backlog") return intent.mode;
  if (gate?.max_files === ASSISTANT_LIMITS.deep.sourceFiles) return "deep";
  return "standard";
}

function outputSchemaFor(intent: AssistantRequestIntent) {
  if (intent.intent === "draft_task") return taskDraftSchema;
  if (intent.intent === "draft_backlog") return backlogProposalSchema;
  return assistantOutcomeSchema;
}

/**
 * MiniMax-M3 supports OpenAI-compatible streaming but not json_schema. Keep
 * unstructured stream text server-side until it is a complete JSON object,
 * then let the existing intent schema validate it before anything is emitted.
 */
export function parseAssistantModelJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("NOT_OBJECT");
    return parsed;
  } catch {
    throw new Error("OUTCOME_INVALID_MODEL_JSON");
  }
}

/** Only a fully closed JSON direct_answer string may reach the incomplete UI. */
export function extractAssistantPartial(text: string): AssistantPartialView | null {
  const match = /"direct_answer"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(text);
  if (!match) return null;
  try {
    const directAnswer: unknown = JSON.parse(`"${match[1]}"`);
    return typeof directAnswer === "string" ? { direct_answer: directAnswer } : null;
  } catch {
    return null;
  }
}

function validateDraftCitations(ids: string[], context: AssistantContextBundle): void {
  const available = new Set(context.manifest.documents.map((document) => document.source_id));
  if (ids.some((id) => !available.has(id))) throw new Error("OUTCOME_UNKNOWN_CITATION");
}

function contextInput(intent: AssistantRequestIntent, mode: AssistantMode) {
  return {
    projectSlug: intent.project_slug,
    mode,
    selectedOptionalSourceIds: intent.intent === "ask" ? intent.selected_optional_source_ids : []
  };
}

function validateCitations(outcome: AssistantOutcome, context: AssistantContextBundle): void {
  if (outcome.kind !== "management_answer") return;
  const sourceIds = new Set(context.manifest.documents.map((document) => document.source_id));
  const cited = new Set(outcome.citations.map((citation) => citation.source_id));
  for (const citation of outcome.citations) {
    if (!sourceIds.has(citation.source_id)) throw new Error("OUTCOME_UNKNOWN_CITATION");
  }
  for (const fact of outcome.confirmed_facts) {
    for (const sourceId of fact.citation_source_ids) {
      if (!sourceIds.has(sourceId) || !cited.has(sourceId)) throw new Error("OUTCOME_INVALID_FACT_CITATION");
    }
  }
  for (const inference of outcome.inferences) {
    for (const sourceId of inference.based_on_source_ids) {
      if (!sourceIds.has(sourceId)) throw new Error("OUTCOME_UNKNOWN_INFERENCE_SOURCE");
    }
  }
}

function sourceGateProposal(outcome: SourceAccessProposal, gate: SourceGateRecord): SourceAccessProposal {
  return {
    ...outcome,
    gate_id: gate.gate_id,
    requested_capabilities: [...gate.capabilities],
    max_files: gate.max_files,
    max_bytes: gate.max_bytes,
    max_tool_calls: gate.max_tool_calls,
    manifest_digest: gate.manifest_digest,
    expires_at: gate.expires_at
  };
}

function safeErrorCode(error: unknown, signal: AbortSignal): "ABORTED" | "STALE_CONTEXT" | "INVALID_OUTPUT" | "PROVIDER_UNAVAILABLE" {
  if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return "ABORTED";
  if (error instanceof Error && error.message === "OUTCOME_STALE_CONTEXT") return "STALE_CONTEXT";
  if (error instanceof Error && error.message.startsWith("OUTCOME_")) return "INVALID_OUTPUT";
  return "PROVIDER_UNAVAILABLE";
}

function safeErrorMessage(code: ReturnType<typeof safeErrorCode>): string {
  if (code === "ABORTED") return "Assistant run was cancelled and is incomplete.";
  if (code === "STALE_CONTEXT") return "Project context changed before this request could start. Refresh and try again.";
  if (code === "INVALID_OUTPUT") return "Assistant output could not be validated against the current project context.";
  return "Management assistant is temporarily unavailable.";
}

async function generateWithMiniMax(input: AssistantModelInput): Promise<AssistantModelStream> {
  const mode = modeFor(input.intent, input.sourceGate);
  const sourceTools = input.sourceGate
    ? await createSourceTools(input.intent.project_slug, input.sourceGate)
    : undefined;
  const result = streamText({
    model: createMiniMaxTokenPlanModel({ mode }),
    instructions: buildAssistantPrompt(),
    prompt: JSON.stringify({
      request: input.intent,
      manifest: input.context.manifest,
      sources: input.context.fragments,
      source_gate: input.sourceGate,
      output_contract: {
        format: "Return exactly one JSON object with no Markdown fences or surrounding text.",
        schema: z.toJSONSchema(outputSchemaFor(input.intent))
      }
    }),
    maxOutputTokens: ASSISTANT_LIMITS[mode].outputTokens,
    maxRetries: 0,
    abortSignal: input.signal,
    ...(sourceTools ? { tools: sourceTools, stopWhen: stepCountIs(input.sourceGate!.max_tool_calls + 1) } : {})
  });

  let resolveTerminal!: (value: AssistantModelResult) => void;
  let rejectTerminal!: (reason?: unknown) => void;
  const terminal = new Promise<AssistantModelResult>((resolve, reject) => {
    resolveTerminal = resolve;
    rejectTerminal = reject;
  });

  return {
    partials: (async function* () {
      try {
        let text = "";
        let lastPartial = "";
        for await (const chunk of result.textStream) {
          text += chunk;
          const partial = extractAssistantPartial(text);
          if (partial?.direct_answer && partial.direct_answer !== lastPartial) {
            lastPartial = partial.direct_answer;
            yield partial;
          }
        }
        const usage = await result.totalUsage;
        resolveTerminal({
          outcome: parseAssistantModelJson(text) as AssistantModelResult["outcome"],
          usage: {
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens
          }
        });
      } catch (error) {
        rejectTerminal(error);
      }
    })(),
    result: terminal
  };
}

function isAssistantModelStream(value: AssistantModelResult | AssistantModelStream): value is AssistantModelStream {
  return typeof value === "object" && value !== null && "partials" in value && "result" in value;
}

async function createSourceTools(projectSlug: string, gate: SourceGateRecord) {
  const project = await new NativePlanningStore().getProject(projectSlug);
  if (!project) throw new Error("OUTCOME_PROJECT_NOT_FOUND");
  const readTools = createAssistantReadTools({ project, gate });
  return {
    ...(gate.capabilities.includes("list_project_files") ? {
      list_project_files: tool({
        description: "List safe repository-relative source files for the approved inspection only.",
        inputSchema: z.object({ prefix: z.string().max(240).optional() }).strict(),
        execute: ({ prefix }) => readTools.list_project_files?.({ prefix })
      })
    } : {}),
    ...(gate.capabilities.includes("read_project_files") ? {
      read_project_files: tool({
        description: "Read approved safe repository-relative source files within the gate budget only.",
        inputSchema: z.object({ paths: z.array(z.string().min(1).max(240)).min(1).max(gate.max_files) }).strict(),
        execute: ({ paths }) => readTools.read_project_files?.({ paths })
      })
    } : {})
  };
}

export function createAssistantService(deps: AssistantServiceDependencies = {}) {
  const assemble = deps.assembleContext ?? assembleAssistantContext;
  const generate = deps.generate ?? generateWithMiniMax;
  const persistRun = deps.recordActivity ?? recordAssistantRun;
  const createRunId = deps.createRunId ?? randomUUID;
  const now = deps.now ?? (() => new Date());

  async function* respond(intent: AssistantRequestIntent, signal: AbortSignal): AsyncGenerator<AssistantStreamEvent> {
    const startedAt = now();
    const runId = createRunId();
    let manifestDigest = intent.expected_manifest_digest;
    let mode: AssistantMode = (intent.intent === "ask" || intent.intent === "draft_task" || intent.intent === "draft_backlog") ? intent.mode : "standard";
    let sourceGate: AssistantSourceGateState = "none";
    let terminal: AssistantRunRecord["status"] = "error";
    let errorCode: AssistantRunRecord["error_code"];
    let usage: AssistantModelResult["usage"];

    try {
      yield { type: "run_status", stage: "preparing" };
      let gate: SourceGateRecord | undefined;
      if (intent.intent === "inspect_source" || intent.intent === "answer_without_source") {
        const consumed = consumeSourceGate({
          gateId: intent.gate_id,
          projectSlug: intent.project_slug,
          questionDigest: assistantDigest(intent.question),
          manifestDigest: intent.expected_manifest_digest,
          now: now()
        });
        if (!consumed.ok) throw new Error("OUTCOME_SOURCE_GATE_REJECTED");
        gate = consumed.gate;
        mode = modeFor(intent, gate);
        sourceGate = intent.intent === "inspect_source" ? "approved" : "denied";
        if (intent.intent === "answer_without_source") rejectSourceGate({ gateId: intent.gate_id, reason: "rejected" });
      }

      const firstContext = await assemble(contextInput(intent, mode));
      manifestDigest = firstContext.manifest.manifest_digest;
      if (manifestDigest !== intent.expected_manifest_digest) throw new Error("OUTCOME_STALE_CONTEXT");

      yield { type: "run_status", stage: "generating" };
      const generatedRequest = await generate({
        context: firstContext,
        intent,
        signal,
        sourceGate: intent.intent === "inspect_source" ? gate : undefined
      });
      let generated: AssistantModelResult;
      if (isAssistantModelStream(generatedRequest)) {
        for await (const partial of generatedRequest.partials) {
          yield { type: "assistant_partial", partial };
        }
        generated = await generatedRequest.result;
      } else {
        generated = await generatedRequest;
      }
      usage = generated.usage;
      const outcome = outputSchemaFor(intent).parse(generated.outcome);
      if (intent.intent === "draft_task") {
        const draft = taskDraftSchema.parse(outcome);
        if (draft.manifest_digest !== manifestDigest) throw new Error("OUTCOME_STALE_CONTEXT");
        validateDraftCitations(draft.citation_source_ids, firstContext);
        yield { type: "run_status", stage: "validating" };
        const secondContext = await assemble(contextInput(intent, mode));
        yield { type: "task_draft", stale: secondContext.manifest.manifest_digest !== manifestDigest, draft, model: MINIMAX_TOKEN_PLAN_MODEL, mode };
        terminal = secondContext.manifest.manifest_digest !== manifestDigest ? "stale" : "complete";
        yield { type: "run_status", stage: "complete" };
        return;
      }
      if (intent.intent === "draft_backlog") {
        const proposal = backlogProposalSchema.parse(outcome);
        const { proposal_digest, ...unsigned } = proposal;
        if (proposal.manifest_digest !== manifestDigest || assistantDigest(unsigned) !== proposal_digest) throw new Error("OUTCOME_INVALID_PROPOSAL");
        validateDraftCitations(proposal.citation_source_ids, firstContext);
        yield { type: "run_status", stage: "validating" };
        const secondContext = await assemble(contextInput(intent, mode));
        yield { type: "backlog_proposal", stale: secondContext.manifest.manifest_digest !== manifestDigest, proposal, handoff: buildAssistantBacklogHandoff(proposal) };
        terminal = secondContext.manifest.manifest_digest !== manifestDigest ? "stale" : "complete";
        yield { type: "run_status", stage: "complete" };
        return;
      }
      const managementOutcome = assistantOutcomeSchema.parse(outcome);
      validateCitations(managementOutcome, firstContext);

      yield { type: "run_status", stage: "validating" };
      const secondContext = await assemble(contextInput(intent, mode));
      const stale = secondContext.manifest.manifest_digest !== manifestDigest;
      if (managementOutcome.kind === "source_access_proposal" && !stale) {
        const createdGate = createSourceGate({
          projectSlug: intent.project_slug,
          questionDigest: assistantDigest("question" in intent ? intent.question : ""),
          manifestDigest,
          mode,
          capabilities: managementOutcome.requested_capabilities,
          now: now()
        });
        sourceGate = "requested";
        yield { type: "source_access_requested", proposal: sourceGateProposal(managementOutcome, createdGate) };
      }
      terminal = stale ? "stale" : "complete";
      yield { type: "assistant_complete", stale, outcome: managementOutcome };
      yield { type: "run_status", stage: "complete" };
    } catch (error) {
      const code = safeErrorCode(error, signal);
      errorCode = code;
      terminal = code === "ABORTED" ? "incomplete" : code === "STALE_CONTEXT" ? "stale" : code === "INVALID_OUTPUT" ? "invalid_output" : "error";
      yield { type: "assistant_error", code, message: safeErrorMessage(code) };
    } finally {
      const finishedAt = now();
      await persistRun({
        run_id: runId,
        project: intent.project_slug,
        model: MINIMAX_TOKEN_PLAN_MODEL,
        mode,
        status: terminal,
        duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        ...(usage?.input_tokens !== undefined ? { input_tokens: usage.input_tokens } : {}),
        ...(usage?.output_tokens !== undefined ? { output_tokens: usage.output_tokens } : {}),
        manifest_digest: manifestDigest,
        source_gate: sourceGate,
        ...(errorCode ? { error_code: errorCode } : {})
      });
    }
  }

  return { respond };
}
