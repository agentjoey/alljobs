import { describe, expect, it } from "vitest";
import { buildModelCallAuditEvent, deterministicModelCallIds } from "./audit";
import { modelCallAuditEventSchema } from "../analysis/schemas";

const base = {
  jobId: `job_${"1".repeat(32)}`,
  captureId: `cap_${"2".repeat(32)}`,
  stage: "extraction" as const,
  provider: "kimi" as const,
  model: "k3-256k",
  attempt: 1 as const,
  inputDigest: "3".repeat(64),
  inputBytes: 123,
  occurredAt: "2026-09-16T09:00:00.000Z"
};

describe("model-call audit", () => {
  it("preserves historical IDs while separating operations for the same provider attempt", () => {
    expect(deterministicModelCallIds(base, "started")).toEqual({
      callId: "call_d95b673f81876cf3396eecc9f6f365d6",
      eventId: "mce_a3bb1179f36ebe5352b48c7b0692850e"
    });
    const visual = deterministicModelCallIds({ ...base, operation: "visual_observation" }, "started");
    const structured = deterministicModelCallIds({ ...base, operation: "schema_structuring" }, "started");
    expect(visual.callId).not.toBe(structured.callId);
    expect(visual.eventId).not.toBe(structured.eventId);
    expect(visual.callId).not.toBe(deterministicModelCallIds(base, "started").callId);
  });

  it("keeps bounded redacted metadata on terminal events and rejects raw content", () => {
    const failed = buildModelCallAuditEvent({
      ...base, operation: "visual_observation", contractVersion: "caphub-minimax-visual-v2"
    }, {
      type: "failed", errorCode: "MINIMAX_INVALID_OBSERVATION",
      finishReason: "length", outputBytes: 100, outputDigest: "4".repeat(64),
      inputTokens: 20, outputTokens: 10, validationIssuePaths: ["claims.0.source_refs"]
    });
    expect(failed).toMatchObject({
      operation: "visual_observation", contract_version: "caphub-minimax-visual-v2",
      finish_reason: "length", output_bytes: 100, output_digest: "4".repeat(64),
      input_tokens: 20, output_tokens: 10, validation_issue_paths: ["claims.0.source_refs"]
    });
    for (const field of ["observation", "prompt", "response", "reasoning", "secret"]) {
      expect(modelCallAuditEventSchema.safeParse({ ...failed, [field]: "private-content" }).success).toBe(false);
    }
    for (const metadata of [
      { contract_version: "x".repeat(129) }, { finish_reason: "x".repeat(65) },
      { output_bytes: -1 }, { output_digest: "raw-output" }, { input_tokens: -1 },
      { validation_issue_paths: Array(33).fill("$") }, { validation_issue_paths: ["x".repeat(257)] }
    ]) expect(modelCallAuditEventSchema.safeParse({ ...failed, ...metadata }).success).toBe(false);
    const started = buildModelCallAuditEvent(base, { type: "started" });
    for (const metadata of [{ output_digest: "4".repeat(64) }, { input_tokens: 1 }, { output_tokens: 1 }]) {
      expect(modelCallAuditEventSchema.safeParse({ ...started, ...metadata }).success).toBe(false);
    }
  });

  it("builds schema-valid deterministic identifiers", () => {
    const first = deterministicModelCallIds(base, "started");
    const second = deterministicModelCallIds(base, "started");
    const terminal = deterministicModelCallIds(base, "succeeded");

    expect(first).toEqual(second);
    expect(first.callId).toMatch(/^call_[a-f0-9]{32}$/);
    expect(first.eventId).toMatch(/^mce_[a-f0-9]{32}$/);
    expect(terminal.callId).toBe(first.callId);
    expect(terminal.eventId).not.toBe(first.eventId);
  });

  it("allows only redacted metadata in audit events", () => {
    const event = buildModelCallAuditEvent(base, {
      type: "succeeded",
      outputDigest: "4".repeat(64),
      inputTokens: 20,
      outputTokens: 10
    });
    const serialized = JSON.stringify(event);

    expect(event).not.toHaveProperty("input");
    expect(event).not.toHaveProperty("output");
    expect(serialized).not.toMatch(/api[_-]?key|reasoning|secret|prompt|response/i);
  });

  it("keeps the active DeepSeek provider identity in deterministic redacted audits", () => {
    const event = buildModelCallAuditEvent({
      ...base,
      stage: "research",
      provider: "deepseek",
      model: "deepseek-flash"
    }, { type: "started" });

    expect(event).toMatchObject({ provider: "deepseek", model: "deepseek-flash", type: "started" });
  });
});
