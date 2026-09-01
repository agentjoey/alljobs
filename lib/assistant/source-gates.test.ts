import { describe, expect, it } from "vitest";
import {
  consumeSourceGate,
  createSourceGate,
  rejectSourceGate,
  type SourceGateRecord
} from "./source-gates";

const QUESTION = "q".repeat(64);
const MANIFEST = "m".repeat(64);
const NOW = new Date("2026-09-01T00:00:00.000Z");

function makeGate(
  overrides: Partial<{
    projectSlug: string;
    questionDigest: string;
    manifestDigest: string;
    mode: "standard" | "deep";
    capabilities: readonly ["list_project_files"] | readonly ["read_project_files"] | readonly ["list_project_files", "read_project_files"];
    now: Date;
  }> = {}
): SourceGateRecord {
  return createSourceGate({
    projectSlug: "alljobs",
    questionDigest: QUESTION,
    manifestDigest: MANIFEST,
    mode: "standard",
    now: NOW,
    ...overrides
  });
}

function consume(
  gate: SourceGateRecord,
  overrides: Partial<{
    projectSlug: string;
    questionDigest: string;
    manifestDigest: string;
    now: Date;
  }> = {}
) {
  return consumeSourceGate({
    gateId: gate.gate_id,
    projectSlug: "alljobs",
    questionDigest: QUESTION,
    manifestDigest: MANIFEST,
    now: NOW,
    ...overrides
  });
}

describe("createSourceGate", () => {
  it("creates a standard-mode gate with the fixed source budgets", () => {
    const gate = makeGate();

    expect(gate.gate_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(gate.project_slug).toBe("alljobs");
    expect(gate.capabilities).toEqual(["list_project_files", "read_project_files"]);
    expect(gate.max_files).toBe(6);
    expect(gate.max_bytes).toBe(192 * 1024);
    expect(gate.max_tool_calls).toBe(4);
    expect(gate.expires_at).toBe("2026-09-01T00:10:00.000Z");
  });

  it("creates a deep-mode gate with the larger source budgets", () => {
    const gate = makeGate({ mode: "deep" });

    expect(gate.max_files).toBe(12);
    expect(gate.max_bytes).toBe(384 * 1024);
    expect(gate.max_tool_calls).toBe(8);
  });

  it("binds only the capability set that the model requested", () => {
    const gate = makeGate({ capabilities: ["list_project_files"] });
    expect(gate.capabilities).toEqual(["list_project_files"]);
  });

  it("stores only digests, never the question text", () => {
    const gate = createSourceGate({
      projectSlug: "alljobs",
      questionDigest: "a".repeat(64),
      manifestDigest: "b".repeat(64),
      mode: "standard",
      now: NOW
    });

    const serialized = JSON.stringify(gate);
    expect(serialized).not.toContain("What is the architecture?");
    expect(serialized).not.toContain("history");
    expect(serialized).toContain("a".repeat(64));
    expect(serialized).toContain("b".repeat(64));
  });
});

describe("consumeSourceGate", () => {
  it("consumes once with matching Project/question/manifest digests", () => {
    const gate = makeGate();
    expect(consume(gate)).toMatchObject({ ok: true, gate: expect.objectContaining({ gate_id: gate.gate_id }) });
  });

  it("refuses a second consume as SOURCE_GATE_CONSUMED", () => {
    const gate = makeGate();
    expect(consume(gate).ok).toBe(true);
    expect(consume(gate)).toMatchObject({ ok: false, code: "SOURCE_GATE_CONSUMED" });
  });

  it("rejects a Project mismatch", () => {
    const gate = makeGate();
    expect(consume(gate, { projectSlug: "other-project" })).toMatchObject({
      ok: false,
      code: "SOURCE_GATE_PROJECT_MISMATCH"
    });
  });

  it("rejects a question digest mismatch", () => {
    const gate = makeGate();
    expect(consume(gate, { questionDigest: "x".repeat(64) })).toMatchObject({
      ok: false,
      code: "SOURCE_GATE_QUESTION_MISMATCH"
    });
  });

  it("rejects a manifest digest mismatch", () => {
    const gate = makeGate();
    expect(consume(gate, { manifestDigest: "y".repeat(64) })).toMatchObject({
      ok: false,
      code: "SOURCE_GATE_MANIFEST_MISMATCH"
    });
  });

  it("rejects an expired gate as SOURCE_GATE_EXPIRED", () => {
    const gate = makeGate();
    const afterExpiry = new Date(NOW.getTime() + 10 * 60 * 1000 + 1000);
    expect(consume(gate, { now: afterExpiry })).toMatchObject({ ok: false, code: "SOURCE_GATE_EXPIRED" });
  });

  it("rejects an unknown gate id as SOURCE_GATE_NOT_FOUND", () => {
    expect(
      consumeSourceGate({
        gateId: "00000000-0000-4000-8000-000000000000",
        projectSlug: "alljobs",
        questionDigest: QUESTION,
        manifestDigest: MANIFEST,
        now: NOW
      })
    ).toMatchObject({ ok: false, code: "SOURCE_GATE_NOT_FOUND" });
  });
});

describe("rejectSourceGate", () => {
  it("invalidates a gate so it cannot later be consumed", () => {
    const gate = makeGate();
    expect(rejectSourceGate({ gateId: gate.gate_id })).toEqual({ ok: true });
    expect(consume(gate)).toMatchObject({ ok: false, code: "SOURCE_GATE_REJECTED" });
  });

  it("cancellation invalidates without granting either capability", () => {
    const gate = makeGate();
    expect(rejectSourceGate({ gateId: gate.gate_id, reason: "cancelled" })).toEqual({ ok: true });
    expect(consume(gate)).toMatchObject({ ok: false, code: "SOURCE_GATE_CANCELLED" });
  });

  it("reports SOURCE_GATE_NOT_FOUND for an unknown gate", () => {
    expect(rejectSourceGate({ gateId: "missing" })).toMatchObject({
      ok: false,
      code: "SOURCE_GATE_NOT_FOUND"
    });
  });
});
