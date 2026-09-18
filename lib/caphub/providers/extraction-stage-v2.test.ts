import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPHUB_ANALYSIS_LIMITS } from "../analysis/limits";
import { extractionResultSchema } from "../analysis/schemas";
import type { AnalysisStage, ModelCallAuditEvent, PreprocessResult } from "../analysis/types";
import { InMemoryModelCallAuditStore } from "../workflow/audit";
import type { ModelCallAuditStore } from "../workflow/contracts";
import { FilesystemAnalysisJobStore, FilesystemModelCallAuditStore, FilesystemStageArtifactStore } from "../workflow/filesystem";
import { AnalysisWorkflowRunner, type AnalysisStageHandler } from "../workflow/runner";
import { ProviderInvocationError } from "./contracts";
import { DeepSeekProvider } from "./deepseek";
import { DeepSeekResponsesAdapter, type DeepSeekFetch } from "./deepseek-responses";
import { MiniMaxProvider, type MiniMaxGenerate, type MiniMaxGenerationRequest, type MiniMaxGenerationResult } from "./minimax";
import { runExtractionStageV2 } from "./extraction-stage-v2";

const JOB_ID = `job_${"a".repeat(32)}`;
const CAPTURE_ID = `cap_${"b".repeat(32)}`;
const ARTIFACT_ID = `art_${"c".repeat(64)}`;
const NOW = "2026-09-18T01:00:00.000Z";
const OBSERVATION = "Image 0 visibly shows Example; OCR block 0 names Example. RAW_OBSERVATION_ONLY";
const roots: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

const preprocess: PreprocessResult = {
  schema_version: 1, capture_id: CAPTURE_ID,
  images: [{
    index: 0,
    source_object: { algorithm: "sha256", digest: "d".repeat(64), key: `sha256/dd/${"d".repeat(64)}`, bytes: 128 },
    original_digest: "d".repeat(64), normalized_digest: "e".repeat(64), width: 1280, height: 720,
    orientation_applied: 1, perceptual_hash: "0123456789abcdef",
    quality: { sharpness: 12.5, black_border_ratio: 0.01, ocr_usable: true }, regions: [],
    ocr_blocks: [{ text: "Example", confidence: 0.98, bbox: { x: 10, y: 10, width: 200, height: 40 } }],
    barcode_payloads: []
  }],
  indicators: { urls: [], repositories: [], packages: [], commands: [] },
  duplicate_groups: [], near_duplicate_groups: [], privacy_suggestions: [], created_at: NOW
};
const draft = {
  schema_version: 2,
  claims: [{ statement: "Example is visible.", basis: "visible", confidence: 0.8, source_refs: [{ kind: "image", image_index: 0 }] }],
  entities: [{ name: "Example", aliases: [] }], experience_fragments: [], explicit_urls: [], unresolved_questions: []
};

function envelope(output: unknown = draft) {
  return {
    id: "resp_fixture", object: "response", status: "completed", model: "deepseek-flash",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    usage: { input_tokens: 30, output_tokens: 10 }
  };
}

function setup(options: {
  miniResult?: Partial<MiniMaxGenerationResult>;
  generate?: MiniMaxGenerate;
  payload?: unknown;
  fetch?: DeepSeekFetch;
} = {}) {
  const miniMaxRequests: MiniMaxGenerationRequest[] = [];
  const generate: MiniMaxGenerate = async (request) => {
    miniMaxRequests.push(request);
    return options.generate ? options.generate(request) : {
      text: OBSERVATION, finishReason: "stop", usage: { inputTokens: 20, outputTokens: 10 }, ...options.miniResult
    };
  };
  const deepSeekFetch = vi.fn<DeepSeekFetch>(options.fetch ?? (async () => Response.json(options.payload ?? envelope())));
  const auditStore = new InMemoryModelCallAuditStore();
  const request = {
    jobId: JOB_ID, captureId: CAPTURE_ID, preprocessArtifactId: ARTIFACT_ID,
    input: { preprocess, normalizedImages: [{ index: 0, mediaType: "image/png" as const, data: new Uint8Array([137, 80, 78, 71]) }] },
    miniMax: new MiniMaxProvider({ generate }),
    deepSeek: new DeepSeekProvider({ adapter: new DeepSeekResponsesAdapter({ apiKey: "TEST_SECRET", fetch: deepSeekFetch }) }),
    auditStore, budget: { providerCalls: 0, totalTokens: 0 }, clock: () => NOW
  };
  return { request, miniMaxRequests, deepSeekFetch, events: auditStore.events };
}

function assertRedacted(events: ModelCallAuditEvent[]) {
  const text = JSON.stringify(events);
  expect(text).not.toContain(OBSERVATION);
  expect(text).not.toContain("Example is visible");
  expect(text).not.toContain("TEST_SECRET");
  expect(text).not.toMatch(/"(?:prompt|response|reasoning|observation|input|output)":/);
}

async function workflow(fixture: ReturnType<typeof setup>, crashTerminal?: "minimax" | "deepseek") {
  const owned = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "alljobs-extraction-v2-")));
  roots.push(owned);
  const root = join(owned, "home", "state", "caphub");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  const jobs = new FilesystemAnalysisJobStore(root);
  const artifacts = new FilesystemStageArtifactStore(root);
  const audits = new FilesystemModelCallAuditStore(root);
  await jobs.put({ schema_version: 1, id: JOB_ID, capture_id: CAPTURE_ID, input_digest: "f".repeat(64),
    completed_artifact_ids: [], status: "queued", created_at: NOW, updated_at: NOW });
  const auditStore: ModelCallAuditStore = crashTerminal ? {
    async append(event) {
      if (event.type !== "started" && event.provider === crashTerminal) throw new Error("injected interrupted terminal persistence");
      await audits.append(event);
    }
  } : audits;
  const stages: AnalysisStage[] = ["preprocess", "extraction", "research", "assessment", "critic", "review_packet"];
  const executedStages: AnalysisStage[] = [];
  const handlers: AnalysisStageHandler[] = stages.map((stage) => ({ stage, async run(context) {
    executedStages.push(stage);
    if (stage === "preprocess") return { kind: "success", inputDigest: "f".repeat(64), payload: preprocess };
    if (stage !== "extraction") return { kind: "human_review", reason: "TEST_AFTER_EXTRACTION" };
    const result = await runExtractionStageV2({
      ...fixture.request, auditStore, signal: context.signal,
      preprocessArtifactId: context.completedArtifacts.find((artifact) => artifact.stage === "preprocess")!.id
    });
    return result.kind === "success" ? { kind: "success", inputDigest: "f".repeat(64), payload: result.value } : result;
  } }));
  const runner = new AnalysisWorkflowRunner({ jobs, artifacts, audits, handlers, clock: () => NOW });
  return { jobs, artifacts, audits, runner, executedStages };
}

describe("atomic extraction v2 through real provider adapters", () => {
  it("composes one observation and one native structured response with distinct redacted audit pairs", async () => {
    const f = setup();
    const result = await runExtractionStageV2(f.request);
    expect(result.kind).toBe("success");
    if (result.kind !== "success") throw new Error("expected composed extraction");
    expect(extractionResultSchema.parse(result.value)).toMatchObject({ capture_id: CAPTURE_ID, preprocess_artifact_id: ARTIFACT_ID,
      claims: [{ statement: "Example is visible.", id: expect.stringMatching(/^clm_[a-f0-9]{32}$/), evidence_ids: [expect.stringMatching(/^ev_[a-f0-9]{32}$/)] }] });
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.miniMaxRequests[0]).toMatchObject({ maxRetries: 0, maxOutputTokens: 1800 });
    expect(f.deepSeekFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(f.deepSeekFetch.mock.calls[0][1].body));
    expect(body).toMatchObject({ model: "deepseek-flash", stream: false, reasoning: { effort: "none" }, text: { format: { type: "json_schema", name: "caphub_extraction" } } });
    expect(body.input).toContain(OBSERVATION);
    expect(JSON.stringify(body)).not.toMatch(/dataBase64|image\/png|normalizedImages|TEST_SECRET|"tools"/);
    expect(f.request.budget).toEqual({ providerCalls: 2, totalTokens: 70 });
    expect(f.events.map((event) => [event.provider, event.operation, event.type])).toEqual([
      ["minimax", "visual_observation", "started"], ["minimax", "visual_observation", "succeeded"],
      ["deepseek", "schema_structuring", "started"], ["deepseek", "schema_structuring", "succeeded"]
    ]);
    expect(f.events[0].call_id).toBe(f.events[1].call_id);
    expect(f.events[2].call_id).toBe(f.events[3].call_id);
    expect(f.events[0].call_id).not.toBe(f.events[2].call_id);
    assertRedacted(f.events);
  });

  it.each([
    ["blank", { text: "  " }], ["truncated", { finishReason: "length" }],
    ["oversized", { text: "x".repeat(65_537) }],
    ["malformed usage", { usage: { inputTokens: undefined, outputTokens: 1 } }]
  ])("closes MiniMax %s before DeepSeek with only parsed-envelope metadata", async (_name, miniResult) => {
    const f = setup({ miniResult });
    expect(await runExtractionStageV2(f.request)).toEqual({ kind: "human_review", reason: "MINIMAX_INVALID_OBSERVATION" });
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.deepSeekFetch).not.toHaveBeenCalled();
    expect(f.events).toHaveLength(2);
    expect(f.events[1]).toMatchObject({ type: "failed", error_code: "MINIMAX_INVALID_OBSERVATION", output_digest: expect.stringMatching(/^[a-f0-9]{64}$/), output_bytes: expect.any(Number) });
    if (_name === "malformed usage") {
      expect(f.events[1]).not.toHaveProperty("input_tokens");
      expect(f.events[1]).not.toHaveProperty("output_tokens");
      expect(f.request.budget.totalTokens).toBe(0);
    } else {
      expect(f.events[1]).toMatchObject({ input_tokens: 20, output_tokens: 10 });
      expect(f.request.budget.totalTokens).toBe(30);
    }
    assertRedacted(f.events);
  });

  it.each([
    ["incomplete envelope", { ...envelope(), status: "incomplete" }],
    ["invalid JSON", { ...envelope(), output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "RAW_OUTPUT" }] }] }],
    ["invalid schema", envelope({ ...draft, claims: Array.from({ length: 40 }, () => ({ ...draft.claims[0], confidence: "PRIVATE_REASONING" })) })],
    ["malformed usage", { ...envelope(), usage: { input_tokens: -1, output_tokens: 1 } }]
  ])("closes DeepSeek %s without correction or unavailable metadata", async (name, payload) => {
    const f = setup({ payload });
    expect(await runExtractionStageV2(f.request)).toEqual({ kind: "human_review", reason: "DEEPSEEK_STRUCTURE_FAILED" });
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.deepSeekFetch).toHaveBeenCalledTimes(1);
    expect(f.events).toHaveLength(4);
    expect(f.events[3]).toMatchObject({ type: "failed", error_code: "DEEPSEEK_STRUCTURE_FAILED" });
    expect(f.events[3]).not.toHaveProperty("input_tokens");
    expect(f.events[3]).not.toHaveProperty("output_digest");
    if (name === "invalid schema" && f.events[3].type === "failed") {
      expect(f.events[3].validation_issue_paths).toHaveLength(32);
      expect(f.events[3].validation_issue_paths).toContain("claims.0.confidence");
      expect(f.events[3].validation_issue_paths).toEqual([...f.events[3].validation_issue_paths!].sort());
    }
    expect(JSON.stringify(f.events)).not.toMatch(/PRIVATE_REASONING|RAW_OUTPUT/);
    assertRedacted(f.events);
  });

  it("records host locator failure as the one DeepSeek terminal event", async () => {
    const f = setup({ payload: envelope({ ...draft, claims: [{ ...draft.claims[0], source_refs: [{ kind: "image", image_index: 99 }] }] }) });
    expect(await runExtractionStageV2(f.request)).toEqual({ kind: "human_review", reason: "HOST_EXTRACTION_LINKAGE_FAILED" });
    expect(f.deepSeekFetch).toHaveBeenCalledTimes(1);
    expect(f.events).toHaveLength(4);
    expect(f.events[3]).toMatchObject({ type: "failed", error_code: "HOST_EXTRACTION_LINKAGE_FAILED", input_tokens: 30, output_tokens: 10 });
    assertRedacted(f.events);
  });

  it("closes invalid composed V1 linkage inside extraction before success", async () => {
    const f = setup();
    expect(await runExtractionStageV2({ ...f.request, preprocessArtifactId: "invalid-host-artifact" }))
      .toEqual({ kind: "human_review", reason: "HOST_EXTRACTION_LINKAGE_FAILED" });
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.deepSeekFetch).toHaveBeenCalledTimes(1);
    expect(f.events.at(-1)).toMatchObject({ type: "failed", error_code: "HOST_EXTRACTION_LINKAGE_FAILED" });
    assertRedacted(f.events);
  });

  it.each([[8, 0], [7, 1]])("enforces the shared call ceiling starting at %i", async (providerCalls, calls) => {
    const f = setup();
    f.request.budget.providerCalls = providerCalls;
    expect(await runExtractionStageV2(f.request)).toEqual({ kind: "human_review", reason: "PROVIDER_CALL_LIMIT" });
    expect(f.miniMaxRequests).toHaveLength(calls);
    expect(f.deepSeekFetch).not.toHaveBeenCalled();
    expect(f.request.budget.providerCalls).toBe(8);
    expect(f.events).toHaveLength(calls * 2);
  });

  it.each([[256_000, 0, 0, 256_000], [255_980, 1, 0, 256_010], [255_950, 1, 1, 256_020]])(
    "enforces the shared token ceiling starting at %i", async (totalTokens, miniCalls, deepCalls, finalTokens) => {
      const f = setup();
      f.request.budget.totalTokens = totalTokens;
      expect(await runExtractionStageV2(f.request)).toEqual({ kind: "human_review", reason: "TOKEN_LIMIT" });
      expect(f.miniMaxRequests).toHaveLength(miniCalls);
      expect(f.deepSeekFetch).toHaveBeenCalledTimes(deepCalls);
      expect(f.request.budget.totalTokens).toBe(finalTokens);
      expect(f.events).toHaveLength((miniCalls + deepCalls) * 2);
      if (miniCalls) expect(f.events.at(-1)).toMatchObject({ type: "failed", error_code: "POLICY_DENIED", output_digest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    }
  );

  it("rejects oversized binary extraction input before transport", async () => {
    const f = setup();
    f.request.input.normalizedImages[0].data = new Uint8Array(2_097_152);
    expect(await runExtractionStageV2(f.request)).toEqual({ kind: "human_review", reason: "INPUT_TOO_LARGE" });
    expect(f.miniMaxRequests).toHaveLength(0);
    expect(f.deepSeekFetch).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
  });

  it("checks the second input byte budget before sending the observation to DeepSeek", async () => {
    const f = setup({ miniResult: { text: "x".repeat(4096) } });
    f.request.input.preprocess = structuredClone(preprocess);
    f.request.input.preprocess.images[0].ocr_blocks[0].text = "x".repeat(2_097_152 - 2_000);
    expect(await runExtractionStageV2(f.request)).toEqual({ kind: "human_review", reason: "INPUT_TOO_LARGE" });
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.deepSeekFetch).not.toHaveBeenCalled();
    expect(f.events.map((event) => event.type)).toEqual(["started", "succeeded"]);
  });

  it("sends nothing when the started audit cannot be persisted", async () => {
    const f = setup();
    await expect(runExtractionStageV2({ ...f.request, auditStore: {
      async append() { throw new Error("injected audit unavailable"); }
    } })).rejects.toThrow("injected audit unavailable");
    expect(f.miniMaxRequests).toHaveLength(0);
    expect(f.deepSeekFetch).not.toHaveBeenCalled();
    expect(f.request.budget.providerCalls).toBe(0);
  });

  it("honors cancellation between operations before a second started audit", async () => {
    const f = setup();
    const controller = new AbortController();
    const originalStore = f.request.auditStore;
    const result = await runExtractionStageV2({ ...f.request, signal: controller.signal, auditStore: {
      async append(event) {
        await originalStore.append(event);
        if (event.type === "succeeded") controller.abort();
      }
    } });
    expect(result).toEqual({ kind: "human_review", reason: "ABORTED" });
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.deepSeekFetch).not.toHaveBeenCalled();
    expect(f.events.map((event) => event.type)).toEqual(["started", "succeeded"]);
  });

  it.each(["minimax", "deepseek"] as const)("enforces the %s deadline even if transport ignores abort", async (provider) => {
    vi.useFakeTimers();
    const never = () => new Promise<never>(() => undefined);
    const f = setup(provider === "minimax" ? { generate: never } : { fetch: never });
    const promise = runExtractionStageV2(f.request);
    await vi.advanceTimersByTimeAsync(CAPHUB_ANALYSIS_LIMITS.providerTimeoutMs[provider]);
    await expect(promise).resolves.toEqual({ kind: "human_review", reason: "TIMEOUT" });
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.deepSeekFetch).toHaveBeenCalledTimes(provider === "minimax" ? 0 : 1);
    expect(f.events.at(-1)).toMatchObject({ type: "failed", error_code: "TIMEOUT" });
    const signal = provider === "minimax" ? f.miniMaxRequests[0].abortSignal : f.deepSeekFetch.mock.calls[0][1].signal;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("avoids all calls when already aborted", async () => {
    const f = setup();
    expect(await runExtractionStageV2({ ...f.request, signal: AbortSignal.abort("PRIVATE_ABORT") })).toEqual({ kind: "human_review", reason: "ABORTED" });
    expect(f.miniMaxRequests).toHaveLength(0);
    expect(f.deepSeekFetch).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
  });

  it.each(["minimax", "deepseek"] as const)("propagates abort through the %s transport without retry", async (provider) => {
    const controller = new AbortController();
    const stop = () => { controller.abort("PRIVATE_ABORT"); return new Promise<never>(() => undefined); };
    const f = setup(provider === "minimax" ? { generate: stop } : { fetch: stop });
    expect(await runExtractionStageV2({ ...f.request, signal: controller.signal })).toEqual({ kind: "human_review", reason: "ABORTED" });
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.deepSeekFetch).toHaveBeenCalledTimes(provider === "minimax" ? 0 : 1);
    expect(f.events.at(-1)).toMatchObject({ type: "failed", error_code: "POLICY_DENIED" });
    expect(JSON.stringify(f.events)).not.toContain("PRIVATE_ABORT");
  });

  it.each([["AUTHENTICATION", "AUTHENTICATION"], ["BILLING", "QUOTA"], ["UNAVAILABLE", "PROVIDER_UNAVAILABLE"]] as const)(
    "keeps MiniMax %s closed with no envelope metadata", async (code, auditCode) => {
      const f = setup({ generate: async () => { throw new ProviderInvocationError(code, { cause: new Error("PRIVATE_CAUSE") }); } });
      expect(await runExtractionStageV2(f.request)).toEqual({ kind: "human_review", reason: code === "UNAVAILABLE" ? "PROVIDER_UNAVAILABLE" : code });
      expect(f.miniMaxRequests).toHaveLength(1);
      expect(f.deepSeekFetch).not.toHaveBeenCalled();
      expect(f.events[1]).toMatchObject({ type: "failed", error_code: auditCode });
      expect(f.events[1]).not.toHaveProperty("output_digest");
      expect(f.events[1]).not.toHaveProperty("input_tokens");
      expect(JSON.stringify(f.events)).not.toContain("PRIVATE_CAUSE");
    }
  );

  it("persists only host-composed extraction through the real workflow store boundary", async () => {
    const f = setup({ payload: envelope({ ...draft,
      entities: [{ name: "Example", aliases: [], repository: "https://example.com/repo" }]
    }) });
    const stores = await workflow(f);
    expect(await stores.runner.runAnalysisJob(JOB_ID, new AbortController().signal)).toMatchObject({ status: "HUMAN_REVIEW_REQUIRED", reason: "TEST_AFTER_EXTRACTION" });
    const artifact = await stores.artifacts.findByJobStage(JOB_ID, "extraction");
    expect(artifact).not.toBeNull();
    const payload = extractionResultSchema.parse(await stores.artifacts.readPayload(artifact!.id));
    expect(payload.preprocess_artifact_id).toBe((await stores.artifacts.findByJobStage(JOB_ID, "preprocess"))!.id);
    expect(payload.claims[0].statement).toBe("Example is visible.");
    expect(payload.entities[0].repository).toBe("https://example.com/repo");
    expect(JSON.stringify(payload)).not.toContain(OBSERVATION);
    assertRedacted(await stores.audits.list(JOB_ID));
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.deepSeekFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["observation", { miniResult: { text: "" } }, "MINIMAX_INVALID_OBSERVATION", 0],
    ["structure", { payload: envelope({}) }, "DEEPSEEK_STRUCTURE_FAILED", 1],
    ["non-HTTPS repository", { payload: envelope({ ...draft, entities: [{ name: "Example", aliases: [], repository: "http://example.com/repo" }] }) }, "DEEPSEEK_STRUCTURE_FAILED", 1],
    ["locator", { payload: envelope({ ...draft, claims: [{ ...draft.claims[0], source_refs: [{ kind: "image", image_index: 9 }] }] }) }, "HOST_EXTRACTION_LINKAGE_FAILED", 1]
  ] as const)("persists Human Review for %s failure without an extraction artifact or replay", async (_name, options, reason, deepCalls) => {
    const f = setup(options);
    const stores = await workflow(f);
    const result = await stores.runner.runAnalysisJob(JOB_ID, new AbortController().signal);
    expect(result).toMatchObject({ status: "HUMAN_REVIEW_REQUIRED", reason, stage: "extraction" });
    expect(stores.executedStages).toEqual(["preprocess", "extraction"]);
    await expect(stores.artifacts.findByJobStage(JOB_ID, "extraction")).resolves.toBeNull();
    await expect(stores.runner.runAnalysisJob(JOB_ID, new AbortController().signal)).resolves.toEqual(result);
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.deepSeekFetch).toHaveBeenCalledTimes(deepCalls);
    const events = await stores.audits.list(JOB_ID);
    expect(events.find((event) => event.type === "failed")).toMatchObject({ error_code: reason });
    if (_name === "non-HTTPS repository") {
      expect(events.find((event) => event.type === "failed")).toMatchObject({
        validation_issue_paths: ["entities.0.repository"]
      });
    }
    assertRedacted(events);
  });

  it.each([[401, "AUTHENTICATION", "AUTHENTICATION"], [402, "BILLING", "QUOTA"]] as const)(
    "persists MiniMax SDK HTTP %i as %s without DeepSeek or research", async (status, reason, auditCode) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
        error: { message: "PRIVATE_RESPONSE TEST_SECRET", type: "invalid_request_error", code: "synthetic_failure" }
      }, { status, headers: { "x-private": "PRIVATE_HEADER" } }));
      vi.stubGlobal("fetch", fetch);
      const f = setup();
      f.request.miniMax = new MiniMaxProvider({ apiKey: "TEST_SECRET" });
      const stores = await workflow(f);
      const result = await stores.runner.runAnalysisJob(JOB_ID, new AbortController().signal);
      expect(result).toMatchObject({ status: "HUMAN_REVIEW_REQUIRED", reason, stage: "extraction" });
      expect(stores.executedStages).toEqual(["preprocess", "extraction"]);
      await expect(stores.artifacts.findByJobStage(JOB_ID, "extraction")).resolves.toBeNull();
      await expect(stores.runner.runAnalysisJob(JOB_ID, new AbortController().signal)).resolves.toEqual(result);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][0]).toBe("https://api.minimax.io/v1/chat/completions");
      expect(f.deepSeekFetch).not.toHaveBeenCalled();
      const events = await stores.audits.list(JOB_ID);
      expect(events).toHaveLength(2);
      expect(events.find((event) => event.type === "failed")).toMatchObject({
        provider: "minimax", operation: "visual_observation", error_code: auditCode
      });
      expect(JSON.stringify({ result, events })).not.toMatch(/PRIVATE_RESPONSE|PRIVATE_HEADER|TEST_SECRET|synthetic_failure/);
      assertRedacted(events);
    }
  );

  it.each(["minimax", "deepseek"] as const)("retains an unmatched %s start after terminal persistence interruption and never replays", async (provider) => {
    const f = setup();
    const stores = await workflow(f, provider);
    const result = await stores.runner.runAnalysisJob(JOB_ID, new AbortController().signal);
    expect(result).toMatchObject({ status: "HUMAN_REVIEW_REQUIRED", reason: "INTERRUPTED_PROVIDER_CALL", stage: "extraction" });
    const events = await stores.audits.list(JOB_ID);
    expect(events).toHaveLength(provider === "minimax" ? 1 : 3);
    expect(events.at(-1)).toMatchObject({ type: "started", provider });
    await expect(stores.artifacts.findByJobStage(JOB_ID, "extraction")).resolves.toBeNull();
    await expect(stores.runner.runAnalysisJob(JOB_ID, new AbortController().signal)).resolves.toEqual(result);
    expect(f.miniMaxRequests).toHaveLength(1);
    expect(f.deepSeekFetch).toHaveBeenCalledTimes(provider === "minimax" ? 0 : 1);
  });
});
