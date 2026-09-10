import { describe, expect, it } from "vitest";
import {
  MONITORING_PROVIDER_CAPABILITIES,
  attentionReasonSchema,
  monitoringBindingSchema,
  monitoringProbeSchema,
  monitoringSnapshotSchema,
  usageMeasureSchema,
  validateMonitoringBindingsAgainstConfig
} from "./schemas";

const RAILWAY_RESOURCE_ID = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333"
].join("/");

function validRailwayBinding(overrides: Record<string, unknown> = {}) {
  return {
    id: "railway-production-api",
    provider: "railway",
    resource_kind: "service",
    resource_id: RAILWAY_RESOURCE_ID,
    environment: "production",
    expected_runtime: "always-on",
    required_signals: ["deployment"],
    credential_ref: "railway-primary",
    console_url: "https://railway.com/project/example",
    ...overrides
  };
}

function validSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    cycle_id: "2026-09-11t06-00-00z",
    project: "talentvault",
    binding_id: "railway-production-api",
    provider: "railway",
    adapter: { version: "1.0.0", capabilities: ["deployment", "usage"] },
    attempted_at: "2026-09-11T06:00:00Z",
    collector: { state: "success", attempted_at: "2026-09-11T06:00:00Z" },
    deployment: {
      state: "succeeded",
      deployment_id: "dep-123",
      observed_at: "2026-09-11T05:59:00Z"
    },
    runtime: null,
    usage: [],
    platform_incident: null,
    freshness: {
      signals: [
        { signal: "deployment", observed_at: "2026-09-11T05:59:00Z", max_age_seconds: 3600, state: "current" }
      ]
    },
    attention: "healthy",
    reasons: [],
    ...overrides
  };
}

describe("monitoringBindingSchema", () => {
  it("parses a valid railway service binding", () => {
    const parsed = monitoringBindingSchema.parse(validRailwayBinding());
    expect(parsed.provider).toBe("railway");
    expect(parsed.probe).toBeUndefined();
  });

  it("parses a valid binding with a bounded probe", () => {
    const parsed = monitoringBindingSchema.parse(validRailwayBinding({
      required_signals: ["deployment", "runtime"],
      probe: {
        host_ref: "talentvault-production",
        path: "/healthz",
        method: "GET",
        expected_status: [200],
        timeout_ms: 5000
      }
    }));
    expect(parsed.probe?.host_ref).toBe("talentvault-production");
  });

  it("rejects unknown keys (strict)", () => {
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ token: "sk-secret" }))).toThrow();
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ endpoint: "https://evil.example/graphql" }))).toThrow();
  });

  it("rejects uppercase or unstable binding ids", () => {
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ id: "Railway-Prod" }))).toThrow();
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ id: "bad id" }))).toThrow();
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ id: "-leading-hyphen" }))).toThrow();
  });

  it("rejects a provider outside the closed adapter set", () => {
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ provider: "heroku" }))).toThrow();
  });

  it("rejects provider/resource-kind combinations the adapter does not support", () => {
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ resource_kind: "app" }))).toThrow();
    expect(monitoringBindingSchema.parse({
      ...validRailwayBinding(),
      id: "fly-web",
      provider: "fly",
      resource_kind: "app",
      resource_id: "talentvault-web",
      required_signals: ["runtime"],
      console_url: "https://fly.io/apps/talentvault-web"
    }).provider).toBe("fly");
  });

  it("enforces provider-specific resource_id grammar", () => {
    // Railway service: <project UUID>/<environment UUID>/<service UUID>
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ resource_id: "not-a-locator" }))).toThrow();
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({
      resource_id: "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222"
    }))).toThrow();
    // Supabase project ref: 20 lowercase alphanumerics
    expect(monitoringBindingSchema.parse({
      ...validRailwayBinding(),
      id: "supabase-db",
      provider: "supabase",
      resource_kind: "project",
      resource_id: "abcdefghijklmnopqrst",
      required_signals: ["runtime"],
      console_url: "https://supabase.com/dashboard/project/abcdefghijklmnopqrst"
    }).resource_id).toBe("abcdefghijklmnopqrst");
    expect(() => monitoringBindingSchema.parse({
      ...validRailwayBinding(),
      provider: "supabase",
      resource_kind: "project",
      resource_id: "AbCdEfGhIjKlMnOpQrSt",
      console_url: "https://supabase.com/dashboard/project/x"
    })).toThrow();
  });

  it("restricts console_url to the provider's exact HTTPS console allowlist", () => {
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ console_url: "http://railway.com/project/x" }))).toThrow();
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ console_url: "https://evil.example/project/x" }))).toThrow();
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ console_url: "https://railway.com.evil.example/project/x" }))).toThrow();
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ console_url: "https://user:pass@railway.com/project/x" }))).toThrow();
    expect(monitoringBindingSchema.parse(validRailwayBinding({ console_url: "https://railway.app/project/x" })).console_url)
      .toBe("https://railway.app/project/x");
  });

  it("rejects required signals the provider/resource kind cannot supply", () => {
    // railway service supplies deployment and usage; runtime needs an explicit probe
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ required_signals: ["runtime"] }))).toThrow();
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ required_signals: ["platform_incident"] }))).toThrow();
  });

  it("allows a required runtime signal only when the binding declares a probe", () => {
    const parsed = monitoringBindingSchema.parse(validRailwayBinding({
      required_signals: ["runtime"],
      probe: { host_ref: "talentvault-production", method: "HEAD", expected_status: [200, 302], timeout_ms: 3000 }
    }));
    expect(parsed.required_signals).toEqual(["runtime"]);
  });

  it("rejects duplicate required signals", () => {
    expect(() => monitoringBindingSchema.parse(validRailwayBinding({ required_signals: ["deployment", "deployment"] }))).toThrow();
  });

  it("lets extension providers parse but marks them not implemented and not collectable", () => {
    expect(MONITORING_PROVIDER_CAPABILITIES.vercel.implemented).toBe(false);
    expect(MONITORING_PROVIDER_CAPABILITIES.cloudflare.implemented).toBe(false);
    expect(MONITORING_PROVIDER_CAPABILITIES.github.implemented).toBe(false);
    expect(MONITORING_PROVIDER_CAPABILITIES.railway.implemented).toBe(true);

    const parsed = monitoringBindingSchema.parse({
      ...validRailwayBinding(),
      id: "vercel-site",
      provider: "vercel",
      resource_kind: "project",
      resource_id: "prj_example123",
      required_signals: [],
      console_url: "https://vercel.com/example/site"
    });
    expect(parsed.provider).toBe("vercel");

    // extension providers cannot collect in Phase 1: any required signal fails closed
    expect(() => monitoringBindingSchema.parse({
      ...validRailwayBinding(),
      provider: "vercel",
      resource_kind: "project",
      resource_id: "prj_example123",
      required_signals: ["deployment"],
      console_url: "https://vercel.com/example/site"
    })).toThrow();
  });
});

describe("monitoringProbeSchema", () => {
  const probe = {
    host_ref: "talentvault-production",
    path: "/healthz",
    method: "GET",
    expected_status: [200],
    timeout_ms: 5000
  };

  it("rejects absolute or scheme-relative probe paths", () => {
    expect(() => monitoringProbeSchema.parse({ ...probe, path: "https://evil.example/x" })).toThrow();
    expect(() => monitoringProbeSchema.parse({ ...probe, path: "//evil.example/x" })).toThrow();
    expect(() => monitoringProbeSchema.parse({ ...probe, path: "healthz" })).toThrow();
    expect(() => monitoringProbeSchema.parse({ ...probe, path: "/../escape" })).toThrow();
    expect(monitoringProbeSchema.parse({ ...probe, path: "/status?q=1" }).path).toBe("/status?q=1");
  });

  it("bounds the expected status list and timeout", () => {
    expect(() => monitoringProbeSchema.parse({ ...probe, expected_status: [] })).toThrow();
    expect(() => monitoringProbeSchema.parse({ ...probe, expected_status: [99] })).toThrow();
    expect(() => monitoringProbeSchema.parse({ ...probe, expected_status: [600] })).toThrow();
    expect(() => monitoringProbeSchema.parse({ ...probe, expected_status: Array.from({ length: 11 }, (_, i) => 200 + i) })).toThrow();
    expect(() => monitoringProbeSchema.parse({ ...probe, expected_status: [200, 200] })).toThrow();
    expect(() => monitoringProbeSchema.parse({ ...probe, timeout_ms: 100 })).toThrow();
    expect(() => monitoringProbeSchema.parse({ ...probe, timeout_ms: 60000 })).toThrow();
  });

  it("allows only GET or HEAD", () => {
    expect(() => monitoringProbeSchema.parse({ ...probe, method: "POST" })).toThrow();
  });
});

describe("usageMeasureSchema", () => {
  const measure = {
    metric: "cpu_seconds",
    value: 120.5,
    unit: "cpu_seconds",
    period_start: "2026-09-01T00:00:00Z",
    period_end: "2026-10-01T00:00:00Z",
    provider_reported_at: "2026-09-11T05:00:00Z",
    billing_alignment: "operational_only",
    availability: "available"
  };

  it("parses an available operational measure", () => {
    expect(usageMeasureSchema.parse(measure).billing_alignment).toBe("operational_only");
  });

  it("requires a value when available and forbids a synthetic value when not_available", () => {
    const { value: _value, ...withoutValue } = measure;
    expect(() => usageMeasureSchema.parse(withoutValue)).toThrow();
    expect(() => usageMeasureSchema.parse({ ...measure, availability: "not_available" })).toThrow();
    expect(usageMeasureSchema.parse({ ...withoutValue, availability: "not_available" }).availability).toBe("not_available");
  });

  it("requires currency with cost and exact alignment for provider-reported cost", () => {
    expect(() => usageMeasureSchema.parse({ ...measure, cost: 12.5 })).toThrow();
    expect(() => usageMeasureSchema.parse({ ...measure, cost: 12.5, currency: "USD" })).toThrow();
    expect(usageMeasureSchema.parse({
      ...measure,
      cost: 12.5,
      currency: "USD",
      billing_alignment: "exact"
    }).cost).toBe(12.5);
  });

  it("rejects unknown billing alignment and inverted periods", () => {
    expect(() => usageMeasureSchema.parse({ ...measure, billing_alignment: "invoice_grade" })).toThrow();
    expect(() => usageMeasureSchema.parse({
      ...measure,
      period_start: "2026-10-01T00:00:00Z",
      period_end: "2026-09-01T00:00:00Z"
    })).toThrow();
  });
});

describe("monitoringSnapshotSchema", () => {
  it("parses a valid schema-version-1 snapshot", () => {
    const parsed = monitoringSnapshotSchema.parse(validSnapshot());
    expect(parsed.attention).toBe("healthy");
    expect(parsed.deployment?.state).toBe("succeeded");
  });

  it("locks schema_version to 1 and rejects unknown keys", () => {
    expect(() => monitoringSnapshotSchema.parse(validSnapshot({ schema_version: 2 }))).toThrow();
    expect(() => monitoringSnapshotSchema.parse(validSnapshot({ raw_response: "{}" }))).toThrow();
    expect(() => monitoringSnapshotSchema.parse(validSnapshot({ authorization: "Bearer x" }))).toThrow();
  });

  it("rejects attention levels outside the closed five-state set", () => {
    expect(() => monitoringSnapshotSchema.parse(validSnapshot({ attention: "degraded" }))).toThrow();
    for (const level of ["critical", "warning", "unknown", "watch", "healthy"]) {
      expect(monitoringSnapshotSchema.parse(validSnapshot({ attention: level })).attention).toBe(level);
    }
  });

  it("keeps collector failure states in a closed taxonomy", () => {
    for (const state of ["success", "authentication_failed", "permission_denied", "rate_limited", "timeout", "malformed_response", "unsupported_capability"]) {
      expect(monitoringSnapshotSchema.parse(validSnapshot({
        collector: { state, attempted_at: "2026-09-11T06:00:00Z" },
        attention: state === "success" ? "healthy" : "unknown"
      })).collector.state).toBe(state);
    }
    expect(() => monitoringSnapshotSchema.parse(validSnapshot({
      collector: { state: "exploded", attempted_at: "2026-09-11T06:00:00Z" }
    }))).toThrow();
  });

  it("requires machine-readable reasons with evidence timestamps", () => {
    const parsed = monitoringSnapshotSchema.parse(validSnapshot({
      attention: "warning",
      reasons: [{
        code: "deployment_failed",
        dimension: "deployment",
        severity: "warning",
        summary: "Latest production deployment failed.",
        observed_at: "2026-09-11T05:59:00Z"
      }]
    }));
    expect(parsed.reasons[0]?.code).toBe("deployment_failed");

    expect(() => attentionReasonSchema.parse({
      code: "deployment_failed",
      dimension: "deployment",
      severity: "warning",
      summary: "missing evidence timestamp"
    })).toThrow();
  });
});

describe("validateMonitoringBindingsAgainstConfig", () => {
  const config = {
    enabled: true,
    refreshIntervalSeconds: 300,
    concurrency: 3,
    credentials: {
      "railway-primary": { provider: "railway" as const, tokenEnv: "ALLJOBS_MONITORING_RAILWAY_TOKEN" },
      "fly-primary": { provider: "fly" as const, tokenEnv: "ALLJOBS_MONITORING_FLY_TOKEN" }
    },
    probeAllowedHosts: {
      "talentvault-production": "https://app.example.com"
    }
  };

  function projectWith(bindings: ReadonlyArray<unknown>) {
    return [{ slug: "talentvault", monitoring: { bindings } }] as unknown as Parameters<typeof validateMonitoringBindingsAgainstConfig>[0];
  }

  it("accepts bindings whose credential_ref and probe host_ref resolve with a matching provider", () => {
    const issues = validateMonitoringBindingsAgainstConfig(
      projectWith([validRailwayBinding({
        probe: { host_ref: "talentvault-production", method: "GET", expected_status: [200], timeout_ms: 5000 }
      })]),
      config
    );
    expect(issues).toEqual([]);
  });

  it("flags an unknown credential_ref", () => {
    const issues = validateMonitoringBindingsAgainstConfig(
      projectWith([validRailwayBinding({ credential_ref: "missing-ref" })]),
      config
    );
    expect(issues.map(i => i.code)).toEqual(["credential_ref_unknown"]);
  });

  it("flags a credential/provider mismatch", () => {
    const issues = validateMonitoringBindingsAgainstConfig(
      projectWith([validRailwayBinding({ credential_ref: "fly-primary" })]),
      config
    );
    expect(issues.map(i => i.code)).toEqual(["credential_provider_mismatch"]);
  });

  it("flags an unknown probe host_ref", () => {
    const issues = validateMonitoringBindingsAgainstConfig(
      projectWith([validRailwayBinding({
        probe: { host_ref: "unregistered-host", method: "GET", expected_status: [200], timeout_ms: 5000 }
      })]),
      config
    );
    expect(issues.map(i => i.code)).toEqual(["probe_host_ref_unknown"]);
  });
});
