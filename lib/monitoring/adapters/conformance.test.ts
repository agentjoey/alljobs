import { describe, expect, it } from "vitest";
import { buildMonitoringBinding, buildNeonBinding } from "../domain/fixtures";
import { monitoringBindingSchema } from "../domain/schemas";
import type { MonitoringBinding } from "../domain/types";
import { createCredentialHandle } from "../collector/credentials";
import type { MonitoringAdapter } from "./contracts";
import { AdapterError } from "./contracts";
import {
  ConformanceViolation,
  createRecordingTransport,
  runAdapterConformance
} from "./conformance";
import { createFixtureAdapter } from "./fixture";
import { createRailwayAdapter } from "./railway";
import { createFlyAdapter } from "./fly";
import { createNeonAdapter } from "./neon";
import { createSupabaseAdapter } from "./supabase";
import railwayDeploymentSuccess from "./railway/fixtures/deployment-success.json";
import railwayMetricsComplete from "./railway/fixtures/metrics-complete.json";
import flyMachinesHealthy from "./fly/fixtures/machines-healthy.json";
import neonProjectPaid from "./neon/fixtures/project-paid.json";
import neonEndpointsActive from "./neon/fixtures/endpoints-active.json";
import neonConsumptionPaid from "./neon/fixtures/consumption-paid.json";
import supabaseHealthHealthy from "./supabase/fixtures/health-healthy.json";
import supabaseApiCounts from "./supabase/fixtures/api-counts.json";

// Common adapter conformance suite (design §13): fixed hosts/methods, abort
// deadlines, size limits, closed error taxonomy, safe timestamps, unsupported
// capability representation, and no serialized secret or raw response. The
// fixture adapter must pass; deliberately broken adapters must fail.

const NOW = "2026-09-11T05:59:00Z";
const CANARY = "conformance-canary-token-9f8e7d6c";

const EVIDENCE_BODY = JSON.stringify({
  deployment: { state: "succeeded", deployment_id: "dep-1", observed_at: NOW },
  runtime: { state: "healthy", observed_at: NOW, source: "provider" },
  usage: [
    {
      metric: "cpu_seconds",
      value: 12,
      unit: "cpu_seconds",
      period_start: "2026-09-01T00:00:00Z",
      period_end: "2026-10-01T00:00:00Z",
      provider_reported_at: NOW,
      billing_alignment: "operational_only",
      availability: "available"
    }
  ],
  platform_incident: null
});

function conformanceOptions() {
  return {
    binding: buildMonitoringBinding(),
    credential: createCredentialHandle("railway-primary", "railway", CANARY),
    now: "2026-09-11T06:00:00Z",
    secrets: [CANARY],
    respond: () => ({ status: 200, body: EVIDENCE_BODY })
  };
}

const EXPECTED_CHECKS = [
  "capabilities declared",
  "validateBinding accepts valid binding",
  "validateBinding rejects invalid resource kind",
  "validateBinding rejects unsupported required signal",
  "requests stay on declared hosts and methods",
  "requests carry abort signals and no unexpected headers",
  "collect result is schema-valid",
  "timestamps are safe",
  "no serialized secret",
  "oversized response rejected",
  "abort deadline honored",
  "errors use the closed taxonomy"
];

describe("fixture adapter", () => {
  it("passes the full conformance suite", async () => {
    const report = await runAdapterConformance(createFixtureAdapter(), conformanceOptions());
    expect(report.checks).toEqual(expect.arrayContaining(EXPECTED_CHECKS));
  });

  it("maps HTTP statuses to the closed collector taxonomy", async () => {
    const adapter = createFixtureAdapter();
    const binding = buildMonitoringBinding();
    const credential = createCredentialHandle("railway-primary", "railway", CANARY);

    const run = (status: number, headers?: Record<string, string>) =>
      adapter.collect(
        {
          binding,
          credential,
          fetch: async () => new Response("x", { status, headers }),
          now: "2026-09-11T06:00:00Z"
        },
        new AbortController().signal
      );

    await expect(run(401)).rejects.toMatchObject({ name: "AdapterError", code: "authentication_failed" });
    await expect(run(403)).rejects.toMatchObject({ name: "AdapterError", code: "permission_denied" });
    await expect(run(429, { "retry-after": "120" })).rejects.toMatchObject({
      name: "AdapterError",
      code: "rate_limited",
      retryAfterSeconds: 120
    });
    await expect(run(500)).rejects.toMatchObject({ name: "AdapterError", code: "malformed_response" });
  });

  it("rejects malformed evidence bodies", async () => {
    const adapter = createFixtureAdapter();
    await expect(
      adapter.collect(
        {
          binding: buildMonitoringBinding(),
          credential: createCredentialHandle("railway-primary", "railway", CANARY),
          fetch: async () => new Response("not json", { status: 200 }),
          now: "2026-09-11T06:00:00Z"
        },
        new AbortController().signal
      )
    ).rejects.toMatchObject({ name: "AdapterError", code: "malformed_response" });
  });

  it("validateBinding flags wrong resource kinds and unsupported required signals", () => {
    const adapter = createFixtureAdapter();
    expect(adapter.validateBinding(buildMonitoringBinding()).ok).toBe(true);
    // Deliberately invalid bindings must bypass the strict schema (it rejects
    // them earlier), so construct them by spreading a valid parse.
    const wrongKind = { ...buildMonitoringBinding(), resource_kind: "project" };
    expect(adapter.validateBinding(wrongKind).ok).toBe(false);
    // Fixture declares deployment/runtime/usage; platform_incident is unsupported.
    const unsupported = { ...buildMonitoringBinding({ probe: undefined }), required_signals: ["platform_incident" as const] };
    expect(adapter.validateBinding(unsupported).ok).toBe(false);
  });
});

describe("railway adapter", () => {
  it("passes the full conformance suite", async () => {
    const report = await runAdapterConformance(createRailwayAdapter(), {
      binding: buildMonitoringBinding(),
      credential: createCredentialHandle("railway-primary", "railway", CANARY),
      now: "2026-09-11T06:00:00Z",
      secrets: [CANARY],
      respond: (request) => {
        const body = JSON.parse(request.body ?? "{}") as { query?: string };
        return body.query?.includes("deployments")
          ? { status: 200, body: JSON.stringify(railwayDeploymentSuccess) }
          : { status: 200, body: JSON.stringify(railwayMetricsComplete) };
      }
    });
    expect(report.provider).toBe("railway");
    expect(report.checks).toEqual(expect.arrayContaining(EXPECTED_CHECKS));
  });
});

describe("fly adapter", () => {
  const flyBinding: MonitoringBinding = monitoringBindingSchema.parse({
    id: "fly-production-web",
    provider: "fly",
    resource_kind: "app",
    resource_id: "paper-web",
    environment: "production",
    expected_runtime: "always-on",
    required_signals: ["runtime", "usage"],
    credential_ref: "fly-primary",
    console_url: "https://fly.io/apps/paper-web"
  });
  const FLY_CANARY = "conformance-canary-fly-token-2b3c4d5e";

  it("passes the full conformance suite", async () => {
    const report = await runAdapterConformance(createFlyAdapter(), {
      binding: flyBinding,
      credential: createCredentialHandle("fly-primary", "fly", FLY_CANARY),
      now: "2026-09-11T06:00:00Z",
      secrets: [FLY_CANARY],
      respond: () => ({ status: 200, body: JSON.stringify(flyMachinesHealthy) })
    });
    expect(report.provider).toBe("fly");
    expect(report.checks).toEqual(expect.arrayContaining(EXPECTED_CHECKS));
  });
});

describe("neon adapter", () => {
  const NEON_CANARY = "conformance-canary-neon-token-4d5e6f7a";

  it("passes the full conformance suite", async () => {
    const report = await runAdapterConformance(createNeonAdapter(), {
      binding: buildNeonBinding({ required_signals: ["runtime", "usage"] }),
      credential: createCredentialHandle("neon-primary", "neon", NEON_CANARY),
      now: "2026-09-11T06:00:00Z",
      secrets: [NEON_CANARY],
      respond: (request) => {
        const url = new URL(request.url);
        if (url.pathname.startsWith("/api/v2/consumption_history/")) {
          return { status: 200, body: JSON.stringify(neonConsumptionPaid) };
        }
        if (url.pathname.endsWith("/endpoints")) {
          return { status: 200, body: JSON.stringify(neonEndpointsActive) };
        }
        return { status: 200, body: JSON.stringify(neonProjectPaid) };
      }
    });
    expect(report.provider).toBe("neon");
    expect(report.checks).toEqual(expect.arrayContaining(EXPECTED_CHECKS));
  });
});

describe("supabase adapter", () => {
  const supabaseBinding: MonitoringBinding = monitoringBindingSchema.parse({
    id: "supabase-production-db",
    provider: "supabase",
    resource_kind: "project",
    resource_id: "abcdefghijklmnopqrst",
    environment: "production",
    expected_runtime: "always-on",
    required_signals: ["runtime", "usage"],
    credential_ref: "supabase-primary",
    console_url: "https://supabase.com/dashboard/project/abcdefghijklmnopqrst"
  });
  const SUPABASE_CANARY = "conformance-canary-supabase-token-8b9c0d1e";

  it("passes the full conformance suite", async () => {
    const report = await runAdapterConformance(createSupabaseAdapter(), {
      binding: supabaseBinding,
      credential: createCredentialHandle("supabase-primary", "supabase", SUPABASE_CANARY),
      now: "2026-09-11T06:00:00Z",
      secrets: [SUPABASE_CANARY],
      respond: (request) => {
        const url = new URL(request.url);
        return url.pathname.includes("/analytics/endpoints/")
          ? { status: 200, body: JSON.stringify(supabaseApiCounts) }
          : { status: 200, body: JSON.stringify(supabaseHealthHealthy) };
      }
    });
    expect(report.provider).toBe("supabase");
    expect(report.checks).toEqual(expect.arrayContaining(EXPECTED_CHECKS));
  });
});

describe("conformance harness rejects non-conforming adapters", () => {
  function brokenAdapter(mutate: (adapter: MonitoringAdapter) => void): MonitoringAdapter {
    const base = createFixtureAdapter();
    const adapter: MonitoringAdapter = {
      provider: base.provider,
      version: base.version,
      capabilities: (binding) => base.capabilities(binding),
      validateBinding: (binding) => base.validateBinding(binding),
      collect: (input, signal) => base.collect(input, signal)
    };
    mutate(adapter);
    return adapter;
  }

  async function expectViolation(adapter: MonitoringAdapter, match: RegExp | string) {
    try {
      await runAdapterConformance(adapter, conformanceOptions());
    } catch (error) {
      expect(error).toBeInstanceOf(ConformanceViolation);
      expect((error as ConformanceViolation).violations.join("\n")).toMatch(match);
      return;
    }
    expect.unreachable("expected a conformance violation");
  }

  it("fails an adapter that calls an undeclared host", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async (input) => {
        await input.fetch("https://evil.example.net/api", { method: "GET", signal: new AbortController().signal });
        return { adapter: { version: "x", capabilities: [] }, deployment: null, runtime: null, usage: [], platform_incident: null };
      };
    });
    await expectViolation(adapter, /host/i);
  });

  it("fails an adapter that omits the abort signal", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async (input) => {
        await input.fetch("https://fixture-collector.invalid/v1/collect/x", { method: "GET" });
        return { adapter: { version: "x", capabilities: [] }, deployment: null, runtime: null, usage: [], platform_incident: null };
      };
    });
    await expectViolation(adapter, /abort|signal/i);
  });

  it("fails an adapter that sets unexpected headers", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async (input) => {
        await input.fetch("https://fixture-collector.invalid/v1/collect/x", {
          method: "GET",
          headers: { "x-custom": "nope" },
          signal: new AbortController().signal
        });
        return { adapter: { version: "x", capabilities: [] }, deployment: null, runtime: null, usage: [], platform_incident: null };
      };
    });
    await expectViolation(adapter, /header/i);
  });

  it("fails an adapter whose result is not schema-valid", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async (input) => {
        await input.fetch("https://fixture-collector.invalid/v1/collect/x", {
          method: "GET",
          signal: new AbortController().signal
        });
        return {
          adapter: { version: "x", capabilities: [] },
          deployment: { state: "banana", observed_at: NOW },
          runtime: null,
          usage: [],
          platform_incident: null
        } as never;
      };
    });
    await expectViolation(adapter, /schema/i);
  });

  it("fails an adapter that serializes the credential", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async (input) => {
        await input.fetch("https://fixture-collector.invalid/v1/collect/x", {
          method: "GET",
          signal: new AbortController().signal
        });
        return {
          adapter: { version: "x", capabilities: [] },
          deployment: { state: "succeeded", observed_at: NOW },
          runtime: { state: "unknown", observed_at: NOW, detail: `token was ${input.credential.authorizationHeader()}` },
          usage: [],
          platform_incident: null
        };
      };
    });
    await expectViolation(adapter, /secret/i);
  });

  it("fails an adapter that throws outside the closed taxonomy", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async () => {
        throw new Error("raw boom");
      };
    });
    await expectViolation(adapter, /taxonomy|AdapterError/i);
  });

  it("fails an adapter that ignores an aborted signal", async () => {
    const adapter = brokenAdapter((a) => {
      a.collect = async () => {
        throw new AdapterError("malformed_response", "ignored abort");
      };
    });
    await expectViolation(adapter, /abort/i);
  });
});

describe("createRecordingTransport", () => {
  it("records method, headers, body, and signal for inspection", async () => {
    const { fetch, requests } = createRecordingTransport(() => ({ status: 200, body: "{}" }));
    const controller = new AbortController();
    await fetch("https://fixture-collector.invalid/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{q:1}",
      signal: controller.signal
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "POST", body: "{q:1}" });
    expect(requests[0].signal).toBe(controller.signal);
  });
});
