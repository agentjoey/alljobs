import { z } from "zod";
import { monitoringBindingSchema, type RequiredSignal } from "../../domain/schemas";
import type { MonitoringBinding, RuntimeSignal, UsageMeasure } from "../../domain/types";
import {
  ADAPTER_MAX_RESPONSE_BYTES,
  AdapterError,
  isAdapterError,
  type AdapterCapabilities,
  type AdapterCollectInput,
  type AdapterCollectResult,
  type BindingValidation,
  type FetchLike,
  type MonitoringAdapter
} from "../contracts";

// Neon API v2 adapter (design §12.1, §13; plan Task 6). Three fixed read
// operations on the fixed console.neon.tech host, all Bearer-authenticated:
//   1. GET /api/v2/projects/{project_id}         — validated FIRST; org_id is
//      extracted from the validated payload before the consumption query may
//      run, and data_transfer_bytes is the provider-estimated
//      current-billing-period egress measure.
//   2. GET /api/v2/projects/{project_id}/endpoints — compute states drive the
//      runtime signal.
//   3. GET /api/v2/consumption_history/v2/projects — OPTIONAL paid-plan query
//      (Launch/Scale/Agent/Business/Enterprise only; 403 otherwise). Failures
//      here never fail collection: the measures downgrade to not_available.
//      The query window starts at the validated billing period start so the
//      summed timeframes cover exactly the period the measures are labeled
//      with (see the aggregation note on CONSUMPTION_METRICS below).
//
// Neon documents NO consumption metric as invoice-aligned, so every measure
// reports billing_alignment "provider_estimate" — "exact" is never emitted.
//
// Platform incidents: the verified public references document no stable
// platform-status API in scope for this task, so the adapter declares
// supportedSignals ["runtime", "usage"] only, always returns
// platform_incident: null / deployment: null, and validateBinding rejects a
// required platform_incident/deployment signal.
//
// References (re-verified 2026-09-11; adapter compatibility date 2026-09-11):
// - Neon API v2 OpenAPI document (base URL, BearerAuth scheme, Project and
//   Endpoint schemas, EndpointState enum, consumption paths):
//   https://neon.com/api_spec/release/v2.json
// - Retrieve project details (org_id, data_transfer_bytes — "Egress traffic
//   ... over the billing period. The value has some lag. The value is reset
//   at the beginning of each billing period", consumption_period_start/end):
//   https://neon.com/docs/reference/api/projects/get-project
// - List compute endpoints (EndpointState enum is exactly init/active/idle;
//   `idle` is documented as "suspended (scaled to zero)" — the current API
//   has no separate suspended state; a legacy `suspended` value is mapped
//   defensively to stopped, anything else to unknown):
//   https://neon.com/docs/reference/api/endpoints/list-project-endpoints
// - Retrieve project consumption metrics (v2, current plans; requires org_id,
//   from, to, granularity, metrics; 403 when the account plan is ineligible;
//   404 when the account is not a member of the org):
//   https://neon.com/docs/reference/api/consumption/get-consumption-history-per-project-v2
// - Usage and cost calculations (per-metric raw units and the documented
//   bill-reconciliation procedure — fetch the billing month and SUM each
//   metric across its timeframes; v2 storage metrics are byte-months, i.e.
//   byte-hours already divided by 744 per timeframe, and extra_branches_month
//   is raw branch-hours — every v2 metric is a per-timeframe accumulation,
//   none is a point-in-time snapshot, so summing timeframes is correct):
//   https://neon.com/docs/introduction/usage-calculations
// - API authentication (Bearer API key):
//   https://neon.com/docs/manage/api-keys
export const NEON_ADAPTER_COMPATIBILITY_DATE = "2026-09-11";

export const NEON_API_HOST = "console.neon.tech";
export const NEON_ADAPTER_VERSION = "1.0.0";
const NEON_API_BASE = `https://${NEON_API_HOST}/api/v2`;
const SUPPORTED_SIGNALS: readonly RequiredSignal[] = ["runtime", "usage"];

/** Neon project slug grammar (Task 1 domain schema SLUGGY_RESOURCE_ID). */
const NEON_PROJECT_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

// Documented consumption v2 metrics (OpenAPI
// ConsumptionHistoryQueryMetrics, re-verified 2026-09-11). Neon labels none of
// them invoice-aligned, so they are always provider estimates. Unit labels
// follow the raw units in the usage-calculations reference: the storage
// metrics arrive as byte-months (byte-hours/744 per timeframe), while
// extra_branches_month arrives as raw branch-hours despite its name.
const CONSUMPTION_METRICS = [
  { name: "compute_unit_seconds", unit: "cu_seconds" },
  { name: "root_branch_bytes_month", unit: "byte_months" },
  { name: "child_branch_bytes_month", unit: "byte_months" },
  { name: "instant_restore_bytes_month", unit: "byte_months" },
  { name: "public_network_transfer_bytes", unit: "bytes" },
  { name: "private_network_transfer_bytes", unit: "bytes" },
  { name: "extra_branches_month", unit: "branch_hours" },
  { name: "snapshot_storage_bytes_month", unit: "byte_months" }
] as const;

// Documented Neon EndpointState enum (OpenAPI, re-verified 2026-09-11):
// init (being initialized), active (running, accepting connections), idle
// (suspended / scaled to zero). The legacy `suspended` value is mapped
// defensively; anything outside these values is reported as unknown rather
// than mapped to an invented state.
const NEON_IDLE_STATES = new Set(["idle"]);
const NEON_STOPPED_STATES = new Set(["suspended"]);
const NEON_TRANSITIONING_STATES = new Set(["init"]);
const NEON_KNOWN_STATES = new Set(["active", "idle", "init", "suspended"]);

const isoDateTime = z.string().max(64).refine((value) => Number.isFinite(Date.parse(value)), {
  message: "must be a parseable date-time"
});

const neonProjectSchema = z.object({
  id: z.string().min(1).max(64),
  // Optional per the OpenAPI Project schema: personal-account projects may
  // carry no organization, in which case the org-scoped consumption query is
  // skipped entirely.
  org_id: z.string().min(1).max(64).optional(),
  // Optional in the adapter schema even though OpenAPI marks it required:
  // an absent counter is faithful not_available evidence, never a zero.
  data_transfer_bytes: z.number().int().nonnegative().optional(),
  consumption_period_start: isoDateTime,
  consumption_period_end: isoDateTime
});

const neonProjectResponseSchema = z.object({ project: neonProjectSchema });

const neonEndpointSchema = z.object({
  id: z.string().min(1).max(64),
  current_state: z.string().min(1).max(32)
});

const neonEndpointsResponseSchema = z.object({
  endpoints: z.array(neonEndpointSchema).max(256)
});

const neonConsumptionResponseSchema = z.object({
  projects: z
    .array(
      z.object({
        project_id: z.string().min(1).max(64),
        periods: z
          .array(
            z.object({
              period_start: isoDateTime,
              period_end: isoDateTime.optional(),
              consumption: z
                .array(
                  z.object({
                    metrics: z
                      .array(
                        z.object({
                          metric_name: z.string().min(1).max(64),
                          value: z.number().nonnegative()
                        })
                      )
                      .max(64)
                  })
                )
                .max(4096)
            })
          )
          .max(64)
      })
    )
    .max(100)
});

type NeonProject = z.infer<typeof neonProjectSchema>;
type NeonEndpoint = z.infer<typeof neonEndpointSchema>;

/** ISO timestamp at second precision (the injected `now` convention). */
function secondPrecisionIso(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

function deriveRuntime(endpoints: NeonEndpoint[], now: string): RuntimeSignal {
  const base = { observed_at: now, source: "provider" as const };
  if (endpoints.length === 0) {
    // A project with no compute endpoints carries no running or suspended
    // evidence at all; this is unknown, not an invented stopped/healthy.
    return { ...base, state: "unknown", detail: "neon returned no compute endpoints for this project" };
  }
  const active = endpoints.filter((endpoint) => endpoint.current_state === "active");
  if (active.length > 0) {
    // A running primary alongside idle read replicas is normal; any active
    // compute is healthy evidence.
    return { ...base, state: "healthy", detail: `${active.length} of ${endpoints.length} compute endpoint(s) active` };
  }
  const unrecognized = endpoints.filter((endpoint) => !NEON_KNOWN_STATES.has(endpoint.current_state));
  if (unrecognized.length > 0) {
    const states = [...new Set(unrecognized.map((endpoint) => endpoint.current_state))].join(", ");
    return { ...base, state: "unknown", detail: `unrecognized compute states (${states})` };
  }
  if (endpoints.some((endpoint) => NEON_TRANSITIONING_STATES.has(endpoint.current_state))) {
    return { ...base, state: "degraded", detail: "compute endpoint(s) initializing" };
  }
  if (endpoints.every((endpoint) => NEON_IDLE_STATES.has(endpoint.current_state))) {
    // Neon documents `idle` as "suspended (scaled to zero)": faithful idle
    // evidence; the attention evaluator owns the expected-runtime policy match.
    return { ...base, state: "expected_idle", detail: `all ${endpoints.length} compute endpoint(s) idle (suspended)` };
  }
  if (endpoints.every((endpoint) => NEON_STOPPED_STATES.has(endpoint.current_state))) {
    return { ...base, state: "stopped", detail: `all ${endpoints.length} compute endpoint(s) suspended` };
  }
  const states = [...new Set(endpoints.map((endpoint) => endpoint.current_state))].join(", ");
  return { ...base, state: "unknown", detail: `mixed compute states (${states})` };
}

/**
 * Billing-period bounds for project-level measures. The provider value only
 * reflects usage up to receipt time, so a period_end later than the Control
 * Host receipt time is clamped to `now` (period_end may never be reported in
 * the future). Clock skew (period_start >= now) falls back to the provider
 * period unchanged, which stays schema-valid.
 */
function billingPeriod(project: NeonProject, now: string): { start: string; end: string } {
  const startMs = Date.parse(project.consumption_period_start);
  const endMs = Date.parse(project.consumption_period_end);
  const nowMs = Date.parse(now);
  if (endMs > nowMs && startMs < nowMs) {
    return { start: project.consumption_period_start, end: now };
  }
  return { start: project.consumption_period_start, end: project.consumption_period_end };
}

function unavailableConsumptionMeasures(period: { start: string; end: string }, now: string): UsageMeasure[] {
  // Paid-plan capability absent or rejected: every consumption measure is
  // explicitly not_available — never a synthetic zero, never a failure of the
  // whole collection.
  return CONSUMPTION_METRICS.map((def) => ({
    metric: def.name,
    unit: def.unit,
    period_start: period.start,
    period_end: period.end,
    provider_reported_at: now,
    billing_alignment: "provider_estimate" as const,
    availability: "not_available" as const
  }));
}

function normalizeConsumption(data: unknown, projectId: string, now: string): UsageMeasure[] | null {
  const parsed = neonConsumptionResponseSchema.safeParse(data);
  if (!parsed.success) return null;
  const project = parsed.data.projects.find((entry) => entry.project_id === projectId);
  if (!project || project.periods.length === 0) return null;
  // Periods are documented ascending (oldest first): the last period is the
  // current billing period.
  const period = project.periods[project.periods.length - 1];
  const nowMs = Date.parse(now);
  const startMs = Date.parse(period.period_start);
  const rawEndMs = period.period_end ? Date.parse(period.period_end) : Number.NaN;
  // The current period has no documented period_end; clamp to receipt time.
  const endMs = Number.isFinite(rawEndMs) ? Math.min(rawEndMs, nowMs) : nowMs;
  if (!(endMs > startMs)) return null;
  const periodStart = period.period_start;
  const periodEnd = secondPrecisionIso(endMs);

  const totals = new Map<string, number>();
  for (const timeframe of period.consumption) {
    for (const metric of timeframe.metrics) {
      totals.set(metric.metric_name, (totals.get(metric.metric_name) ?? 0) + metric.value);
    }
  }
  return CONSUMPTION_METRICS.map((def) => {
    const total = totals.get(def.name);
    const base = {
      metric: def.name,
      unit: def.unit,
      period_start: periodStart,
      period_end: periodEnd,
      provider_reported_at: now,
      billing_alignment: "provider_estimate" as const
    };
    // A metric the provider omitted from the period stays explicitly
    // not_available — never a synthetic zero.
    if (total === undefined) return { ...base, availability: "not_available" as const };
    return { ...base, availability: "available" as const, value: total };
  });
}

interface NeonRequestOptions {
  fetch: FetchLike;
  credential: AdapterCollectInput["credential"];
  signal: AbortSignal;
  url: string;
}

/** One fixed Neon GET with the closed error taxonomy and bounded body. */
async function neonGet(options: NeonRequestOptions): Promise<unknown> {
  const { fetch: fetchImpl, credential, signal, url } = options;
  if (signal.aborted) {
    throw new AdapterError("timeout", "neon request aborted before dispatch");
  }
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: credential.authorizationHeader(), accept: "application/json" },
      redirect: "manual",
      signal
    });
  } catch (error) {
    if (isAdapterError(error)) throw error;
    const name = (error as { name?: string } | null)?.name;
    if (signal.aborted || name === "TimeoutError" || name === "AbortError") {
      throw new AdapterError("timeout", "neon request exceeded its abort deadline");
    }
    throw new AdapterError("malformed_response", "neon transport failed");
  }

  if (response.status === 401) throw new AdapterError("authentication_failed", "neon authentication failed");
  if (response.status === 403) throw new AdapterError("permission_denied", "neon permission denied");
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new AdapterError("rate_limited", "neon rate limited", {
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.floor(retryAfter) : undefined
    });
  }
  if (response.status < 200 || response.status >= 300) {
    throw new AdapterError("malformed_response", `neon responded with unexpected status ${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > ADAPTER_MAX_RESPONSE_BYTES) {
    throw new AdapterError("malformed_response", "neon response exceeded the bounded size limit");
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new AdapterError("malformed_response", "neon response body could not be read");
  }
  if (text.length > ADAPTER_MAX_RESPONSE_BYTES) {
    throw new AdapterError("malformed_response", "neon response exceeded the bounded size limit");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new AdapterError("malformed_response", "neon response was not valid JSON");
  }
}

export function createNeonAdapter(): MonitoringAdapter {
  const provider = "neon" as const;

  function capabilities(): AdapterCapabilities {
    return {
      resourceKinds: ["project"],
      supportedSignals: SUPPORTED_SIGNALS,
      consoleHosts: ["console.neon.tech"],
      implemented: true,
      apiHosts: [NEON_API_HOST],
      methods: ["GET"],
      signalMaxAgeSeconds: { runtime: 3600, usage: 3600 }
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
      throw new AdapterError("timeout", "neon request aborted before dispatch");
    }
    // Validate the project slug before it is ever interpolated into a URL path.
    const projectId = input.binding.resource_id;
    if (!NEON_PROJECT_SLUG.test(projectId)) {
      throw new AdapterError("unsupported_capability", "neon binding resource_id is not a valid Neon project identifier");
    }

    const requestBase = { fetch: input.fetch, credential: input.credential, signal };

    // 1. Project details FIRST: org_id is only trustworthy from this validated
    // payload, and the paid consumption query depends on it.
    const projectJson = await neonGet({ ...requestBase, url: `${NEON_API_BASE}/projects/${projectId}` });
    const projectParsed = neonProjectResponseSchema.safeParse(projectJson);
    if (!projectParsed.success) {
      throw new AdapterError("malformed_response", "neon project payload failed schema validation");
    }
    const project = projectParsed.data.project;
    const period = billingPeriod(project, input.now);

    // 2. Compute endpoints → faithful runtime evidence.
    const endpointsJson = await neonGet({ ...requestBase, url: `${NEON_API_BASE}/projects/${projectId}/endpoints` });
    const endpointsParsed = neonEndpointsResponseSchema.safeParse(endpointsJson);
    if (!endpointsParsed.success) {
      throw new AdapterError("malformed_response", "neon endpoints payload failed schema validation");
    }

    const usage: UsageMeasure[] = [];
    if (project.data_transfer_bytes !== undefined) {
      usage.push({
        metric: "data_transfer_bytes",
        value: project.data_transfer_bytes,
        unit: "bytes",
        period_start: period.start,
        period_end: period.end,
        provider_reported_at: input.now,
        billing_alignment: "provider_estimate",
        availability: "available"
      });
    } else {
      // Provider omitted the counter: explicitly not_available, never zero.
      usage.push({
        metric: "data_transfer_bytes",
        unit: "bytes",
        period_start: period.start,
        period_end: period.end,
        provider_reported_at: input.now,
        billing_alignment: "provider_estimate",
        availability: "not_available"
      });
    }

    // 3. Optional paid consumption query. Only possible with a validated
    // org_id; any failure (plan capability 403, org mismatch 404, malformed
    // payload, transport error) downgrades these measures to not_available
    // and never fails the collection over this optional endpoint.
    let consumptionMeasures: UsageMeasure[] = unavailableConsumptionMeasures(period, input.now);
    if (project.org_id) {
      const to = input.now;
      // Query the whole current billing period (option (a) of the rework):
      // the emitted measures are labeled with the billing period start, so
      // the summed window must actually start there. The current billing
      // period start is always within the documented 60-day daily-granularity
      // lookback; should Neon ever reject the range (406), the optional-query
      // error path below downgrades these measures to not_available.
      const from = project.consumption_period_start;
      const query = new URLSearchParams({
        org_id: project.org_id,
        project_ids: projectId,
        from,
        to,
        granularity: "daily",
        limit: "100",
        metrics: CONSUMPTION_METRICS.map((def) => def.name).join(",")
      });
      try {
        const consumptionJson = await neonGet({
          ...requestBase,
          url: `${NEON_API_BASE}/consumption_history/v2/projects?${query.toString()}`
        });
        const normalized = normalizeConsumption(consumptionJson, projectId, input.now);
        if (normalized) consumptionMeasures = normalized;
      } catch (error) {
        if (!isAdapterError(error)) throw error;
        // permission_denied (403) and every other taxonomy error on this
        // optional endpoint leaves the not_available downgrade in place.
      }
    }
    usage.push(...consumptionMeasures);

    if (
      input.binding.required_signals.includes("usage") &&
      !usage.some((measure) => measure.availability === "available")
    ) {
      // Required usage with no available measure at all: fail closed so the
      // collector marks the signal untrustworthy instead of showing nothing.
      throw new AdapterError("unsupported_capability", "neon cannot supply any usage measure for this binding");
    }

    return {
      adapter: { version: NEON_ADAPTER_VERSION, capabilities: [...SUPPORTED_SIGNALS] },
      deployment: null,
      runtime: deriveRuntime(endpointsParsed.data.endpoints, input.now),
      usage,
      platform_incident: null
    };
  }

  return { provider, version: NEON_ADAPTER_VERSION, capabilities, validateBinding, collect };
}
