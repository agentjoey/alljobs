import { z } from "zod";
import { monitoringBindingSchema, type RequiredSignal } from "../../domain/schemas";
import type { DeploymentSignal, MonitoringBinding, RuntimeSignal, UsageMeasure } from "../../domain/types";
import {
  ADAPTER_MAX_REQUEST_BODY_BYTES,
  ADAPTER_MAX_RESPONSE_BYTES,
  AdapterError,
  isAdapterError,
  type AdapterCapabilities,
  type AdapterCollectInput,
  type AdapterCollectResult,
  type BindingValidation,
  type MonitoringAdapter
} from "../contracts";
import {
  assertReadOnlyQueryDocument,
  RAILWAY_LATEST_DEPLOYMENT_QUERY,
  RAILWAY_METRIC_MEASUREMENTS,
  RAILWAY_SERVICE_METRICS_QUERY
} from "./queries";

// Railway Public API adapter (design §12.1, §13; plan Task 5). Speaks only to
// the fixed backboard GraphQL endpoint with the two static read-only query
// documents from ./queries; binding values are bound as GraphQL variables and
// never concatenated into document text. Metrics evidence is operational-only:
// CPU/memory/network measures, never billing cost or allowance.

export const RAILWAY_API_HOST = "backboard.railway.com";
export const RAILWAY_ADAPTER_VERSION = "1.0.0";
const RAILWAY_GRAPHQL_URL = `https://${RAILWAY_API_HOST}/graphql/v2`;
const SUPPORTED_SIGNALS: readonly RequiredSignal[] = ["deployment", "usage"];
/** Metrics lookback window; period boundaries of every usage measure. */
const METRICS_WINDOW_MS = 24 * 60 * 60 * 1000;

const RAILWAY_SERVICE_LOCATOR =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

interface ServiceLocator {
  projectId: string;
  environmentId: string;
  serviceId: string;
}

// Documented Railway deployment statuses (docs.railway.com/guides/manage-deployments,
// re-verified 2026-09-11) mapped onto the closed domain deployment states.
// SLEEPING means the deployment itself deployed and the service went idle, so
// the deployment evidence stays succeeded and the idle truth is reported as
// runtime evidence. Unknown future statuses degrade to "unavailable" rather
// than an invented state.
const RAILWAY_DEPLOYMENT_STATES: Readonly<Record<string, DeploymentSignal["state"]>> = {
  QUEUED: "queued",
  WAITING: "queued",
  BUILDING: "building",
  DEPLOYING: "building",
  INITIALIZING: "building",
  SUCCESS: "succeeded",
  SLEEPING: "succeeded",
  FAILED: "failed",
  CRASHED: "failed",
  SKIPPED: "cancelled",
  REMOVED: "cancelled"
};

const graphqlEnvelopeSchema = z.object({
  data: z.unknown().nullish(),
  errors: z
    .array(
      z.object({
        message: z.string().max(1000).optional(),
        extensions: z.object({ code: z.string().max(64).optional() }).optional()
      })
    )
    .max(16)
    .optional()
});

const deploymentsDataSchema = z.object({
  deployments: z.object({
    edges: z
      .array(
        z.object({
          node: z.object({
            id: z.string().min(1).max(128),
            status: z.string().min(1).max(32),
            createdAt: z.string().max(64).optional(),
            url: z.string().max(500).nullish()
          })
        })
      )
      .max(8)
  })
});

const metricsDataSchema = z.object({
  metrics: z
    .array(
      z.object({
        measurement: z.string().min(1).max(64),
        values: z.array(z.object({ ts: z.number(), value: z.number().nonnegative() })).max(4096)
      })
    )
    .max(16)
});

function parseServiceLocator(resourceId: string): ServiceLocator | null {
  const match = RAILWAY_SERVICE_LOCATOR.exec(resourceId);
  if (!match) return null;
  return { projectId: match[1], environmentId: match[2], serviceId: match[3] };
}

async function executeGraphql(
  input: AdapterCollectInput,
  document: string,
  variables: Record<string, unknown>,
  signal: AbortSignal
): Promise<unknown> {
  assertReadOnlyQueryDocument(document);
  const body = JSON.stringify({ query: document, variables });
  if (body.length > ADAPTER_MAX_REQUEST_BODY_BYTES) {
    throw new AdapterError("malformed_response", "railway request document exceeded the bounded size limit");
  }
  if (signal.aborted) {
    throw new AdapterError("timeout", "railway request aborted before dispatch");
  }

  let response: Response;
  try {
    response = await input.fetch(RAILWAY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        authorization: input.credential.authorizationHeader(),
        "content-type": "application/json",
        accept: "application/json"
      },
      body,
      redirect: "manual",
      signal
    });
  } catch (error) {
    if (isAdapterError(error)) throw error;
    const name = (error as { name?: string } | null)?.name;
    if (signal.aborted || name === "TimeoutError" || name === "AbortError") {
      throw new AdapterError("timeout", "railway request exceeded its abort deadline");
    }
    throw new AdapterError("malformed_response", "railway transport failed");
  }

  if (response.status === 401) throw new AdapterError("authentication_failed", "railway authentication failed");
  if (response.status === 403) throw new AdapterError("permission_denied", "railway permission denied");
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new AdapterError("rate_limited", "railway rate limited", {
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.floor(retryAfter) : undefined
    });
  }
  if (response.status < 200 || response.status >= 300) {
    throw new AdapterError("malformed_response", `railway responded with unexpected status ${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > ADAPTER_MAX_RESPONSE_BYTES) {
    throw new AdapterError("malformed_response", "railway response exceeded the bounded size limit");
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new AdapterError("malformed_response", "railway response body could not be read");
  }
  if (text.length > ADAPTER_MAX_RESPONSE_BYTES) {
    throw new AdapterError("malformed_response", "railway response exceeded the bounded size limit");
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdapterError("malformed_response", "railway response was not valid JSON");
  }
  const envelope = graphqlEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new AdapterError("malformed_response", "railway GraphQL envelope failed schema validation");
  }

  // Railway follows the GraphQL error convention: execution and authorization
  // failures return HTTP 200 with an errors array. Provider error messages are
  // never echoed; only the machine-readable extensions.code is carried.
  const errors = envelope.data.errors;
  if (errors && errors.length > 0) {
    const first = errors[0];
    if (first.message !== undefined && /not authorized/i.test(first.message)) {
      throw new AdapterError("permission_denied", "railway GraphQL authorization denied");
    }
    const code = first.extensions?.code;
    throw new AdapterError(
      "malformed_response",
      `railway GraphQL error${code ? ` (${code})` : ""}`
    );
  }
  if (envelope.data.data === null || envelope.data.data === undefined) {
    throw new AdapterError("malformed_response", "railway GraphQL response carried no data");
  }
  return envelope.data.data;
}

function normalizeDeployment(data: unknown, now: string): { signal: DeploymentSignal; status: string | null } {
  const parsed = deploymentsDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new AdapterError("malformed_response", "railway deployments payload failed schema validation");
  }
  const node = parsed.data.deployments.edges[0]?.node;
  if (!node) {
    return { signal: { state: "unavailable", observed_at: now }, status: null };
  }
  const state = RAILWAY_DEPLOYMENT_STATES[node.status] ?? "unavailable";
  const signal: DeploymentSignal = {
    state,
    deployment_id: node.id,
    // Receipt time marks when the Control Host observed this deployment as the
    // latest; the provider createdAt would otherwise age stable services into
    // permanent staleness.
    observed_at: now
  };
  if (node.url && node.url.startsWith("https://")) {
    signal.url = node.url;
  }
  return { signal, status: node.status };
}

function deriveRuntime(status: string | null, binding: MonitoringBinding, now: string): RuntimeSignal | null {
  // Sleeping/removed services are stopped evidence with expected_idle
  // provenance when the binding's expected-runtime policy permits idling;
  // deployment success alone never claims runtime health (that is the probe's
  // job when configured).
  if (status !== "SLEEPING" && status !== "REMOVED") return null;
  return {
    state: binding.expected_runtime === "always-on" ? "stopped" : "expected_idle",
    observed_at: now,
    source: "provider",
    detail: `railway latest deployment status is ${status}`
  };
}

const METRIC_DEFS = [
  { measurement: "CPU_USAGE", metric: "cpu_usage", unit: "vcpu_cores", aggregate: "avg" },
  { measurement: "MEMORY_USAGE_GB", metric: "memory_usage_gb", unit: "GB", aggregate: "avg" },
  { measurement: "NETWORK_RX_GB", metric: "network_rx_gb", unit: "GB", aggregate: "sum" },
  { measurement: "NETWORK_TX_GB", metric: "network_tx_gb", unit: "GB", aggregate: "sum" }
] as const;

function normalizeUsage(data: unknown, periodStart: string, now: string): UsageMeasure[] {
  const parsed = metricsDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new AdapterError("malformed_response", "railway metrics payload failed schema validation");
  }
  const series = new Map(parsed.data.metrics.map((entry) => [entry.measurement, entry.values]));
  return METRIC_DEFS.map((def) => {
    const base = {
      metric: def.metric,
      unit: def.unit,
      period_start: periodStart,
      period_end: now,
      provider_reported_at: now,
      billing_alignment: "operational_only" as const
    };
    const values = series.get(def.measurement);
    if (!values || values.length === 0) {
      // Optional series the provider did not return stay explicitly
      // unavailable — never a synthetic zero.
      return { ...base, availability: "not_available" as const };
    }
    const total = values.reduce((sum, sample) => sum + sample.value, 0);
    const value = def.aggregate === "avg" ? total / values.length : total;
    return { ...base, availability: "available" as const, value };
  });
}

export function createRailwayAdapter(): MonitoringAdapter {
  const provider = "railway" as const;

  function capabilities(): AdapterCapabilities {
    return {
      resourceKinds: ["service"],
      supportedSignals: SUPPORTED_SIGNALS,
      consoleHosts: ["railway.com", "railway.app"],
      implemented: true,
      apiHosts: [RAILWAY_API_HOST],
      methods: ["POST"],
      signalMaxAgeSeconds: { deployment: 3600, usage: 3600 }
    };
  }

  function validateBinding(binding: MonitoringBinding): BindingValidation {
    const issues: string[] = [];
    const parsed = monitoringBindingSchema.safeParse(binding);
    if (!parsed.success) {
      issues.push(...parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
    }
    if (binding.provider !== provider) {
      issues.push(`binding provider '${binding.provider}' does not match adapter provider '${provider}'`);
    }
    if (!capabilities().resourceKinds.includes(binding.resource_kind)) {
      issues.push(`resource_kind '${binding.resource_kind}' is not supported by this adapter`);
    }
    for (const signal of binding.required_signals) {
      if (!SUPPORTED_SIGNALS.includes(signal)) {
        issues.push(`required signal '${signal}' is not supported by this adapter`);
      }
    }
    return issues.length === 0 ? { ok: true } : { ok: false, issues };
  }

  async function collect(input: AdapterCollectInput, signal: AbortSignal): Promise<AdapterCollectResult> {
    if (signal.aborted) {
      throw new AdapterError("timeout", "railway request aborted before dispatch");
    }
    const locator = parseServiceLocator(input.binding.resource_id);
    if (!locator) {
      throw new AdapterError(
        "unsupported_capability",
        "railway binding resource_id is not a '<project UUID>/<environment UUID>/<service UUID>' locator"
      );
    }

    const deploymentData = await executeGraphql(input, RAILWAY_LATEST_DEPLOYMENT_QUERY, { ...locator }, signal);
    const deployment = normalizeDeployment(deploymentData, input.now);

    const periodStart = new Date(Date.parse(input.now) - METRICS_WINDOW_MS).toISOString();
    const metricsData = await executeGraphql(
      input,
      RAILWAY_SERVICE_METRICS_QUERY,
      { ...locator, startDate: periodStart, measurements: [...RAILWAY_METRIC_MEASUREMENTS] },
      signal
    );
    const usage = normalizeUsage(metricsData, periodStart, input.now);

    return {
      adapter: { version: RAILWAY_ADAPTER_VERSION, capabilities: [...SUPPORTED_SIGNALS] },
      deployment: deployment.signal,
      runtime: deriveRuntime(deployment.status, input.binding, input.now),
      usage,
      platform_incident: null
    };
  }

  return { provider, version: RAILWAY_ADAPTER_VERSION, capabilities, validateBinding, collect };
}
