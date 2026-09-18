import { describe, expect, it } from "vitest";
import { buildModelCallAuditEvent, deterministicModelCallIds } from "./audit";

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
