import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { monitoringBindingSchema } from "../../domain/schemas";
import type { MonitoringBinding } from "../../domain/types";
import { createCredentialHandle } from "../../collector/credentials";
import { AdapterError, isAdapterError, type AdapterCollectResult } from "../contracts";
import { createRecordingTransport, type TransportResponder } from "../conformance";
import { createSupabaseAdapter, SUPABASE_API_HOST, SUPABASE_HEALTH_SERVICES } from "./index";
import healthHealthy from "./fixtures/health-healthy.json";
import healthComingUp from "./fixtures/health-coming-up.json";
import healthDegraded from "./fixtures/health-degraded.json";
import healthUnhealthy from "./fixtures/health-unhealthy.json";
import healthPartial from "./fixtures/health-partial.json";
import apiCounts from "./fixtures/api-counts.json";
import apiCountsEmpty from "./fixtures/api-counts-empty.json";

// Supabase Management API adapter contract tests (design §12.1, §13; plan
// Task 6). All Management API traffic is answered from local fixtures through
// the injected fetch seam; the canary token proves no secret leaks into
// results or errors. Fixtures mirror the documented shapes re-verified
// 2026-09-11 (see the reference block in ./index.ts).

const NOW = "2026-09-11T06:00:00Z";
const CANARY = "supabase-canary-token-3e4f5a6b7c8d";
const PROJECT_REF = "abcdefghijklmnopqrst";

function buildSupabaseBinding(overrides: Record<string, unknown> = {}): MonitoringBinding {
  return monitoringBindingSchema.parse({
    id: "supabase-production-db",
    provider: "supabase",
    resource_kind: "project",
    resource_id: PROJECT_REF,
    environment: "production",
    expected_runtime: "always-on",
    required_signals: ["runtime", "usage"],
    credential_ref: "supabase-primary",
    console_url: "https://supabase.com/dashboard/project/abcdefghijklmnopqrst",
    ...overrides
  });
}

interface SupabaseScript {
  health?: { status?: number; body?: unknown; headers?: Record<string, string> };
  usage?: { status?: number; body?: unknown; headers?: Record<string, string> };
}

/** Dispatches fixture responses by request URL path, mirroring the documented routes. */
function respondSupabase(script: SupabaseScript): TransportResponder {
  return (request) => {
    const url = new URL(request.url);
    const pick = url.pathname.includes("/analytics/endpoints/") ? script.usage : script.health;
    const answer = pick ?? { status: 500, body: { message: "unscripted request" } };
    return {
      status: answer.status ?? 200,
      headers: answer.headers,
      body: typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body ?? {})
    };
  };
}

const SUCCESS_SCRIPT: SupabaseScript = {
  health: { body: healthHealthy },
  usage: { body: apiCounts }
};

function collectWith(respond: TransportResponder, binding: MonitoringBinding = buildSupabaseBinding()) {
  const transport = createRecordingTransport(respond);
  const adapter = createSupabaseAdapter();
  const result = adapter.collect(
    {
      binding,
      credential: createCredentialHandle("supabase-primary", "supabase", CANARY),
      fetch: transport.fetch,
      now: NOW
    },
    new AbortController().signal
  );
  return { result, requests: transport.requests };
}

describe("supabase adapter requests", () => {
  it("issues fixed authenticated GETs for health then API-count usage", async () => {
    const { result, requests } = collectWith(respondSupabase(SUCCESS_SCRIPT));
    await result;

    expect(requests).toHaveLength(2);
    const [healthRequest, usageRequest] = requests;
    for (const request of requests) {
      expect(request.method).toBe("GET");
      expect(request.body).toBeNull();
      expect(request.headers.authorization).toBe(`Bearer ${CANARY}`);
      expect(request.headers.accept).toBe("application/json");
      expect(request.signal).toBeInstanceOf(AbortSignal);
      expect(request.redirect).toBe("manual");
    }
    const healthUrl = new URL(healthRequest.url);
    expect(healthUrl.origin).toBe(`https://${SUPABASE_API_HOST}`);
    expect(healthUrl.pathname).toBe(`/v1/projects/${PROJECT_REF}/health`);
    expect(healthUrl.searchParams.get("services")).toBe(SUPABASE_HEALTH_SERVICES.join(","));

    const usageUrl = new URL(usageRequest.url);
    expect(usageUrl.pathname).toBe(`/v1/projects/${PROJECT_REF}/analytics/endpoints/usage.api-counts`);
    expect(usageUrl.searchParams.get("interval")).toBe("1day");
  });

  it("declares fixed capabilities", () => {
    const adapter = createSupabaseAdapter();
    const capabilities = adapter.capabilities(buildSupabaseBinding());
    expect(capabilities.implemented).toBe(true);
    expect(capabilities.apiHosts).toEqual([SUPABASE_API_HOST]);
    expect(capabilities.methods).toEqual(["GET"]);
    expect(capabilities.resourceKinds).toEqual(["project"]);
    expect(capabilities.supportedSignals).toEqual(["runtime", "usage"]);
    expect(capabilities.consoleHosts).toEqual(["supabase.com", "app.supabase.com"]);
    expect(adapter.provider).toBe("supabase");
  });

  it("rejects an invalid project ref before any request is made", async () => {
    const invalid = { ...buildSupabaseBinding(), resource_id: "Bad-Ref/../admin" };
    const { result, requests } = collectWith(respondSupabase(SUCCESS_SCRIPT), invalid);
    try {
      await result;
      expect.unreachable("invalid project ref must be rejected");
    } catch (error) {
      expect(isAdapterError(error)).toBe(true);
      expect((error as AdapterError).code).toBe("unsupported_capability");
    }
    expect(requests).toHaveLength(0);
  });
});

describe("supabase runtime normalization", () => {
  function collectRuntime(health: unknown) {
    return collectWith(respondSupabase({ health: { body: health }, usage: { body: apiCounts } })).result;
  }

  it("reports healthy when every requested service is ACTIVE_HEALTHY", async () => {
    const collected = await collectRuntime(healthHealthy);
    expect(collected.runtime).toMatchObject({ state: "healthy", observed_at: NOW, source: "provider" });
    expect(collected.deployment).toBeNull();
    expect(collected.platform_incident).toBeNull();
  });

  it("reports degraded when some services are UNHEALTHY", async () => {
    const collected = await collectRuntime(healthDegraded);
    expect(collected.runtime).toMatchObject({ state: "degraded", observed_at: NOW, source: "provider" });
  });

  it("reports unhealthy when every reported service is UNHEALTHY", async () => {
    const collected = await collectRuntime(healthUnhealthy);
    expect(collected.runtime).toMatchObject({ state: "unhealthy", observed_at: NOW, source: "provider" });
  });

  it("reports COMING_UP services as degraded without inventing health", async () => {
    const collected = await collectRuntime(healthComingUp);
    expect(collected.runtime).toMatchObject({ state: "degraded", observed_at: NOW, source: "provider" });
  });

  it("reports partial health evidence (missing services, service errors) as degraded", async () => {
    const collected = await collectRuntime(healthPartial);
    expect(collected.runtime).toMatchObject({ state: "degraded", observed_at: NOW, source: "provider" });
    expect(collected.runtime?.detail).toContain("pooler");
  });

  it("reports undocumented service statuses as unknown rather than an invented state", async () => {
    const unknownStatus = healthHealthy.map((service) => ({ ...service, status: "PAUSED" }));
    const collected = await collectRuntime(unknownStatus);
    expect(collected.runtime).toMatchObject({ state: "unknown", observed_at: NOW, source: "provider" });
  });
});

describe("supabase usage normalization", () => {
  it("aggregates API request counts as operational-only measures with no allowance", async () => {
    const { result } = collectWith(respondSupabase(SUCCESS_SCRIPT));
    const collected = await result;
    const byMetric = new Map(collected.usage.map((measure) => [measure.metric, measure]));

    expect(byMetric.get("auth_requests")).toMatchObject({ value: 1500, unit: "requests" });
    expect(byMetric.get("realtime_requests")).toMatchObject({ value: 420, unit: "requests" });
    expect(byMetric.get("rest_requests")).toMatchObject({ value: 7000, unit: "requests" });
    expect(byMetric.get("storage_requests")).toMatchObject({ value: 60, unit: "requests" });

    for (const measure of collected.usage) {
      // The provider response carries no matching allowance, so none is set;
      // request totals are operational evidence, never billable consumption.
      expect(measure.billing_alignment).toBe("operational_only");
      expect(measure.allowance).toBeUndefined();
      expect(measure.cost).toBeUndefined();
      expect(measure.availability).toBe("available");
      expect(measure.period_start).toBe("2026-09-10T06:00:00Z");
      expect(measure.period_end).toBe(NOW);
      expect(measure.provider_reported_at).toBe(NOW);
    }
    // Usage stays separate from health: the runtime signal is unaffected.
    expect(collected.runtime).toMatchObject({ state: "healthy" });
  });

  it("reports an empty result window as not_available rather than a synthetic zero", async () => {
    const { result } = collectWith(respondSupabase({ health: { body: healthHealthy }, usage: { body: apiCountsEmpty } }));
    const collected = await result;
    expect(collected.usage.length).toBeGreaterThan(0);
    for (const measure of collected.usage) {
      expect(measure.availability).toBe("not_available");
      expect(measure.value).toBeUndefined();
    }
  });

  it("downgrades a permission failure on optional usage without failing collection", async () => {
    const optionalUsage = buildSupabaseBinding({ required_signals: ["runtime"] });
    for (const status of [401, 403, 500]) {
      const { result } = collectWith(
        respondSupabase({ health: { body: healthHealthy }, usage: { status } }),
        optionalUsage
      );
      const collected = await result;
      expect(collected.runtime).toMatchObject({ state: "healthy" });
      expect(collected.usage.length).toBeGreaterThan(0);
      for (const measure of collected.usage) {
        expect(measure.availability).toBe("not_available");
        expect(measure.value).toBeUndefined();
      }
    }
  });

  it("throws when usage is required and the usage endpoint denies permission", async () => {
    const requiredUsage = buildSupabaseBinding({ required_signals: ["runtime", "usage"] });
    const expected: Record<number, string> = { 401: "authentication_failed", 403: "permission_denied", 500: "malformed_response" };
    for (const [status, code] of Object.entries(expected)) {
      const { result } = collectWith(
        respondSupabase({ health: { body: healthHealthy }, usage: { status: Number(status) } }),
        requiredUsage
      );
      try {
        await result;
        expect.unreachable(`expected AdapterError ${code}`);
      } catch (error) {
        expect(isAdapterError(error)).toBe(true);
        expect((error as AdapterError).code).toBe(code);
      }
    }
  });

  it("treats a malformed usage payload as unavailable when usage is optional", async () => {
    const optionalUsage = buildSupabaseBinding({ required_signals: ["runtime"] });
    const { result } = collectWith(
      respondSupabase({ health: { body: healthHealthy }, usage: { body: "not json" } }),
      optionalUsage
    );
    const collected = await result;
    for (const measure of collected.usage) {
      expect(measure.availability).toBe("not_available");
    }
    expect(collected.runtime).toMatchObject({ state: "healthy" });
  });

  it("throws malformed_response for a malformed usage payload when usage is required", async () => {
    const { result } = collectWith(
      respondSupabase({ health: { body: healthHealthy }, usage: { body: "not json" } })
    );
    try {
      await result;
      expect.unreachable("expected AdapterError malformed_response");
    } catch (error) {
      expect(isAdapterError(error)).toBe(true);
      expect((error as AdapterError).code).toBe("malformed_response");
    }
  });
});

describe("supabase error mapping", () => {
  async function expectAdapterError(script: SupabaseScript, code: string, retryAfterSeconds?: number) {
    const { result } = collectWith(respondSupabase(script));
    try {
      await result;
      expect.unreachable(`expected AdapterError ${code}`);
    } catch (error) {
      expect(isAdapterError(error)).toBe(true);
      expect((error as AdapterError).code).toBe(code);
      if (retryAfterSeconds !== undefined) {
        expect((error as AdapterError).retryAfterSeconds).toBe(retryAfterSeconds);
      }
      expect(String(error)).not.toContain(CANARY);
    }
  }

  it("maps health-endpoint HTTP statuses to the closed taxonomy, including 429 retry metadata", async () => {
    await expectAdapterError({ health: { status: 401 } }, "authentication_failed");
    await expectAdapterError({ health: { status: 403 } }, "permission_denied");
    await expectAdapterError({ health: { status: 429, headers: { "retry-after": "60" } } }, "rate_limited", 60);
    await expectAdapterError({ health: { status: 500 } }, "malformed_response");
  });

  it("rejects malformed health bodies and schema-invalid shapes", async () => {
    await expectAdapterError({ health: { body: "not json" } }, "malformed_response");
    await expectAdapterError({ health: { body: { services: [] } } }, "malformed_response");
    await expectAdapterError({ health: { body: [{ name: 42, status: "ACTIVE_HEALTHY" }] } }, "malformed_response");
  });
});

describe("supabase adapter safety", () => {
  it("never lets the credential canary reach serialized results", async () => {
    const { result } = collectWith(respondSupabase(SUCCESS_SCRIPT));
    const collected = await result;
    expect(JSON.stringify(collected)).not.toContain(CANARY);
  });

  it("keeps every reported timestamp at or before the Control Host receipt time", async () => {
    const { result } = collectWith(respondSupabase(SUCCESS_SCRIPT));
    const collected: AdapterCollectResult = await result;
    const nowMs = Date.parse(NOW);
    const timestamps: string[] = [];
    if (collected.runtime) timestamps.push(collected.runtime.observed_at);
    for (const measure of collected.usage) {
      timestamps.push(measure.period_start, measure.period_end, measure.provider_reported_at);
    }
    expect(timestamps.length).toBeGreaterThan(0);
    for (const timestamp of timestamps) {
      expect(Date.parse(timestamp)).toBeLessThanOrEqual(nowMs);
    }
  });

  it("fixture files carry no token-shaped or authorization data", () => {
    const fixtureDir = join(process.cwd(), "lib/monitoring/adapters/supabase/fixtures");
    const files = readdirSync(fixtureDir).filter((file) => file.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(join(fixtureDir, file), "utf8");
      expect(content).not.toMatch(/bearer\s+\S+/i);
      expect(content).not.toMatch(/authorization|api[_-]?key|access[_-]?token|secret|password|sbp_[a-z0-9]/i);
    }
  });

  it("validateBinding accepts a valid binding and flags invalid ones", () => {
    const adapter = createSupabaseAdapter();
    expect(adapter.validateBinding(buildSupabaseBinding()).ok).toBe(true);
    expect(adapter.validateBinding({ ...buildSupabaseBinding(), resource_kind: "service" }).ok).toBe(false);
    expect(adapter.validateBinding({ ...buildSupabaseBinding(), provider: "neon" }).ok).toBe(false);
    const deployment = { ...buildSupabaseBinding(), required_signals: ["deployment" as const] };
    expect(adapter.validateBinding(deployment).ok).toBe(false);
    const incident = { ...buildSupabaseBinding(), required_signals: ["platform_incident" as const] };
    expect(adapter.validateBinding(incident).ok).toBe(false);
  });
});
