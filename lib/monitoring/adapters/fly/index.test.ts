import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { monitoringBindingSchema } from "../../domain/schemas";
import type { ExpectedRuntime, MonitoringBinding } from "../../domain/types";
import { createCredentialHandle } from "../../collector/credentials";
import { AdapterError, isAdapterError, type AdapterCollectResult } from "../contracts";
import { createRecordingTransport, type TransportResponder } from "../conformance";
import { createFlyAdapter, FLY_API_HOST } from "./index";
import machinesHealthy from "./fixtures/machines-healthy.json";
import machinesDegraded from "./fixtures/machines-degraded.json";
import machinesUnhealthy from "./fixtures/machines-unhealthy.json";
import machinesStopped from "./fixtures/machines-stopped.json";
import machinesTransitioning from "./fixtures/machines-transitioning.json";
import machinesEmpty from "./fixtures/machines-empty.json";

// Fly.io adapter contract tests (design §12.1, §13; plan Task 5). Machines
// API traffic is answered from local fixtures through the injected fetch
// seam; the canary token proves no secret leaks into results or errors.

const NOW = "2026-09-11T06:00:00Z";
const CANARY = "fly-canary-token-1c2d3e4f5a6b";

function buildFlyBinding(overrides: Record<string, unknown> = {}): MonitoringBinding {
  return monitoringBindingSchema.parse({
    id: "fly-production-web",
    provider: "fly",
    resource_kind: "app",
    resource_id: "paper-web",
    environment: "production",
    expected_runtime: "always-on",
    required_signals: ["runtime", "usage"],
    credential_ref: "fly-primary",
    console_url: "https://fly.io/apps/paper-web",
    ...overrides
  });
}

function respondMachines(body: unknown, status = 200, headers?: Record<string, string>): TransportResponder {
  return () => ({ status, headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

function collectWith(respond: TransportResponder, binding: MonitoringBinding = buildFlyBinding()) {
  const transport = createRecordingTransport(respond);
  const adapter = createFlyAdapter();
  const result = adapter.collect(
    { binding, credential: createCredentialHandle("fly-primary", "fly", CANARY), fetch: transport.fetch, now: NOW },
    new AbortController().signal
  );
  return { result, requests: transport.requests };
}

describe("fly adapter requests", () => {
  it("issues a single authenticated GET to the fixed Machines endpoint", async () => {
    const { result, requests } = collectWith(respondMachines(machinesHealthy));
    await result;

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request.url).toBe(`https://${FLY_API_HOST}/v1/apps/paper-web/machines`);
    expect(request.method).toBe("GET");
    expect(request.body).toBeNull();
    expect(request.headers.authorization).toBe(`Bearer ${CANARY}`);
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("declares fixed capabilities", () => {
    const adapter = createFlyAdapter();
    const capabilities = adapter.capabilities(buildFlyBinding());
    expect(capabilities.implemented).toBe(true);
    expect(capabilities.apiHosts).toEqual([FLY_API_HOST]);
    expect(capabilities.methods).toEqual(["GET"]);
    expect(capabilities.supportedSignals).toEqual(["runtime", "usage"]);
    expect(adapter.provider).toBe("fly");
  });

  it("rejects an invalid app slug before any request is made", async () => {
    const invalid = { ...buildFlyBinding(), resource_id: "Bad_App/../../admin" };
    const { result, requests } = collectWith(respondMachines(machinesHealthy), invalid);
    try {
      await result;
      expect.unreachable("invalid app slug must be rejected");
    } catch (error) {
      expect(isAdapterError(error)).toBe(true);
      expect((error as AdapterError).code).toBe("unsupported_capability");
    }
    expect(requests).toHaveLength(0);
  });
});

describe("fly runtime normalization", () => {
  it("reports healthy when machines run with passing health checks", async () => {
    const { result } = collectWith(respondMachines(machinesHealthy));
    const collected = await result;
    expect(collected.runtime).toMatchObject({ state: "healthy", observed_at: NOW, source: "provider" });
    expect(collected.deployment).toBeNull();
    expect(collected.platform_incident).toBeNull();
  });

  it("summarizes failing health checks on some machines as degraded", async () => {
    const { result } = collectWith(respondMachines(machinesDegraded));
    const collected = await result;
    expect(collected.runtime).toMatchObject({ state: "degraded", observed_at: NOW, source: "provider" });
    expect(collected.runtime?.detail).toContain("critical");
  });

  it("summarizes failing health checks on every started machine as unhealthy", async () => {
    const { result } = collectWith(respondMachines(machinesUnhealthy));
    const collected = await result;
    expect(collected.runtime).toMatchObject({ state: "unhealthy", observed_at: NOW, source: "provider" });
  });

  it("reports transitioning machines as degraded without inventing health", async () => {
    const { result } = collectWith(respondMachines(machinesTransitioning));
    const collected = await result;
    expect(collected.runtime).toMatchObject({ state: "degraded", observed_at: NOW, source: "provider" });
  });

  it("reports stopped machines faithfully as stopped under every expected-runtime policy", async () => {
    const policies: ExpectedRuntime[] = ["always-on", "scale-to-zero", "scheduled", "manual"];
    for (const policy of policies) {
      const { result } = collectWith(
        respondMachines(machinesStopped),
        buildFlyBinding({ expected_runtime: policy })
      );
      const collected = await result;
      // The adapter reports provider truth; the evaluator owns policy matching.
      expect(collected.runtime).toMatchObject({ state: "stopped", observed_at: NOW, source: "provider" });
    }
  });

  it("reports an empty machine list as stopped under every expected-runtime policy", async () => {
    const policies: ExpectedRuntime[] = ["always-on", "scale-to-zero", "scheduled", "manual"];
    for (const policy of policies) {
      const { result } = collectWith(respondMachines(machinesEmpty), buildFlyBinding({ expected_runtime: policy }));
      const collected = await result;
      expect(collected.runtime).toMatchObject({ state: "stopped", observed_at: NOW, source: "provider" });
      const machineCount = collected.usage.find((measure) => measure.metric === "machine_count");
      expect(machineCount).toMatchObject({ availability: "available", value: 0 });
    }
  });
});

describe("fly usage normalization", () => {
  it("aggregates machine count and allocations as operational-only measures", async () => {
    const { result } = collectWith(respondMachines(machinesHealthy));
    const collected = await result;
    const byMetric = new Map(collected.usage.map((measure) => [measure.metric, measure]));

    expect(byMetric.get("machine_count")).toMatchObject({ value: 2, unit: "machines", availability: "available" });
    expect(byMetric.get("allocated_vcpu")).toMatchObject({ value: 3, unit: "vcpu", availability: "available" });
    expect(byMetric.get("allocated_memory_mb")).toMatchObject({ value: 768, unit: "MB", availability: "available" });

    for (const measure of collected.usage) {
      // Allocation is operational evidence, never billable consumption.
      expect(measure.billing_alignment).toBe("operational_only");
      expect(measure.cost).toBeUndefined();
      expect(measure.allowance).toBeUndefined();
      expect(measure.currency).toBeUndefined();
      expect(Date.parse(measure.period_end)).toBeGreaterThan(Date.parse(measure.period_start));
      expect(measure.provider_reported_at).toBe(NOW);
    }
  });
});

describe("fly error mapping", () => {
  async function expectAdapterError(respond: TransportResponder, code: string, retryAfterSeconds?: number) {
    const { result } = collectWith(respond);
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

  it("rejects malformed bodies and shapes", async () => {
    await expectAdapterError(respondMachines("not json"), "malformed_response");
    await expectAdapterError(respondMachines({ machines: [] }), "malformed_response");
    await expectAdapterError(respondMachines([{ id: 42, state: "started" }]), "malformed_response");
  });

  it("maps HTTP statuses to the closed taxonomy, including 429 retry metadata", async () => {
    await expectAdapterError(respondMachines("{}", 401), "authentication_failed");
    await expectAdapterError(respondMachines("{}", 403), "permission_denied");
    await expectAdapterError(respondMachines("{}", 429, { "retry-after": "30" }), "rate_limited", 30);
    await expectAdapterError(respondMachines("{}", 500), "malformed_response");
  });
});

describe("fly adapter safety", () => {
  it("never lets the credential canary reach serialized results", async () => {
    const { result } = collectWith(respondMachines(machinesHealthy));
    const collected = await result;
    expect(JSON.stringify(collected)).not.toContain(CANARY);
  });

  it("keeps every reported timestamp at or before the Control Host receipt time", async () => {
    const { result } = collectWith(respondMachines(machinesHealthy));
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
    const fixtureDir = join(process.cwd(), "lib/monitoring/adapters/fly/fixtures");
    const files = readdirSync(fixtureDir).filter((file) => file.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(join(fixtureDir, file), "utf8");
      expect(content).not.toMatch(/bearer\s+\S+/i);
      expect(content).not.toMatch(/authorization|api[_-]?key|access[_-]?token|secret|password|fo1_|fm1_|fm2_/i);
    }
  });

  it("validateBinding accepts a valid binding and flags invalid ones", () => {
    const adapter = createFlyAdapter();
    expect(adapter.validateBinding(buildFlyBinding()).ok).toBe(true);
    expect(adapter.validateBinding({ ...buildFlyBinding(), resource_kind: "service" }).ok).toBe(false);
    expect(adapter.validateBinding({ ...buildFlyBinding(), provider: "railway" }).ok).toBe(false);
    const unsupported = { ...buildFlyBinding(), required_signals: ["deployment" as const] };
    expect(adapter.validateBinding(unsupported).ok).toBe(false);
  });
});
