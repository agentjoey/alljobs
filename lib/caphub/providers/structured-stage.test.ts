import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type {
  StructuredProvider,
  StructuredProviderInput,
  StructuredProviderOutput
} from "./contracts";
import { ProviderInvocationError } from "./contracts";
import { runStructuredStage } from "./structured-stage";
import { InMemoryModelCallAuditStore } from "../workflow/audit";

const JOB_ID = `job_${"1".repeat(32)}`;
const CAPTURE_ID = `cap_${"2".repeat(32)}`;
const NOW = "2026-09-16T09:00:00.000Z";
const outputSchema = z.object({ answer: z.string().min(1) }).strict();

function providerWith(outputs: Array<StructuredProviderOutput | Error>) {
  const inputs: StructuredProviderInput[] = [];
  const provider: StructuredProvider = {
    provider: "kimi",
    model: "k3-256k",
    async invoke(input) {
      inputs.push(input);
      const output = outputs.shift();
      if (output instanceof Error) throw output;
      if (!output) throw new Error("unexpected provider call");
      return output;
    }
  };
  return { provider, inputs };
}

function output(value: unknown, inputTokens = 10, outputTokens = 5): StructuredProviderOutput {
  return { value, usage: { inputTokens, outputTokens } };
}

function request(provider: StructuredProvider, overrides: Record<string, unknown> = {}) {
  return {
    jobId: JOB_ID,
    captureId: CAPTURE_ID,
    stage: "extraction" as const,
    input: { source: "fixture" },
    schema: outputSchema,
    provider,
    auditStore: new InMemoryModelCallAuditStore(),
    budget: { providerCalls: 0, totalTokens: 0 },
    clock: () => NOW,
    ...overrides
  };
}

describe("runStructuredStage", () => {
  it("accepts a valid first response and records deterministic audit IDs", async () => {
    const first = providerWith([output({ answer: "ok" })]);
    const auditStore = new InMemoryModelCallAuditStore();
    const args = request(first.provider, { auditStore });

    const result = await runStructuredStage(args);

    expect(result).toEqual({ kind: "success", value: { answer: "ok" } });
    expect(first.inputs).toHaveLength(1);
    expect(args.budget).toEqual({ providerCalls: 1, totalTokens: 15 });
    expect(auditStore.events).toHaveLength(2);
    expect(auditStore.events[0]?.call_id).toBe(auditStore.events[1]?.call_id);

    const second = providerWith([output({ answer: "ok" })]);
    const secondAudit = new InMemoryModelCallAuditStore();
    await runStructuredStage(request(second.provider, { auditStore: secondAudit }));
    expect(secondAudit.events.map((event) => event.event_id)).toEqual(
      auditStore.events.map((event) => event.event_id)
    );
  });

  it("makes exactly one correction call after an invalid response", async () => {
    const fake = providerWith([
      output({ answer: "" }),
      output({ answer: "corrected" })
    ]);

    const result = await runStructuredStage(request(fake.provider));

    expect(result).toEqual({ kind: "success", value: { answer: "corrected" } });
    expect(fake.inputs).toHaveLength(2);
    expect(fake.inputs[1]).toEqual(expect.objectContaining({
      kind: "correction",
      correction: {
        originalInputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        validationIssuePaths: ["answer"],
        originalInput: { source: "fixture" }
      }
    }));
    expect(fake.inputs[1]).not.toHaveProperty("input");
    expect(JSON.stringify(fake.inputs[1])).not.toContain('"answer":""');
  });

  it("routes two invalid responses to human review", async () => {
    const fake = providerWith([output({}), output({ answer: "" })]);

    const result = await runStructuredStage(request(fake.provider));

    expect(result).toEqual({ kind: "human_review", reason: "SCHEMA_INVALID_TWICE" });
    expect(fake.inputs).toHaveLength(2);
  });

  it.each([
    ["ABORTED", "ABORTED"],
    ["TIMEOUT", "TIMEOUT"],
    ["AUTHENTICATION", "AUTHENTICATION"],
    ["BILLING", "BILLING"],
    ["PERMISSION", "PERMISSION"],
    ["UNAVAILABLE", "PROVIDER_UNAVAILABLE"],
    ["INVALID_OUTPUT", "INVALID_OUTPUT"]
  ] as const)("maps %s without a transport retry", async (code, reason) => {
    const fake = providerWith([new ProviderInvocationError(code)]);

    const result = await runStructuredStage(request(fake.provider));

    expect(result).toEqual({ kind: "human_review", reason });
    expect(fake.inputs).toHaveLength(1);
  });

  it("rejects oversized stage input before transport", async () => {
    const fake = providerWith([output({ answer: "should not run" })]);

    const result = await runStructuredStage(request(fake.provider, {
      input: { source: "x".repeat(2_097_152) }
    }));

    expect(result).toEqual({ kind: "human_review", reason: "INPUT_TOO_LARGE" });
    expect(fake.inputs).toHaveLength(0);
  });

  it("enforces the eight-call job ceiling before transport", async () => {
    const fake = providerWith([output({ answer: "should not run" })]);
    const budget = { providerCalls: 8, totalTokens: 0 };

    const result = await runStructuredStage(request(fake.provider, { budget }));

    expect(result).toEqual({ kind: "human_review", reason: "PROVIDER_CALL_LIMIT" });
    expect(fake.inputs).toHaveLength(0);
  });

  it("counts a correction against the shared call ceiling", async () => {
    const fake = providerWith([output({ answer: "" }), output({ answer: "blocked" })]);
    const budget = { providerCalls: 7, totalTokens: 0 };

    const result = await runStructuredStage(request(fake.provider, { budget }));

    expect(result).toEqual({ kind: "human_review", reason: "PROVIDER_CALL_LIMIT" });
    expect(fake.inputs).toHaveLength(1);
    expect(budget.providerCalls).toBe(8);
  });

  it("enforces the terminal 256,000-token ceiling", async () => {
    const fake = providerWith([output({ answer: "over" }, 1, 1)]);
    const budget = { providerCalls: 0, totalTokens: 255_999 };

    const result = await runStructuredStage(request(fake.provider, { budget }));

    expect(result).toEqual({ kind: "human_review", reason: "TOKEN_LIMIT" });
    expect(budget).toEqual({ providerCalls: 1, totalTokens: 256_001 });
  });

  it("enforces its deadline and does not retry", async () => {
    vi.useFakeTimers();
    try {
      const inputs: StructuredProviderInput[] = [];
      const provider: StructuredProvider = {
        provider: "kimi",
        model: "k3-256k",
        invoke(input) {
          inputs.push(input);
          return new Promise(() => undefined);
        }
      };
      const promise = runStructuredStage(request(provider, { timeoutMs: 5 }));
      await vi.advanceTimersByTimeAsync(5);

      await expect(promise).resolves.toEqual({ kind: "human_review", reason: "TIMEOUT" });
      expect(inputs).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
