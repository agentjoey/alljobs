import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { monitoringBindingSchema } from "../../domain/schemas";
import type { ExpectedRuntime, MonitoringBinding } from "../../domain/types";
import { createCredentialHandle } from "../../collector/credentials";
import { AdapterError, isAdapterError, type AdapterCollectResult } from "../contracts";
import { createRecordingTransport, type TransportResponder } from "../conformance";
import { createNeonAdapter, NEON_API_HOST } from "./index";
import projectFree from "./fixtures/project-free.json";
import projectPaid from "./fixtures/project-paid.json";
import projectNoTransfer from "./fixtures/project-no-transfer.json";
import endpointsActive from "./fixtures/endpoints-active.json";
import endpointsIdle from "./fixtures/endpoints-idle.json";
import endpointsSuspended from "./fixtures/endpoints-suspended.json";
import endpointsInit from "./fixtures/endpoints-init.json";
import endpointsEmpty from "./fixtures/endpoints-empty.json";
import consumptionPaid from "./fixtures/consumption-paid.json";

// Neon adapter contract tests (design §12.1, §13; plan Task 6). All Neon API
// traffic is answered from local fixtures through the injected fetch seam; the
// canary token proves no secret leaks into results or errors. Fixtures mirror
// the documented Neon API v2 shapes re-verified 2026-09-11 (see the reference
// block in ./index.ts).

const NOW = "2026-09-11T06:00:00Z";
const CANARY = "neon-canary-token-7a8b9c0d1e2f";
const ORG_ID = "org-spring-garden-12345";

function buildNeonBinding(overrides: Record<string, unknown> = {}): MonitoringBinding {
  return monitoringBindingSchema.parse({
    id: "neon-production-db",
    provider: "neon",
    resource_kind: "project",
    resource_id: "cool-project",
    environment: "production",
    expected_runtime: "scale-to-zero",
    required_signals: ["runtime", "usage"],
    credential_ref: "neon-primary",
    console_url: "https://console.neon.tech/app/projects/cool-project",
    ...overrides
  });
}

interface NeonScript {
  project?: { status?: number; body?: unknown; headers?: Record<string, string> };
  endpoints?: { status?: number; body?: unknown; headers?: Record<string, string> };
  consumption?: { status?: number; body?: unknown; headers?: Record<string, string> };
}

/** Dispatches fixture responses by request URL path, mirroring the documented routes. */
function respondNeon(script: NeonScript): TransportResponder {
  return (request) => {
    const url = new URL(request.url);
    const pick =
      url.pathname.startsWith("/api/v2/consumption_history/")
        ? script.consumption
        : url.pathname.endsWith("/endpoints")
          ? script.endpoints
          : script.project;
    const answer = pick ?? { status: 500, body: { code: "unexpected", message: "unscripted request" } };
    return {
      status: answer.status ?? 200,
      headers: answer.headers,
      body: typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body ?? {})
    };
  };
}

const SUCCESS_SCRIPT: NeonScript = {
  project: { body: projectPaid },
  endpoints: { body: endpointsActive },
  consumption: { body: consumptionPaid }
};

function collectWith(respond: TransportResponder, binding: MonitoringBinding = buildNeonBinding()) {
  const transport = createRecordingTransport(respond);
  const adapter = createNeonAdapter();
  const result = adapter.collect(
    { binding, credential: createCredentialHandle("neon-primary", "neon", CANARY), fetch: transport.fetch, now: NOW },
    new AbortController().signal
  );
  return { result, requests: transport.requests };
}

describe("neon adapter requests", () => {
  it("issues fixed authenticated GETs in order: project, endpoints, then org-scoped consumption", async () => {
    const { result, requests } = collectWith(respondNeon(SUCCESS_SCRIPT));
    await result;

    expect(requests).toHaveLength(3);
    const [projectRequest, endpointsRequest, consumptionRequest] = requests;
    for (const request of requests) {
      expect(request.method).toBe("GET");
      expect(request.body).toBeNull();
      expect(request.headers.authorization).toBe(`Bearer ${CANARY}`);
      expect(request.headers.accept).toBe("application/json");
      expect(request.signal).toBeInstanceOf(AbortSignal);
      expect(request.redirect).toBe("manual");
    }
    expect(projectRequest.url).toBe(`https://${NEON_API_HOST}/api/v2/projects/cool-project`);
    expect(endpointsRequest.url).toBe(`https://${NEON_API_HOST}/api/v2/projects/cool-project/endpoints`);

    // The optional paid consumption query may only run after the project
    // payload validated, and must carry the org_id from that payload.
    const consumptionUrl = new URL(consumptionRequest.url);
    expect(consumptionUrl.pathname).toBe("/api/v2/consumption_history/v2/projects");
    expect(consumptionUrl.searchParams.get("org_id")).toBe(ORG_ID);
    expect(consumptionUrl.searchParams.get("project_ids")).toBe("cool-project");
    expect(consumptionUrl.searchParams.get("granularity")).toBe("daily");
    expect(consumptionUrl.searchParams.get("metrics")).toContain("compute_unit_seconds");
    expect(consumptionUrl.searchParams.get("from")).toBeTruthy();
    expect(consumptionUrl.searchParams.get("to")).toBe(NOW);
  });

  it("never runs the consumption query when the validated project carries no org_id", async () => {
    const noOrg = {
      project: { ...projectPaid.project, org_id: undefined }
    };
    const { result, requests } = collectWith(
      respondNeon({ project: { body: noOrg }, endpoints: { body: endpointsActive } })
    );
    const collected = await result;
    expect(requests).toHaveLength(2);
    const consumptionMeasures = collected.usage.filter((measure) => measure.metric !== "data_transfer_bytes");
    expect(consumptionMeasures.length).toBeGreaterThan(0);
    for (const measure of consumptionMeasures) {
      expect(measure.availability).toBe("not_available");
      expect(measure.value).toBeUndefined();
    }
  });

  it("fails fast on a schema-invalid project payload before any follow-up request", async () => {
    const invalid = { project: { ...projectPaid.project, org_id: 42 } };
    const { result, requests } = collectWith(
      respondNeon({ project: { body: invalid }, endpoints: { body: endpointsActive } })
    );
    try {
      await result;
      expect.unreachable("invalid project payload must be rejected");
    } catch (error) {
      expect(isAdapterError(error)).toBe(true);
      expect((error as AdapterError).code).toBe("malformed_response");
    }
    expect(requests).toHaveLength(1);
  });

  it("declares fixed capabilities", () => {
    const adapter = createNeonAdapter();
    const capabilities = adapter.capabilities(buildNeonBinding());
    expect(capabilities.implemented).toBe(true);
    expect(capabilities.apiHosts).toEqual([NEON_API_HOST]);
    expect(capabilities.methods).toEqual(["GET"]);
    expect(capabilities.resourceKinds).toEqual(["project"]);
    expect(capabilities.supportedSignals).toEqual(["runtime", "usage"]);
    expect(capabilities.consoleHosts).toEqual(["console.neon.tech"]);
    expect(adapter.provider).toBe("neon");
  });

  it("rejects an invalid project slug before any request is made", async () => {
    const invalid = { ...buildNeonBinding(), resource_id: "Bad_Project/../../admin" };
    const { result, requests } = collectWith(respondNeon(SUCCESS_SCRIPT), invalid);
    try {
      await result;
      expect.unreachable("invalid project slug must be rejected");
    } catch (error) {
      expect(isAdapterError(error)).toBe(true);
      expect((error as AdapterError).code).toBe("unsupported_capability");
    }
    expect(requests).toHaveLength(0);
  });
});

describe("neon runtime normalization", () => {
  function collectRuntime(endpoints: unknown, binding: MonitoringBinding = buildNeonBinding()) {
    return collectWith(
      respondNeon({ project: { body: projectFree }, endpoints: { body: endpoints }, consumption: { status: 403 } }),
      binding
    ).result;
  }

  it("reports healthy when any compute endpoint is active", async () => {
    const collected = await collectRuntime(endpointsActive);
    expect(collected.runtime).toMatchObject({ state: "healthy", observed_at: NOW, source: "provider" });
    expect(collected.deployment).toBeNull();
    expect(collected.platform_incident).toBeNull();
  });

  it("reports idle computes as expected_idle faithfully under every expected-runtime policy", async () => {
    const policies: ExpectedRuntime[] = ["always-on", "scale-to-zero", "scheduled", "manual"];
    for (const policy of policies) {
      const collected = await collectRuntime(endpointsIdle, buildNeonBinding({ expected_runtime: policy }));
      // The adapter reports provider truth (idle = suspended per the Neon
      // EndpointState docs); the attention evaluator owns policy matching.
      expect(collected.runtime).toMatchObject({ state: "expected_idle", observed_at: NOW, source: "provider" });
    }
  });

  it("reports suspended computes as stopped faithfully under every expected-runtime policy", async () => {
    const policies: ExpectedRuntime[] = ["always-on", "scale-to-zero", "scheduled", "manual"];
    for (const policy of policies) {
      const collected = await collectRuntime(endpointsSuspended, buildNeonBinding({ expected_runtime: policy }));
      expect(collected.runtime).toMatchObject({ state: "stopped", observed_at: NOW, source: "provider" });
    }
  });

  it("reports initializing computes as degraded without inventing health", async () => {
    const collected = await collectRuntime(endpointsInit);
    expect(collected.runtime).toMatchObject({ state: "degraded", observed_at: NOW, source: "provider" });
  });

  it("reports unrecognized endpoint states as unknown rather than an invented state", async () => {
    const migrated = { endpoints: [{ ...endpointsIdle.endpoints[0], current_state: "migrating" }] };
    const collected = await collectRuntime(migrated);
    expect(collected.runtime).toMatchObject({ state: "unknown", observed_at: NOW, source: "provider" });
  });

  it("reports a project with no compute endpoints as unknown", async () => {
    const collected = await collectRuntime(endpointsEmpty);
    expect(collected.runtime).toMatchObject({ state: "unknown", observed_at: NOW, source: "provider" });
  });
});

describe("neon usage normalization", () => {
  it("exposes free-plan data_transfer_bytes as a provider-estimated billing-period measure", async () => {
    const { result, requests } = collectWith(
      respondNeon({ project: { body: projectFree }, endpoints: { body: endpointsIdle }, consumption: { status: 403 } })
    );
    const collected = await result;
    // Free plan: the paid consumption endpoint rejects, so only the project
    // transfer measure carries a value.
    expect(requests).toHaveLength(3);
    const transfer = collected.usage.find((measure) => measure.metric === "data_transfer_bytes");
    expect(transfer).toMatchObject({
      value: 7340032,
      unit: "bytes",
      availability: "available",
      billing_alignment: "provider_estimate",
      period_start: "2026-09-01T00:00:00Z",
      // The provider value only reflects usage up to receipt time, so the
      // reported period ends at `now`, not at the future billing period end.
      period_end: NOW,
      provider_reported_at: NOW
    });
    expect(transfer?.cost).toBeUndefined();
    expect(transfer?.currency).toBeUndefined();
    expect(transfer?.allowance).toBeUndefined();
  });

  it("aggregates paid consumption metrics per billing period as provider estimates", async () => {
    const { result } = collectWith(respondNeon(SUCCESS_SCRIPT));
    const collected = await result;
    const byMetric = new Map(collected.usage.map((measure) => [measure.metric, measure]));

    expect(byMetric.get("compute_unit_seconds")).toMatchObject({
      value: 4500,
      unit: "cu_seconds",
      availability: "available",
      billing_alignment: "provider_estimate",
      period_start: "2026-09-01T00:00:00Z",
      period_end: NOW,
      provider_reported_at: NOW
    });
    expect(byMetric.get("root_branch_bytes_month")).toMatchObject({ value: 4100000, availability: "available" });
    expect(byMetric.get("public_network_transfer_bytes")).toMatchObject({ value: 1572864, unit: "bytes" });
    // Neon does not label any consumption metric invoice-aligned, so nothing
    // may ever be reported with exact billing alignment.
    for (const measure of collected.usage) {
      expect(measure.billing_alignment).not.toBe("exact");
      expect(measure.cost).toBeUndefined();
      expect(Date.parse(measure.period_end)).toBeGreaterThan(Date.parse(measure.period_start));
    }
  });

  it("downgrades a 403 paid-consumption capability to not_available without failing collection", async () => {
    const { result } = collectWith(
      respondNeon({ project: { body: projectPaid }, endpoints: { body: endpointsActive }, consumption: { status: 403 } })
    );
    const collected = await result;
    expect(collected.runtime).toMatchObject({ state: "healthy" });
    const transfer = collected.usage.find((measure) => measure.metric === "data_transfer_bytes");
    expect(transfer).toMatchObject({ availability: "available", value: 1073741824 });
    const consumptionMeasures = collected.usage.filter((measure) => measure.metric !== "data_transfer_bytes");
    expect(consumptionMeasures.length).toBeGreaterThan(0);
    for (const measure of consumptionMeasures) {
      expect(measure.availability).toBe("not_available");
      expect(measure.value).toBeUndefined();
    }
  });

  it("downgrades a 404 org-mismatch on consumption the same way", async () => {
    const { result } = collectWith(
      respondNeon({ project: { body: projectPaid }, endpoints: { body: endpointsActive }, consumption: { status: 404 } })
    );
    const collected = await result;
    const compute = collected.usage.find((measure) => measure.metric === "compute_unit_seconds");
    expect(compute).toMatchObject({ availability: "not_available" });
    expect(compute?.value).toBeUndefined();
  });

  it("downgrades a malformed consumption payload instead of failing collection", async () => {
    const { result } = collectWith(
      respondNeon({ project: { body: projectPaid }, endpoints: { body: endpointsActive }, consumption: { body: "not json" } })
    );
    const collected = await result;
    const compute = collected.usage.find((measure) => measure.metric === "compute_unit_seconds");
    expect(compute).toMatchObject({ availability: "not_available" });
    expect(collected.runtime).toMatchObject({ state: "healthy" });
  });

  it("throws when usage is required and no usage measure is available at all", async () => {
    const { result } = collectWith(
      respondNeon({
        project: { body: projectNoTransfer },
        endpoints: { body: endpointsIdle },
        consumption: { status: 403 }
      }),
      buildNeonBinding({ required_signals: ["runtime", "usage"] })
    );
    try {
      await result;
      expect.unreachable("required usage with no available measure must throw");
    } catch (error) {
      expect(isAdapterError(error)).toBe(true);
      expect((error as AdapterError).code).toBe("unsupported_capability");
    }
  });

  it("keeps optional usage collectible when no usage measure is available", async () => {
    const { result } = collectWith(
      respondNeon({
        project: { body: projectNoTransfer },
        endpoints: { body: endpointsIdle },
        consumption: { status: 403 }
      }),
      buildNeonBinding({ required_signals: ["runtime"] })
    );
    const collected = await result;
    expect(collected.usage.length).toBeGreaterThan(0);
    for (const measure of collected.usage) {
      expect(measure.availability).toBe("not_available");
      expect(measure.value).toBeUndefined();
    }
    expect(collected.runtime).toMatchObject({ state: "expected_idle" });
  });
});

describe("neon error mapping", () => {
  async function expectAdapterError(script: NeonScript, code: string, retryAfterSeconds?: number) {
    const { result } = collectWith(respondNeon(script));
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

  it("maps HTTP statuses to the closed taxonomy, including 429 retry metadata", async () => {
    await expectAdapterError({ project: { status: 401 } }, "authentication_failed");
    await expectAdapterError({ project: { status: 403 } }, "permission_denied");
    await expectAdapterError({ project: { status: 429, headers: { "retry-after": "45" } }, }, "rate_limited", 45);
    await expectAdapterError({ project: { status: 500 } }, "malformed_response");
    await expectAdapterError(
      { project: { body: projectPaid }, endpoints: { status: 401 } },
      "authentication_failed"
    );
  });

  it("rejects malformed bodies and schema-invalid shapes on the primary reads", async () => {
    await expectAdapterError({ project: { body: "not json" } }, "malformed_response");
    await expectAdapterError(
      { project: { body: { project: { ...projectPaid.project, data_transfer_bytes: "a lot" } } } },
      "malformed_response"
    );
    await expectAdapterError(
      { project: { body: projectPaid }, endpoints: { body: "not json" } },
      "malformed_response"
    );
    await expectAdapterError(
      { project: { body: projectPaid }, endpoints: { body: { endpoints: [{ id: 42 }] } } },
      "malformed_response"
    );
  });
});

describe("neon adapter safety", () => {
  it("never lets the credential canary reach serialized results", async () => {
    const { result } = collectWith(respondNeon(SUCCESS_SCRIPT));
    const collected = await result;
    expect(JSON.stringify(collected)).not.toContain(CANARY);
  });

  it("keeps every reported timestamp at or before the Control Host receipt time", async () => {
    const { result } = collectWith(respondNeon(SUCCESS_SCRIPT));
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
    const fixtureDir = join(process.cwd(), "lib/monitoring/adapters/neon/fixtures");
    const files = readdirSync(fixtureDir).filter((file) => file.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(join(fixtureDir, file), "utf8");
      expect(content).not.toMatch(/bearer\s+\S+/i);
      expect(content).not.toMatch(/authorization|api[_-]?key|access[_-]?token|secret|password|neonctl_|napi_/i);
    }
  });

  it("validateBinding accepts a valid binding and flags invalid ones", () => {
    const adapter = createNeonAdapter();
    expect(adapter.validateBinding(buildNeonBinding()).ok).toBe(true);
    expect(adapter.validateBinding({ ...buildNeonBinding(), resource_kind: "service" }).ok).toBe(false);
    expect(adapter.validateBinding({ ...buildNeonBinding(), provider: "supabase" }).ok).toBe(false);
    const deployment = { ...buildNeonBinding(), required_signals: ["deployment" as const] };
    expect(adapter.validateBinding(deployment).ok).toBe(false);
    const incident = { ...buildNeonBinding(), required_signals: ["platform_incident" as const] };
    expect(adapter.validateBinding(incident).ok).toBe(false);
  });
});
