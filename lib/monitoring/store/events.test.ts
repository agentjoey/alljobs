import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCollectorSignal,
  buildDeploymentSignal,
  buildMonitoringSnapshot,
  buildRuntimeSignal,
  buildUsageMeasure,
  FIXTURE_NOW
} from "../domain/fixtures";
import type { MonitoringSnapshot } from "../domain/types";
import { appendTransitionEvents, diffTransitions, transitionEventSchema } from "./events";

// Transition events record only material changes: attention, signal state,
// deployment identity, permission state, and quota band. Repeated identical
// failures update attempt metadata without appending duplicate events.

const CYCLE_A = "2026-09-11t06-00-00z";
const CYCLE_B = "2026-09-11t07-00-00z";
const RECORDED = "2026-09-11T06:05:00Z";

const homes: string[] = [];

function tempRoot(): string {
  const home = fs.mkdtempSync(join(tmpdir(), "alljobs-monitoring-events-"));
  homes.push(home);
  return join(home, "state", "monitoring");
}

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop();
    if (home) fs.rmSync(home, { recursive: true, force: true });
  }
});

function snap(overrides: Record<string, unknown> = {}): MonitoringSnapshot {
  return buildMonitoringSnapshot(overrides);
}

function delayedReason(observedAt: string) {
  return {
    code: "collection_delayed",
    dimension: "freshness" as const,
    severity: "watch" as const,
    summary: "Collection timed out; showing the last trustworthy value.",
    observed_at: observedAt
  };
}

describe("diffTransitions", () => {
  it("emits nothing for a first collection (no previous state to transition from)", () => {
    expect(diffTransitions(null, snap(), RECORDED)).toEqual([]);
  });

  it("emits nothing when the new cycle is materially identical", () => {
    const previous = snap({ cycle_id: CYCLE_A });
    const next = snap({ cycle_id: CYCLE_B, attempted_at: "2026-09-11T07:00:00Z" });
    expect(diffTransitions(previous, next, RECORDED)).toEqual([]);
  });

  it("does not duplicate events for repeated identical failures", () => {
    const previous = snap({
      cycle_id: CYCLE_A,
      collector: buildCollectorSignal({ state: "timeout" }),
      attention: "unknown",
      reasons: [delayedReason(FIXTURE_NOW)]
    });
    const next = snap({
      cycle_id: CYCLE_B,
      attempted_at: "2026-09-11T07:00:00Z",
      collector: buildCollectorSignal({ state: "timeout", attempted_at: "2026-09-11T07:00:00Z" }),
      attention: "unknown",
      reasons: [delayedReason("2026-09-11T07:00:00Z")]
    });
    expect(diffTransitions(previous, next, RECORDED)).toEqual([]);
  });

  it("emits an attention event with the leading reason code when attention changes", () => {
    const previous = snap({ cycle_id: CYCLE_A });
    const next = snap({
      cycle_id: CYCLE_B,
      attention: "warning",
      reasons: [
        {
          code: "deployment_failed",
          dimension: "deployment" as const,
          severity: "warning" as const,
          summary: "The latest production deployment failed.",
          observed_at: "2026-09-11T07:00:00Z"
        }
      ]
    });
    const events = diffTransitions(previous, next, RECORDED);
    const attention = events.filter((e) => e.type === "attention");
    expect(attention).toHaveLength(1);
    expect(attention[0].previous).toBe("healthy");
    expect(attention[0].new).toBe("warning");
    expect(attention[0].reason_code).toBe("deployment_failed");
    expect(attention[0].dimension).toBe("deployment");
  });

  it("emits signal_state events for deployment, runtime, and platform incident changes", () => {
    const previous = snap({
      cycle_id: CYCLE_A,
      runtime: buildRuntimeSignal({ state: "healthy" })
    });
    const next = snap({
      cycle_id: CYCLE_B,
      deployment: buildDeploymentSignal({ state: "failed" }),
      runtime: buildRuntimeSignal({ state: "unhealthy", observed_at: "2026-09-11T06:59:00Z" })
    });
    const events = diffTransitions(previous, next, RECORDED);
    const states = events.filter((e) => e.type === "signal_state");
    expect(states.map((e) => [e.dimension, e.previous, e.new])).toEqual([
      ["deployment", "succeeded", "failed"],
      ["runtime", "healthy", "unhealthy"]
    ]);
    expect(states[1].observed_at).toBe("2026-09-11T06:59:00Z");
  });

  it("emits a deployment_identity event when the deployment id or revision changes", () => {
    const previous = snap({ cycle_id: CYCLE_A });
    const next = snap({
      cycle_id: CYCLE_B,
      deployment: buildDeploymentSignal({ deployment_id: "dep-124", revision: "rev-9" })
    });
    const events = diffTransitions(previous, next, RECORDED);
    const identity = events.filter((e) => e.type === "deployment_identity");
    expect(identity).toHaveLength(1);
    expect(identity[0].deployment_id).toBe("dep-124");
    expect(identity[0].revision).toBe("rev-9");

    // Same identity, new cycle: no event.
    const again = snap({ cycle_id: "2026-09-11t08-00-00z", attempted_at: "2026-09-11T08:00:00Z" });
    expect(diffTransitions(next, { ...again, deployment: next.deployment }, RECORDED)).toEqual([]);
  });

  it("emits collector signal_state for non-permission failures", () => {
    const previous = snap({ cycle_id: CYCLE_A });
    const next = snap({
      cycle_id: CYCLE_B,
      collector: buildCollectorSignal({ state: "timeout", attempted_at: "2026-09-11T07:00:00Z" })
    });
    const events = diffTransitions(previous, next, RECORDED);
    const collector = events.filter((e) => e.dimension === "collector");
    expect(collector).toHaveLength(1);
    expect(collector[0].type).toBe("signal_state");
    expect(collector[0].previous).toBe("success");
    expect(collector[0].new).toBe("timeout");
  });

  it("emits permission_state (not signal_state) for authentication and permission transitions", () => {
    const previous = snap({ cycle_id: CYCLE_A });
    const denied = snap({
      cycle_id: CYCLE_B,
      collector: buildCollectorSignal({ state: "authentication_failed", attempted_at: "2026-09-11T07:00:00Z" }),
      attention: "unknown",
      reasons: [
        {
          code: "collector_authentication_failed",
          dimension: "collector" as const,
          severity: "unknown" as const,
          summary: "The provider rejected the configured credential reference.",
          observed_at: "2026-09-11T07:00:00Z"
        }
      ]
    });
    const intoFailure = diffTransitions(previous, denied, RECORDED);
    const permission = intoFailure.filter((e) => e.type === "permission_state");
    expect(permission).toHaveLength(1);
    expect(permission[0].previous).toBe("ok");
    expect(permission[0].new).toBe("authentication_failed");
    // No duplicate collector signal_state for the same transition.
    expect(intoFailure.filter((e) => e.type === "signal_state" && e.dimension === "collector")).toEqual([]);

    // Recovery is also a permission-state transition.
    const recovery = diffTransitions(denied, snap({ cycle_id: CYCLE_C_STUB }), RECORDED);
    expect(recovery.filter((e) => e.type === "permission_state").map((e) => e.new)).toEqual(["ok"]);
  });

  it("emits quota_band events only for measures with a known allowance, keyed by metric/unit/period/alignment", () => {
    const previous = snap({
      cycle_id: CYCLE_A,
      usage: [buildUsageMeasure({ value: 100, allowance: 1000 })]
    });
    const next = snap({
      cycle_id: CYCLE_B,
      usage: [
        buildUsageMeasure({ value: 950, allowance: 1000 }), // below_75 -> near_90_100
        buildUsageMeasure({ metric: "memory_mb", unit: "mb", allowance: undefined, value: 42 }) // no band
      ]
    });
    const events = diffTransitions(previous, next, RECORDED);
    const bands = events.filter((e) => e.type === "quota_band");
    expect(bands).toHaveLength(1);
    expect(bands[0].dimension).toBe("usage");
    expect(bands[0].previous).toBe("below_75");
    expect(bands[0].new).toBe("near_90_100");
    expect(bands[0].key).toContain("cpu_seconds");
    expect(bands[0].key).toContain("operational_only");

    // Repeated cycle at the same band: no duplicate event.
    const repeated = snap({ cycle_id: "2026-09-11t08-00-00z", usage: next.usage });
    expect(diffTransitions(next, repeated, RECORDED).filter((e) => e.type === "quota_band")).toEqual([]);
  });

  it("never combines billing alignments: an exact measure is a separate band series", () => {
    const previous = snap({
      cycle_id: CYCLE_A,
      usage: [buildUsageMeasure({ value: 950, allowance: 1000 })] // operational_only near_90_100
    });
    const next = snap({
      cycle_id: CYCLE_B,
      usage: [
        buildUsageMeasure({
          value: 950,
          allowance: 1000,
          billing_alignment: "exact",
          cost: 9.5,
          currency: "USD"
        })
      ]
    });
    const events = diffTransitions(previous, next, RECORDED);
    const bands = events.filter((e) => e.type === "quota_band");
    // The operational series disappears (band -> null is not an event) and the
    // exact series appears with previous: null — they are never merged.
    expect(bands).toHaveLength(1);
    expect(bands[0].previous).toBeNull();
    expect(bands[0].key).toContain("exact");
  });
});

const CYCLE_C_STUB = "2026-09-11t08-00-00z";

describe("appendTransitionEvents", () => {
  it("appends schema-valid JSONL records grouped by recorded month", () => {
    const root = tempRoot();
    const previous = snap({ cycle_id: CYCLE_A });
    const next = snap({ cycle_id: CYCLE_B, attention: "warning", reasons: [
      {
        code: "deployment_failed",
        dimension: "deployment" as const,
        severity: "warning" as const,
        summary: "The latest production deployment failed.",
        observed_at: "2026-09-11T07:00:00Z"
      }
    ] });
    const september = diffTransitions(previous, next, "2026-09-11T07:05:00Z");
    const october = diffTransitions(previous, next, "2026-10-01T00:05:00Z");
    expect(september.length).toBeGreaterThan(0);

    const { files } = appendTransitionEvents(root, [...september, ...october]);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith(join("events", "2026-09.jsonl")))).toBe(true);
    expect(files.some((f) => f.endsWith(join("events", "2026-10.jsonl")))).toBe(true);

    const lines = fs.readFileSync(join(root, "events", "2026-09.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(september.length);
    for (const line of lines) {
      expect(() => transitionEventSchema.parse(JSON.parse(line))).not.toThrow();
    }

    // A second append preserves prior lines.
    appendTransitionEvents(root, september);
    const after = fs.readFileSync(join(root, "events", "2026-09.jsonl"), "utf8").trim().split("\n");
    expect(after).toHaveLength(september.length * 2);
  });

  it("contains normalized metadata only (recursive forbidden-key scan)", () => {
    const root = tempRoot();
    const previous = snap({ cycle_id: CYCLE_A });
    const next = snap({
      cycle_id: CYCLE_B,
      collector: buildCollectorSignal({ state: "authentication_failed", attempted_at: "2026-09-11T07:00:00Z" }),
      attention: "unknown",
      reasons: [
        {
          code: "collector_authentication_failed",
          dimension: "collector" as const,
          severity: "unknown" as const,
          summary: "The provider rejected the configured credential reference.",
          observed_at: "2026-09-11T07:00:00Z"
        }
      ]
    });
    appendTransitionEvents(root, diffTransitions(previous, next, RECORDED));
    const file = join(root, "events", "2026-09.jsonl");
    for (const line of fs.readFileSync(file, "utf8").trim().split("\n")) {
      assertNoForbiddenKeysLocal(JSON.parse(line), file);
    }
  });

  it("rejects an unsafe root", () => {
    expect(() => appendTransitionEvents("/", [])).toThrow();
    expect(() => appendTransitionEvents("~/state/monitoring", [])).toThrow();
  });
});

const FORBIDDEN_KEY = /token|secret|authorization|header|raw|body|content|environment|env|log/i;

function assertNoForbiddenKeysLocal(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeysLocal(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      expect(key, `forbidden key at ${path}`).not.toMatch(FORBIDDEN_KEY);
      assertNoForbiddenKeysLocal(entry, `${path}.${key}`);
    }
  }
}
