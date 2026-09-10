import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMonitoringBinding } from "../../domain/fixtures";
import { monitoringBindingSchema } from "../../domain/schemas";
import type { MonitoringBinding } from "../../domain/types";
import { createCredentialHandle } from "../../collector/credentials";
import { AdapterError, isAdapterError, type AdapterCollectResult } from "../contracts";
import { createRecordingTransport, type TransportResponder } from "../conformance";
import { createRailwayAdapter, RAILWAY_API_HOST } from "./index";
import {
  assertReadOnlyQueryDocument,
  RAILWAY_LATEST_DEPLOYMENT_QUERY,
  RAILWAY_QUERY_DOCUMENTS,
  RAILWAY_SERVICE_METRICS_QUERY
} from "./queries";
import deploymentSuccess from "./fixtures/deployment-success.json";
import deploymentFailed from "./fixtures/deployment-failed.json";
import deploymentBuilding from "./fixtures/deployment-building.json";
import deploymentSleeping from "./fixtures/deployment-sleeping.json";
import graphqlNotAuthorized from "./fixtures/graphql-error-not-authorized.json";
import metricsComplete from "./fixtures/metrics-complete.json";
import metricsPartial from "./fixtures/metrics-partial.json";

// Railway adapter contract tests (design §12.1, §13; plan Task 5). All
// provider traffic is answered from local fixtures through the injected fetch
// seam; the canary token proves no secret leaks into results or errors.

const NOW = "2026-09-11T06:00:00Z";
const CANARY = "railway-canary-token-4d5e6f7a8b9c";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ENVIRONMENT_ID = "22222222-2222-4222-8222-222222222222";
const SERVICE_ID = "33333333-3333-4333-8333-333333333333";

const SUCCESS_DEPLOYMENT = { status: 200, body: JSON.stringify(deploymentSuccess) };
const SUCCESS_METRICS = { status: 200, body: JSON.stringify(metricsComplete) };

/** Routes the two fixed query documents to per-document stub responses. */
function respondRailway(
  deployment: { status: number; headers?: Record<string, string>; body?: string },
  metrics: { status: number; headers?: Record<string, string>; body?: string } = SUCCESS_METRICS
): TransportResponder {
  return (request) => {
    const parsed = JSON.parse(request.body ?? "{}") as { query?: string };
    return parsed.query?.includes("deployments") ? deployment : metrics;
  };
}

function collectWith(
  respond: TransportResponder,
  binding: MonitoringBinding = buildMonitoringBinding()
) {
  const transport = createRecordingTransport(respond);
  const adapter = createRailwayAdapter();
  const result = adapter.collect(
    { binding, credential: createCredentialHandle("railway-primary", "railway", CANARY), fetch: transport.fetch, now: NOW },
    new AbortController().signal
  );
  return { result, requests: transport.requests };
}

function parseBody(body: string | null): { query: string; variables: Record<string, unknown> } {
  return JSON.parse(body ?? "{}") as { query: string; variables: Record<string, unknown> };
}

describe("railway query documents", () => {
  it("ships exactly two static read-only query documents", () => {
    expect(RAILWAY_QUERY_DOCUMENTS).toHaveLength(2);
    expect(new Set(RAILWAY_QUERY_DOCUMENTS).size).toBe(2);
    expect(RAILWAY_QUERY_DOCUMENTS).toContain(RAILWAY_LATEST_DEPLOYMENT_QUERY);
    expect(RAILWAY_QUERY_DOCUMENTS).toContain(RAILWAY_SERVICE_METRICS_QUERY);
    for (const document of RAILWAY_QUERY_DOCUMENTS) {
      expect(document.trimStart()).toMatch(/^query\s/);
      expect(document).not.toMatch(/mutation/i);
    }
  });

  it("rejects documents containing a mutation", () => {
    try {
      assertReadOnlyQueryDocument("mutation DeleteService { serviceDelete(id: \"x\") }");
      expect.unreachable("mutation document must be rejected");
    } catch (error) {
      expect(isAdapterError(error)).toBe(true);
      expect((error as AdapterError).code).toBe("unsupported_capability");
    }
    expect(() => assertReadOnlyQueryDocument(RAILWAY_LATEST_DEPLOYMENT_QUERY)).not.toThrow();
    expect(() => assertReadOnlyQueryDocument(RAILWAY_SERVICE_METRICS_QUERY)).not.toThrow();
  });
});

describe("railway adapter requests", () => {
  it("posts only the two fixed documents to the fixed endpoint with bound variables", async () => {
    const { result, requests } = collectWith(respondRailway(SUCCESS_DEPLOYMENT));
    await result;

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url).toBe(`https://${RAILWAY_API_HOST}/graphql/v2`);
      expect(request.method).toBe("POST");
      expect(request.headers.authorization).toBe(`Bearer ${CANARY}`);
      expect(request.headers["content-type"]).toBe("application/json");
      expect(request.signal).toBeInstanceOf(AbortSignal);
      // Binding values travel as variables only — never concatenated into the
      // GraphQL document text.
      const body = parseBody(request.body);
      expect(body.query).not.toContain(PROJECT_ID);
      expect(body.query).not.toContain(ENVIRONMENT_ID);
      expect(body.query).not.toContain(SERVICE_ID);
    }
    const [deploymentBody, metricsBody] = requests.map((request) => parseBody(request.body));
    expect(deploymentBody.query).toBe(RAILWAY_LATEST_DEPLOYMENT_QUERY);
    expect(deploymentBody.variables).toEqual({
      projectId: PROJECT_ID,
      environmentId: ENVIRONMENT_ID,
      serviceId: SERVICE_ID
    });
    expect(metricsBody.query).toBe(RAILWAY_SERVICE_METRICS_QUERY);
    expect(metricsBody.variables).toMatchObject({
      projectId: PROJECT_ID,
      environmentId: ENVIRONMENT_ID,
      serviceId: SERVICE_ID,
      measurements: ["CPU_USAGE", "MEMORY_USAGE_GB", "NETWORK_RX_GB", "NETWORK_TX_GB"]
    });
    expect(typeof metricsBody.variables.startDate).toBe("string");
    expect(Date.parse(metricsBody.variables.startDate as string)).toBeLessThan(Date.parse(NOW));
  });

  it("declares fixed capabilities", () => {
    const adapter = createRailwayAdapter();
    const capabilities = adapter.capabilities(buildMonitoringBinding());
    expect(capabilities.implemented).toBe(true);
    expect(capabilities.apiHosts).toEqual([RAILWAY_API_HOST]);
    expect(capabilities.methods).toEqual(["POST"]);
    expect(capabilities.supportedSignals).toEqual(["deployment", "usage"]);
    expect(adapter.provider).toBe("railway");
  });
});

describe("railway deployment normalization", () => {
  it("maps SUCCESS to a succeeded deployment", async () => {
    const { result } = collectWith(respondRailway(SUCCESS_DEPLOYMENT));
    const collected = await result;
    expect(collected.deployment).toMatchObject({
      state: "succeeded",
      deployment_id: "dep-7f3a1b2c9d4e",
      observed_at: NOW,
      url: "https://web-production.up.railway.app"
    });
    expect(collected.runtime).toBeNull();
  });

  it("maps FAILED to a failed deployment", async () => {
    const { result } = collectWith(respondRailway({ status: 200, body: JSON.stringify(deploymentFailed) }));
    const collected = await result;
    expect(collected.deployment).toMatchObject({ state: "failed", deployment_id: "dep-1a2b3c4d5e6f" });
  });

  it("maps BUILDING to a building deployment", async () => {
    const { result } = collectWith(respondRailway({ status: 200, body: JSON.stringify(deploymentBuilding) }));
    const collected = await result;
    expect(collected.deployment).toMatchObject({ state: "building", deployment_id: "dep-9z8y7x6w5v4u" });
  });

  it("maps SLEEPING to succeeded deployment plus stopped runtime for always-on", async () => {
    const { result } = collectWith(respondRailway({ status: 200, body: JSON.stringify(deploymentSleeping) }));
    const collected = await result;
    expect(collected.deployment).toMatchObject({ state: "succeeded", deployment_id: "dep-5s4l3e2e1p0z" });
    expect(collected.runtime).toMatchObject({ state: "stopped", observed_at: NOW, source: "provider" });
    expect(collected.runtime?.detail).toContain("SLEEPING");
  });

  it("maps SLEEPING to expected_idle runtime under an idle-compatible policy", async () => {
    const binding = buildMonitoringBinding({ expected_runtime: "scale-to-zero" });
    const { result } = collectWith(respondRailway({ status: 200, body: JSON.stringify(deploymentSleeping) }), binding);
    const collected = await result;
    expect(collected.runtime).toMatchObject({ state: "expected_idle", observed_at: NOW, source: "provider" });
  });

  it("maps REMOVED to cancelled deployment plus stopped runtime evidence", async () => {
    const removed = {
      data: {
        deployments: {
          edges: [{ node: { ...deploymentSleeping.data.deployments.edges[0].node, status: "REMOVED" } }]
        }
      }
    };
    const { result } = collectWith(respondRailway({ status: 200, body: JSON.stringify(removed) }));
    const collected = await result;
    expect(collected.deployment).toMatchObject({ state: "cancelled" });
    expect(collected.runtime).toMatchObject({ state: "stopped", source: "provider" });
    expect(collected.runtime?.detail).toContain("REMOVED");
  });

  it("maps an unrecognized provider status to unavailable without inventing a state", async () => {
    const future = {
      data: {
        deployments: {
          edges: [{ node: { ...deploymentSuccess.data.deployments.edges[0].node, status: "TELEPORTING" } }]
        }
      }
    };
    const { result } = collectWith(respondRailway({ status: 200, body: JSON.stringify(future) }));
    const collected = await result;
    expect(collected.deployment).toMatchObject({ state: "unavailable" });
  });

  it("reports an empty deployment history as unavailable evidence", async () => {
    const empty = { data: { deployments: { edges: [] } } };
    const { result } = collectWith(respondRailway({ status: 200, body: JSON.stringify(empty) }));
    const collected = await result;
    expect(collected.deployment).toMatchObject({ state: "unavailable", observed_at: NOW });
    expect(collected.deployment?.deployment_id).toBeUndefined();
  });
});

describe("railway usage normalization", () => {
  it("aggregates CPU/memory/network series as operational-only measures", async () => {
    const { result } = collectWith(respondRailway(SUCCESS_DEPLOYMENT));
    const collected = await result;
    expect(collected.usage).toHaveLength(4);
    const byMetric = new Map(collected.usage.map((measure) => [measure.metric, measure]));

    expect(byMetric.get("cpu_usage")?.value).toBeCloseTo(0.3, 10);
    expect(byMetric.get("cpu_usage")?.unit).toBe("vcpu_cores");
    expect(byMetric.get("memory_usage_gb")?.value).toBeCloseTo(0.6, 10);
    expect(byMetric.get("network_rx_gb")?.value).toBeCloseTo(0.03, 10);
    expect(byMetric.get("network_tx_gb")?.value).toBeCloseTo(0.02, 10);

    for (const measure of collected.usage) {
      expect(measure.billing_alignment).toBe("operational_only");
      expect(measure.availability).toBe("available");
      // Billing cost/allowance stays unavailable: never a fabricated value.
      expect(measure.cost).toBeUndefined();
      expect(measure.allowance).toBeUndefined();
      expect(measure.currency).toBeUndefined();
      expect(Date.parse(measure.period_end)).toBeGreaterThan(Date.parse(measure.period_start));
      expect(measure.provider_reported_at).toBe(NOW);
    }
  });

  it("marks missing optional metric series not_available without a synthetic value", async () => {
    const { result } = collectWith(
      respondRailway(SUCCESS_DEPLOYMENT, { status: 200, body: JSON.stringify(metricsPartial) })
    );
    const collected = await result;
    const byMetric = new Map(collected.usage.map((measure) => [measure.metric, measure]));

    expect(byMetric.get("cpu_usage")).toMatchObject({ availability: "available" });
    expect(byMetric.get("cpu_usage")?.value).toBeCloseTo(0.2, 10);
    expect(byMetric.get("network_rx_gb")?.value).toBeCloseTo(0.01, 10);
    for (const missing of ["memory_usage_gb", "network_tx_gb"]) {
      const measure = byMetric.get(missing);
      expect(measure).toMatchObject({ availability: "not_available", billing_alignment: "operational_only" });
      expect(measure?.value).toBeUndefined();
    }
  });
});

describe("railway error mapping", () => {
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

  it("rejects malformed GraphQL bodies and shapes", async () => {
    await expectAdapterError(respondRailway({ status: 200, body: "not json" }), "malformed_response");
    await expectAdapterError(
      respondRailway({ status: 200, body: JSON.stringify({ data: { deployments: { edges: "nope" } } }) }),
      "malformed_response"
    );
    await expectAdapterError(
      respondRailway(SUCCESS_DEPLOYMENT, { status: 200, body: JSON.stringify({ data: { metrics: { nope: 1 } } }) }),
      "malformed_response"
    );
  });

  it("maps GraphQL authorization errors returned with HTTP 200 to permission_denied", async () => {
    await expectAdapterError(
      respondRailway({ status: 200, body: JSON.stringify(graphqlNotAuthorized) }),
      "permission_denied"
    );
  });

  it("maps other GraphQL errors returned with HTTP 200 to malformed_response", async () => {
    const validationFailed = {
      errors: [{ message: "Cannot query field \"nope\".", extensions: { code: "GRAPHQL_VALIDATION_FAILED" } }],
      data: null
    };
    await expectAdapterError(respondRailway({ status: 200, body: JSON.stringify(validationFailed) }), "malformed_response");
  });

  it("maps HTTP statuses to the closed taxonomy, including 429 retry metadata", async () => {
    await expectAdapterError(respondRailway({ status: 401, body: "{}" }), "authentication_failed");
    await expectAdapterError(respondRailway({ status: 403, body: "{}" }), "permission_denied");
    await expectAdapterError(
      respondRailway({ status: 429, headers: { "retry-after": "45" }, body: "{}" }),
      "rate_limited",
      45
    );
    await expectAdapterError(respondRailway({ status: 500, body: "{}" }), "malformed_response");
  });
});

describe("railway adapter safety", () => {
  it("never lets the credential canary reach serialized results", async () => {
    const { result } = collectWith(respondRailway(SUCCESS_DEPLOYMENT));
    const collected = await result;
    expect(JSON.stringify(collected)).not.toContain(CANARY);
  });

  it("keeps every reported timestamp at or before the Control Host receipt time", async () => {
    const { result } = collectWith(respondRailway(SUCCESS_DEPLOYMENT));
    const collected: AdapterCollectResult = await result;
    const nowMs = Date.parse(NOW);
    const timestamps: string[] = [];
    if (collected.deployment) timestamps.push(collected.deployment.observed_at);
    if (collected.runtime) timestamps.push(collected.runtime.observed_at);
    for (const measure of collected.usage) {
      timestamps.push(measure.period_start, measure.period_end, measure.provider_reported_at);
    }
    expect(timestamps.length).toBeGreaterThan(0);
    for (const timestamp of timestamps) {
      expect(Date.parse(timestamp)).toBeLessThanOrEqual(nowMs);
    }
  });

  it("rejects a binding whose resource_id is not a service locator", async () => {
    const invalid = { ...buildMonitoringBinding(), resource_id: "not/a-locator" };
    const { result } = collectWith(respondRailway(SUCCESS_DEPLOYMENT), invalid);
    try {
      await result;
      expect.unreachable("invalid locator must be rejected");
    } catch (error) {
      expect(isAdapterError(error)).toBe(true);
      expect((error as AdapterError).code).toBe("unsupported_capability");
    }
  });

  it("fixture files carry no token-shaped or authorization data", () => {
    const fixtureDir = join(process.cwd(), "lib/monitoring/adapters/railway/fixtures");
    const files = readdirSync(fixtureDir).filter((file) => file.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(join(fixtureDir, file), "utf8");
      expect(content).not.toMatch(/bearer\s+\S+/i);
      expect(content).not.toMatch(/authorization|api[_-]?key|access[_-]?token|secret|password/i);
    }
  });

  it("validateBinding accepts a valid binding and flags invalid ones", () => {
    const adapter = createRailwayAdapter();
    expect(adapter.validateBinding(buildMonitoringBinding()).ok).toBe(true);
    expect(adapter.validateBinding({ ...buildMonitoringBinding(), resource_kind: "app" }).ok).toBe(false);
    expect(adapter.validateBinding({ ...buildMonitoringBinding(), provider: "fly" }).ok).toBe(false);
    const unsupported = {
      ...buildMonitoringBinding({ probe: undefined }),
      required_signals: ["platform_incident" as const]
    };
    expect(adapter.validateBinding(unsupported).ok).toBe(false);
    const schemaValid = monitoringBindingSchema.safeParse(buildMonitoringBinding());
    expect(schemaValid.success).toBe(true);
  });
});
