import { describe, expect, it, vi } from "vitest";
import { InMemoryModelCallAuditStore } from "../workflow/audit";
import type { JobModelBudget } from "../workflow/contracts";
import { ProviderInvocationError } from "./contracts";
import type { MiniMaxWebSearchInput, MiniMaxWebSearchResult } from "./minimax-web-search";
import { runWebSearchStage } from "./web-search-stage";

const input: MiniMaxWebSearchInput = {
  query: "Example Tool official documentation",
  entityDomains: ["docs.example.com"]
};

const success: MiniMaxWebSearchResult = {
  candidates: [{
    url: "https://docs.example.com/tool",
    title: "Example Tool documentation",
    sourceKind: "official",
    claims: ["Example Tool supports agents."],
    content: "Example Tool supports agents."
  }],
  usage: { inputTokens: 120, outputTokens: 40 },
  finishReason: "stop",
  outputBytes: 37
};

function request(options: {
  search?: (input: MiniMaxWebSearchInput, options: { signal: AbortSignal }) => Promise<MiniMaxWebSearchResult>;
  budget?: JobModelBudget;
  signal?: AbortSignal;
  timeoutMs?: number;
} = {}) {
  const audits = new InMemoryModelCallAuditStore();
  const budget = options.budget ?? { providerCalls: 0, totalTokens: 0 };
  const search = vi.fn(options.search ?? (async () => success));
  return {
    audits,
    budget,
    search,
    value: {
      jobId: `job_${"1".repeat(32)}`,
      captureId: `cap_${"2".repeat(32)}`,
      input,
      provider: { provider: "minimax" as const, model: "MiniMax-M3" as const, search },
      auditStore: audits,
      budget,
      clock: () => "2026-09-18T11:00:00.000Z",
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {})
    }
  };
}

describe("runWebSearchStage", () => {
  it("records one successful search and joins the shared job budget", async () => {
    const fixture = request();
    await expect(runWebSearchStage(fixture.value)).resolves.toEqual({
      kind: "success",
      value: success.candidates
    });
    expect(fixture.search).toHaveBeenCalledTimes(1);
    expect(fixture.budget).toEqual({ providerCalls: 1, totalTokens: 160 });
    expect(fixture.audits.events.map((event) => ({
      stage: event.stage,
      provider: event.provider,
      operation: event.operation,
      contractVersion: event.contract_version,
      attempt: event.attempt,
      type: event.type
    }))).toEqual([
      { stage: "research", provider: "minimax", operation: "web_search", contractVersion: "caphub-minimax-web-search-v1", attempt: 1, type: "started" },
      { stage: "research", provider: "minimax", operation: "web_search", contractVersion: "caphub-minimax-web-search-v1", attempt: 1, type: "succeeded" }
    ]);
    expect(fixture.audits.events[1]).toMatchObject({
      input_tokens: 120,
      output_tokens: 40,
      output_bytes: 37,
      finish_reason: "stop",
      output_digest: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });

  it("stops before the provider when the call or token budget is exhausted", async () => {
    const callBudget = request({ budget: { providerCalls: 8, totalTokens: 0 } });
    await expect(runWebSearchStage(callBudget.value)).resolves.toEqual({ kind: "human_review", reason: "PROVIDER_CALL_LIMIT" });
    expect(callBudget.search).not.toHaveBeenCalled();
    expect(callBudget.audits.events).toEqual([]);

    const tokenBudget = request({ budget: { providerCalls: 0, totalTokens: 256_000 } });
    await expect(runWebSearchStage(tokenBudget.value)).resolves.toEqual({ kind: "human_review", reason: "TOKEN_LIMIT" });
    expect(tokenBudget.search).not.toHaveBeenCalled();
  });

  it.each([
    ["AUTHENTICATION", "AUTHENTICATION", "AUTHENTICATION"],
    ["BILLING", "BILLING", "QUOTA"],
    ["UNAVAILABLE", "PROVIDER_UNAVAILABLE", "PROVIDER_UNAVAILABLE"],
    ["INVALID_OUTPUT", "INVALID_OUTPUT", "INVALID_OUTPUT"]
  ] as const)("maps %s without retry", async (code, reason, auditCode) => {
    const fixture = request({ search: async () => { throw new ProviderInvocationError(code); } });
    await expect(runWebSearchStage(fixture.value)).resolves.toEqual({ kind: "human_review", reason });
    expect(fixture.search).toHaveBeenCalledTimes(1);
    expect(fixture.audits.events).toHaveLength(2);
    expect(fixture.audits.events[1]).toMatchObject({ type: "failed", error_code: auditCode });
  });

  it("times out once and rejects an empty provider result", async () => {
    const timeout = request({
      timeoutMs: 5,
      search: async () => await new Promise(() => undefined)
    });
    await expect(runWebSearchStage(timeout.value)).resolves.toEqual({ kind: "human_review", reason: "TIMEOUT" });
    expect(timeout.search).toHaveBeenCalledTimes(1);
    expect(timeout.audits.events[1]).toMatchObject({ type: "failed", error_code: "TIMEOUT" });

    const empty = request({ search: async () => ({ ...success, candidates: [] }) });
    await expect(runWebSearchStage(empty.value)).resolves.toEqual({ kind: "human_review", reason: "INVALID_OUTPUT" });
    expect(empty.search).toHaveBeenCalledTimes(1);
    expect(empty.audits.events[1]).toMatchObject({ type: "failed", error_code: "INVALID_OUTPUT" });
  });

  it("stops when returned usage crosses the total-token limit", async () => {
    const fixture = request({
      budget: { providerCalls: 0, totalTokens: 255_900 },
      search: async () => ({ ...success, usage: { inputTokens: 120, outputTokens: 40 } })
    });
    await expect(runWebSearchStage(fixture.value)).resolves.toEqual({ kind: "human_review", reason: "TOKEN_LIMIT" });
    expect(fixture.budget).toEqual({ providerCalls: 1, totalTokens: 256_060 });
    expect(fixture.audits.events[1]).toMatchObject({ type: "failed", error_code: "POLICY_DENIED" });
  });
});
