import { describe, expect, it } from "vitest";
import {
  CONFIRMED_CONSECUTIVE_FAILURES,
  deriveFreshnessSignal,
  deriveSignalFreshness,
  evaluateAttention,
  type AttentionEvaluationInput
} from "./attention";
import { monitoringSnapshotSchema, signalFreshnessSchema } from "./schemas";
import type { AttentionLevel } from "./types";
import {
  FIXTURE_NOW,
  buildCollectorSignal,
  buildDeploymentSignal,
  buildFreshnessSignal,
  buildMonitoringBinding,
  buildMonitoringSnapshot,
  buildNeonBinding,
  buildPlatformIncidentSignal,
  buildRuntimeSignal,
  buildSignalFreshness,
  buildUsageMeasure
} from "./fixtures";

function baseInput(overrides: Partial<AttentionEvaluationInput> = {}): AttentionEvaluationInput {
  return {
    binding: buildMonitoringBinding(),
    collector: buildCollectorSignal(),
    deployment: buildDeploymentSignal(),
    runtime: null,
    usage: [],
    platform_incident: null,
    freshness: buildFreshnessSignal(),
    adapter_capabilities: ["deployment", "usage"],
    now: FIXTURE_NOW,
    ...overrides
  };
}

function runtimeRequiredInput(runtimeOverrides: Record<string, unknown>, bindingOverrides: Record<string, unknown> = {}) {
  return baseInput({
    binding: buildMonitoringBinding({ required_signals: ["deployment", "runtime"], ...bindingOverrides }),
    runtime: buildRuntimeSignal(runtimeOverrides),
    freshness: buildFreshnessSignal({
      signals: [buildSignalFreshness(), buildSignalFreshness({ signal: "runtime" })]
    })
  });
}

function codesOf(result: ReturnType<typeof evaluateAttention>) {
  return result.reasons.map((reason) => reason.code);
}

describe("evaluateAttention precedence", () => {
  const cases: Array<{
    name: string;
    input: AttentionEvaluationInput;
    attention: AttentionLevel;
    leading: string | null;
  }> = [
    {
      name: "critical outranks warning",
      input: runtimeRequiredInput(
        { state: "unhealthy", consecutive_failures: 3 },
        {}
      ),
      attention: "critical",
      leading: "runtime_unhealthy_confirmed"
    },
    {
      name: "warning outranks unknown",
      input: baseInput({
        binding: buildMonitoringBinding({ required_signals: ["deployment", "usage"] }),
        deployment: buildDeploymentSignal({ state: "failed" }),
        usage: [],
        freshness: buildFreshnessSignal({
          signals: [
            buildSignalFreshness(),
            buildSignalFreshness({ signal: "usage", observed_at: null, state: "never_collected" })
          ]
        })
      }),
      attention: "warning",
      leading: "deployment_failed"
    },
    {
      name: "unknown outranks watch",
      input: baseInput({
        binding: buildMonitoringBinding({ required_signals: ["deployment", "usage"] }),
        freshness: buildFreshnessSignal({
          signals: [
            buildSignalFreshness({ state: "delayed" }),
            buildSignalFreshness({ signal: "usage", observed_at: null, state: "never_collected" })
          ]
        })
      }),
      attention: "unknown",
      leading: "first_collection"
    },
    {
      name: "watch outranks healthy",
      input: baseInput({ usage: [buildUsageMeasure({ value: 80, allowance: 100 })] }),
      attention: "watch",
      leading: "allowance_watch"
    },
    {
      name: "no reasons means healthy",
      input: baseInput(),
      attention: "healthy",
      leading: null
    }
  ];

  for (const { name, input, attention, leading } of cases) {
    it(name, () => {
      const result = evaluateAttention(input);
      expect(result.attention).toBe(attention);
      expect(result.leading?.code ?? null).toBe(leading);
    });
  }
});

describe("reason retention and ordering", () => {
  it("retains every applicable reason and sorts by precedence then stable code order", () => {
    const result = evaluateAttention(baseInput({
      deployment: buildDeploymentSignal({ state: "failed" }),
      usage: [buildUsageMeasure({ value: 92, allowance: 100 })],
      platform_incident: buildPlatformIncidentSignal()
    }));
    expect(result.attention).toBe("warning");
    expect(codesOf(result)).toEqual([
      "allowance_near_limit",
      "deployment_failed",
      "platform_incident_active"
    ]);
  });

  it("breaks severity ties by stable reason-code sort regardless of discovery order", () => {
    const result = evaluateAttention(baseInput({
      binding: buildMonitoringBinding({ required_signals: ["deployment", "runtime"] }),
      runtime: null,
      freshness: buildFreshnessSignal({
        signals: [
          buildSignalFreshness({ state: "expired", observed_at: "2026-09-11T04:00:00Z" }),
          buildSignalFreshness({ signal: "runtime", observed_at: null, state: "never_collected" })
        ]
      })
    }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["first_collection", "stale_max_age_exceeded"]);
    expect(result.leading?.code).toBe("first_collection");
  });

  it("is deterministic: identical input evaluates identically twice", () => {
    const input = baseInput({
      deployment: buildDeploymentSignal({ state: "failed" }),
      usage: [buildUsageMeasure({ value: 95, allowance: 100 })]
    });
    expect(evaluateAttention(input)).toEqual(evaluateAttention(input));
  });

  it("never produces a numeric composite score", () => {
    const result = evaluateAttention(baseInput({ deployment: buildDeploymentSignal({ state: "failed" }) }));
    expect(Object.keys(result).sort()).toEqual(["attention", "leading", "reasons"]);
    expect(JSON.stringify(result)).not.toContain("score");
  });
});

describe("required versus optional signals", () => {
  it("optional usage marked not_available does not affect attention", () => {
    const result = evaluateAttention(baseInput({
      usage: [buildUsageMeasure({ availability: "not_available", value: undefined, allowance: undefined })]
    }));
    expect(result.attention).toBe("healthy");
    expect(result.reasons).toEqual([]);
  });

  it("required usage with no available measure is unknown, never healthy", () => {
    const result = evaluateAttention(baseInput({
      binding: buildMonitoringBinding({ required_signals: ["deployment", "usage"] }),
      usage: [buildUsageMeasure({ availability: "not_available", value: undefined, allowance: undefined })],
      freshness: buildFreshnessSignal({
        signals: [buildSignalFreshness(), buildSignalFreshness({ signal: "usage" })]
      })
    }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["usage_unavailable"]);
  });

  it("missing optional platform incident cannot downgrade otherwise healthy signals", () => {
    const result = evaluateAttention(baseInput({ platform_incident: null }));
    expect(result.attention).toBe("healthy");
  });

  it("usage without a provider-reported allowance never enters percentage thresholds", () => {
    const result = evaluateAttention(baseInput({
      usage: [buildUsageMeasure({ value: 9_999_999, allowance: undefined })]
    }));
    expect(result.attention).toBe("healthy");
  });
});

describe("first collection and stale freshness", () => {
  it("first collection of a required signal is unknown", () => {
    const result = evaluateAttention(baseInput({
      deployment: null,
      freshness: buildFreshnessSignal({
        signals: [buildSignalFreshness({ observed_at: null, state: "never_collected" })]
      })
    }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["first_collection"]);
    expect(result.reasons[0].dimension).toBe("deployment");
  });

  it("expired required signal is unknown and its stale value is never evaluated as truth", () => {
    const result = evaluateAttention(baseInput({
      deployment: buildDeploymentSignal({ state: "failed" }),
      freshness: buildFreshnessSignal({
        signals: [buildSignalFreshness({ state: "expired", observed_at: "2026-09-11T03:00:00Z" })]
      })
    }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["stale_max_age_exceeded"]);
    expect(result.reasons[0].dimension).toBe("freshness");
  });

  it("delayed collection inside maximum age is watch and the retained value is still evaluated", () => {
    const result = evaluateAttention(baseInput({
      collector: buildCollectorSignal({ state: "timeout" }),
      deployment: buildDeploymentSignal({ state: "failed" }),
      freshness: buildFreshnessSignal({
        signals: [buildSignalFreshness({ state: "delayed" })]
      })
    }));
    expect(result.attention).toBe("warning");
    expect(codesOf(result)).toEqual(["deployment_failed", "collection_delayed"]);
  });

  it("delayed collection with a good retained value stays watch", () => {
    const result = evaluateAttention(baseInput({
      collector: buildCollectorSignal({ state: "rate_limited", retry_after_seconds: 120 }),
      freshness: buildFreshnessSignal({
        signals: [buildSignalFreshness({ state: "delayed" })]
      })
    }));
    expect(result.attention).toBe("watch");
    expect(codesOf(result)).toEqual(["collection_delayed"]);
  });
});

describe("authentication and permission invalidation", () => {
  it("authentication failure marks required signals untrustworthy immediately, even with a fresh retained value", () => {
    const result = evaluateAttention(baseInput({
      collector: buildCollectorSignal({ state: "authentication_failed", attempted_at: FIXTURE_NOW })
    }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["collector_authentication_failed"]);
    expect(result.reasons[0].severity).toBe("unknown");
    expect(result.reasons[0].observed_at).toBe(FIXTURE_NOW);
  });

  it("permission denial invalidates every required signal with an actionable, secret-free reason", () => {
    const result = evaluateAttention(baseInput({
      binding: buildMonitoringBinding({ required_signals: ["deployment", "runtime"] }),
      collector: buildCollectorSignal({ state: "permission_denied" }),
      runtime: buildRuntimeSignal(),
      freshness: buildFreshnessSignal({
        signals: [buildSignalFreshness(), buildSignalFreshness({ signal: "runtime" })]
      })
    }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["collector_permission_denied", "collector_permission_denied"]);
    for (const reason of result.reasons) {
      expect(reason.summary).not.toMatch(/token|secret|bearer/i);
      expect(reason.summary).toContain("railway-primary");
    }
  });

  it("authentication failure with no required signals is watch, not silent healthy", () => {
    const result = evaluateAttention(baseInput({
      binding: buildMonitoringBinding({ required_signals: [] }),
      collector: buildCollectorSignal({ state: "authentication_failed" })
    }));
    expect(result.attention).toBe("watch");
    expect(codesOf(result)).toEqual(["collector_authentication_failed"]);
    expect(result.reasons[0].dimension).toBe("collector");
  });
});

describe("unsupported signal configuration", () => {
  it("a required signal the adapter cannot supply evaluates to unknown", () => {
    const result = evaluateAttention(baseInput({
      binding: buildNeonBinding({ required_signals: ["runtime", "platform_incident"] }),
      runtime: buildRuntimeSignal({ source: "provider" }),
      platform_incident: null,
      adapter_capabilities: ["runtime", "usage"],
      freshness: buildFreshnessSignal({
        signals: [buildSignalFreshness({ signal: "runtime" })]
      })
    }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["unsupported_required_signal"]);
  });

  it("a required runtime signal without adapter support or a probe evaluates to unknown", () => {
    // The evaluator defends against bindings that were valid when written but
    // whose adapter capabilities no longer satisfy them, so this intentionally
    // bypasses schema-time binding validation.
    const binding = {
      ...buildMonitoringBinding({ required_signals: ["deployment", "runtime"] }),
      probe: undefined
    };
    const result = evaluateAttention(baseInput({
      binding,
      runtime: buildRuntimeSignal({ source: "provider" }),
      freshness: buildFreshnessSignal({
        signals: [buildSignalFreshness(), buildSignalFreshness({ signal: "runtime" })]
      })
    }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["unsupported_required_signal"]);
  });

  it("optional unsupported signals parse but never affect attention", () => {
    const result = evaluateAttention(baseInput({
      platform_incident: null,
      adapter_capabilities: ["deployment", "usage"]
    }));
    expect(result.attention).toBe("healthy");
  });
});

describe("known allowance bands", () => {
  const bands: Array<{
    value: number;
    allowance: number;
    attention: AttentionLevel;
    code: string | null;
  }> = [
    { value: 7499, allowance: 10000, attention: "healthy", code: null },
    { value: 75, allowance: 100, attention: "watch", code: "allowance_watch" },
    { value: 8999, allowance: 10000, attention: "watch", code: "allowance_watch" },
    { value: 90, allowance: 100, attention: "warning", code: "allowance_near_limit" },
    { value: 9999, allowance: 10000, attention: "warning", code: "allowance_near_limit" },
    { value: 100, allowance: 100, attention: "warning", code: "quota_exhausted" },
    { value: 120, allowance: 100, attention: "warning", code: "quota_exhausted" },
    { value: 1, allowance: 0, attention: "warning", code: "quota_exhausted" }
  ];

  for (const { value, allowance, attention, code } of bands) {
    it(`usage ${value}/${allowance} is ${attention}`, () => {
      const result = evaluateAttention(baseInput({
        usage: [buildUsageMeasure({ value, allowance })]
      }));
      expect(result.attention).toBe(attention);
      expect(codesOf(result)).toEqual(code === null ? [] : [code]);
    });
  }
});

describe("quota exhaustion and observed service impact", () => {
  it("exhaustion without service impact stays warning", () => {
    const result = evaluateAttention(baseInput({
      usage: [buildUsageMeasure({ value: 100, allowance: 100 })],
      runtime: buildRuntimeSignal({ state: "healthy" })
    }));
    expect(result.attention).toBe("warning");
    expect(codesOf(result)).toEqual(["quota_exhausted"]);
  });

  it("exhaustion with unhealthy runtime evidence is critical", () => {
    const result = evaluateAttention(baseInput({
      usage: [buildUsageMeasure({ value: 105, allowance: 100 })],
      runtime: buildRuntimeSignal({ state: "unhealthy", consecutive_failures: 4 })
    }));
    expect(result.attention).toBe("critical");
    expect(result.leading?.code).toBe("quota_exhausted_with_impact");
    expect(codesOf(result)).toEqual(["quota_exhausted_with_impact", "runtime_unhealthy_confirmed"]);
  });

  it("exhaustion with degraded runtime evidence is critical", () => {
    const result = evaluateAttention(baseInput({
      usage: [buildUsageMeasure({ value: 250, allowance: 200 })],
      runtime: buildRuntimeSignal({ state: "degraded" })
    }));
    expect(result.attention).toBe("critical");
    expect(result.leading?.code).toBe("quota_exhausted_with_impact");
  });
});

describe("transient versus confirmed probe failure", () => {
  const probeCases: Array<{
    consecutive: number | undefined;
    attention: AttentionLevel;
    code: string;
  }> = [
    { consecutive: undefined, attention: "warning", code: "runtime_unhealthy_transient" },
    { consecutive: 1, attention: "warning", code: "runtime_unhealthy_transient" },
    { consecutive: CONFIRMED_CONSECUTIVE_FAILURES, attention: "critical", code: "runtime_unhealthy_confirmed" },
    { consecutive: 6, attention: "critical", code: "runtime_unhealthy_confirmed" }
  ];

  for (const { consecutive, attention, code } of probeCases) {
    it(`probe unhealthy with ${consecutive ?? "no"} consecutive failures is ${attention}`, () => {
      const result = evaluateAttention(runtimeRequiredInput({
        state: "unhealthy",
        source: "probe",
        consecutive_failures: consecutive
      }));
      expect(result.attention).toBe(attention);
      expect(codesOf(result)).toEqual([code]);
    });
  }

  it("an optional confirmed-unhealthy runtime is warning, not critical", () => {
    const result = evaluateAttention(baseInput({
      runtime: buildRuntimeSignal({ state: "unhealthy", consecutive_failures: 5 })
    }));
    expect(result.attention).toBe("warning");
    expect(codesOf(result)).toEqual(["runtime_unhealthy_confirmed"]);
    expect(result.reasons[0].severity).toBe("warning");
  });
});

describe("deployment and runtime disagreement", () => {
  it("succeeded deployment plus confirmed-failed required probe is critical without rewriting deployment truth", () => {
    const result = evaluateAttention(runtimeRequiredInput({
      state: "unhealthy",
      consecutive_failures: 3
    }));
    expect(result.attention).toBe("critical");
    expect(codesOf(result)).toEqual(["runtime_unhealthy_confirmed"]);
    expect(codesOf(result)).not.toContain("deployment_failed");
  });

  it("failed deployment plus healthy runtime is warning with no runtime reason", () => {
    const result = evaluateAttention(runtimeRequiredInput({ state: "healthy" }));
    const withFailedDeployment = evaluateAttention({
      ...runtimeRequiredInput({ state: "healthy" }),
      deployment: buildDeploymentSignal({ state: "failed" })
    });
    expect(result.attention).toBe("healthy");
    expect(withFailedDeployment.attention).toBe("warning");
    expect(codesOf(withFailedDeployment)).toEqual(["deployment_failed"]);
  });

  it("required deployment reported unavailable is unknown", () => {
    const result = evaluateAttention(baseInput({
      deployment: buildDeploymentSignal({ state: "unavailable", deployment_id: undefined })
    }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["deployment_unavailable"]);
  });
});

describe("platform incident optionality", () => {
  it("an active related platform incident is warning even when optional", () => {
    const result = evaluateAttention(baseInput({
      platform_incident: buildPlatformIncidentSignal({ status: "identified" })
    }));
    expect(result.attention).toBe("warning");
    expect(codesOf(result)).toEqual(["platform_incident_active"]);
  });

  it("a resolved incident does not affect attention", () => {
    const result = evaluateAttention(baseInput({
      platform_incident: buildPlatformIncidentSignal({ status: "resolved" })
    }));
    expect(result.attention).toBe("healthy");
  });

  it("required platform incident with no value is unknown", () => {
    const result = evaluateAttention(baseInput({
      binding: buildNeonBinding({ required_signals: ["platform_incident"] }),
      deployment: null,
      runtime: null,
      adapter_capabilities: ["runtime", "usage", "platform_incident"],
      freshness: buildFreshnessSignal({
        signals: [buildSignalFreshness({ signal: "platform_incident" })]
      })
    }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["required_signal_missing"]);
  });
});

describe("expected-runtime policies", () => {
  const policies: Array<{
    policy: "always-on" | "scale-to-zero" | "scheduled" | "manual";
    state: "healthy" | "degraded" | "unhealthy" | "expected_idle" | "stopped";
    attention: AttentionLevel;
    code: string | null;
  }> = [
    { policy: "always-on", state: "healthy", attention: "healthy", code: null },
    { policy: "always-on", state: "stopped", attention: "critical", code: "runtime_unexpected_stopped" },
    { policy: "always-on", state: "expected_idle", attention: "critical", code: "runtime_unexpected_stopped" },
    { policy: "always-on", state: "degraded", attention: "warning", code: "runtime_degraded" },
    { policy: "scale-to-zero", state: "stopped", attention: "healthy", code: null },
    { policy: "scale-to-zero", state: "expected_idle", attention: "healthy", code: null },
    { policy: "scale-to-zero", state: "unhealthy", attention: "critical", code: "runtime_unhealthy_confirmed" },
    { policy: "scheduled", state: "expected_idle", attention: "healthy", code: null },
    { policy: "scheduled", state: "stopped", attention: "healthy", code: null },
    { policy: "manual", state: "stopped", attention: "healthy", code: null },
    { policy: "manual", state: "degraded", attention: "warning", code: "runtime_degraded" }
  ];

  for (const { policy, state, attention, code } of policies) {
    it(`${policy} + ${state} is ${attention}`, () => {
      const result = evaluateAttention(runtimeRequiredInput(
        { state, source: "provider", consecutive_failures: state === "unhealthy" ? 3 : undefined },
        { expected_runtime: policy }
      ));
      expect(result.attention).toBe(attention);
      if (code === null) {
        expect(result.reasons).toEqual([]);
      } else {
        expect(codesOf(result)).toContain(code);
      }
    });
  }

  it("required runtime reported unknown by the provider is unknown", () => {
    const result = evaluateAttention(runtimeRequiredInput({ state: "unknown" }));
    expect(result.attention).toBe("unknown");
    expect(codesOf(result)).toEqual(["runtime_state_unknown"]);
  });
});

describe("schema integration", () => {
  it("evaluation output embeds into a valid schema-version-1 snapshot", () => {
    const input = baseInput({
      deployment: buildDeploymentSignal({ state: "failed" }),
      usage: [buildUsageMeasure({ value: 95, allowance: 100 })]
    });
    const result = evaluateAttention(input);
    const snapshot = buildMonitoringSnapshot({
      collector: input.collector,
      deployment: input.deployment,
      usage: input.usage,
      freshness: input.freshness,
      attention: result.attention,
      reasons: result.reasons
    });
    const parsed = monitoringSnapshotSchema.parse(snapshot);
    expect(parsed.attention).toBe("warning");
    expect(parsed.reasons).toHaveLength(2);
  });
});

describe("deriveSignalFreshness", () => {
  const now = FIXTURE_NOW;
  const cases: Array<{
    name: string;
    observed_at: string | null;
    max_age_seconds: number;
    attemptFailed: boolean;
    state: "current" | "delayed" | "expired" | "never_collected";
  }> = [
    { name: "no observation is never_collected", observed_at: null, max_age_seconds: 3600, attemptFailed: false, state: "never_collected" },
    { name: "age inside maximum is current", observed_at: "2026-09-11T05:30:00Z", max_age_seconds: 3600, attemptFailed: false, state: "current" },
    { name: "age exactly at maximum is current", observed_at: "2026-09-11T05:00:00Z", max_age_seconds: 3600, attemptFailed: false, state: "current" },
    { name: "age beyond maximum is expired", observed_at: "2026-09-11T04:59:59Z", max_age_seconds: 3600, attemptFailed: false, state: "expired" },
    { name: "failed attempt inside maximum is delayed", observed_at: "2026-09-11T05:30:00Z", max_age_seconds: 3600, attemptFailed: true, state: "delayed" },
    { name: "failed attempt beyond maximum stays expired", observed_at: "2026-09-11T04:00:00Z", max_age_seconds: 3600, attemptFailed: true, state: "expired" },
    { name: "future observation is clamped to current", observed_at: "2026-09-11T07:00:00Z", max_age_seconds: 3600, attemptFailed: false, state: "current" }
  ];

  for (const { name, observed_at, max_age_seconds, attemptFailed, state } of cases) {
    it(name, () => {
      const freshness = deriveSignalFreshness(
        { signal: "runtime", observed_at, max_age_seconds },
        now,
        attemptFailed
      );
      expect(freshness.state).toBe(state);
      expect(signalFreshnessSchema.parse(freshness).signal).toBe("runtime");
    });
  }

  it("deriveFreshnessSignal marks every signal delayed after a failed collector attempt", () => {
    const freshness = deriveFreshnessSignal(
      [
        { signal: "deployment", observed_at: "2026-09-11T05:30:00Z", max_age_seconds: 3600 },
        { signal: "usage", observed_at: null, max_age_seconds: 86400 }
      ],
      now,
      buildCollectorSignal({ state: "malformed_response" })
    );
    expect(freshness.signals.map((entry) => entry.state)).toEqual(["delayed", "never_collected"]);
  });
});
