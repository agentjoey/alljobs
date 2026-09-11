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

// Supabase Management API adapter (design §12.1, §13; plan Task 6). Two fixed
// read operations on the fixed api.supabase.com host, both Bearer-authenticated
// with a personal access token:
//   1. GET /v1/projects/{ref}/health?services=<fixed list> — service health,
//      normalized SEPARATELY from usage into the runtime signal.
//   2. GET /v1/projects/{ref}/analytics/endpoints/usage.api-counts — request
//      totals over the trailing 24h. These are OPERATIONAL measures
//      (billing_alignment "operational_only"): the documented response carries
//      no allowance, so `allowance` is never set (the UI never labels an
//      allowance the provider did not report).
//
// Permission failure (401/403) or an unavailable/malformed usage endpoint
// downgrades optional usage to not_available without failing collection; when
// usage is a required signal the fitting taxonomy error is thrown so the
// collector marks the required signal untrustworthy → unknown.
//
// Platform incidents: the verified public references document no stable
// platform-status API in scope for this task, so the adapter declares
// supportedSignals ["runtime", "usage"] only, always returns
// platform_incident: null / deployment: null, and validateBinding rejects a
// required platform_incident/deployment signal.
//
// References (re-verified 2026-09-11; adapter compatibility date 2026-09-11):
// - Management API introduction (Bearer personal access token, base URL
//   https://api.supabase.com):
//   https://supabase.com/docs/reference/api/introduction
// - Management API OpenAPI document (health services enum, status enum
//   COMING_UP/ACTIVE_HEALTHY/UNHEALTHY, api-counts response shape, ref
//   grammar):
//   https://api.supabase.com/api/v1-json
// - GET /v1/projects/{ref}/health (services query param is REQUIRED; 200
//   response is an ARRAY of {name, healthy (deprecated), status, info?,
//   error?}; codes 401/403/429/500):
//   https://supabase.com/docs/reference/api/v1-get-services-health
// - GET /v1/projects/{ref}/analytics/endpoints/usage.api-counts (interval enum
//   15min/30min/1hr/3hr/1day/3day/7day; response {result: [{timestamp,
//   total_auth_requests, total_realtime_requests, total_rest_requests,
//   total_storage_requests}], error?}):
//   https://supabase.com/docs/reference/api/v1-get-project-usage-api-count
export const SUPABASE_ADAPTER_COMPATIBILITY_DATE = "2026-09-11";

export const SUPABASE_API_HOST = "api.supabase.com";
export const SUPABASE_ADAPTER_VERSION = "1.0.0";
const SUPABASE_API_BASE = `https://${SUPABASE_API_HOST}/v1`;
const SUPPORTED_SIGNALS: readonly RequiredSignal[] = ["runtime", "usage"];

// Fixed service list requested on every health call. Subset of the documented
// enum (auth, db, db_postgres_user, pooler, realtime, rest, storage,
// pg_bouncer): the customer-facing core services; db_postgres_user and
// pg_bouncer are legacy/internal variants of db/pooler.
export const SUPABASE_HEALTH_SERVICES = ["auth", "db", "pooler", "realtime", "rest", "storage"] as const;

/** Supabase project ref grammar (Task 1 domain schema SUPABASE_PROJECT_REF). */
const SUPABASE_PROJECT_REF = /^[a-z0-9]{20}$/;

/** Usage window: interval=1day means the trailing 24 hours. */
const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** ISO timestamp at second precision (the injected `now` convention). */
function secondPrecisionIso(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

// Documented service health status enum (OpenAPI
// V1ServiceHealthResponse_Output, re-verified 2026-09-11). Anything outside
// these values is reported as unknown rather than mapped to an invented state.
const KNOWN_SERVICE_STATUSES = new Set(["ACTIVE_HEALTHY", "COMING_UP", "UNHEALTHY"]);

const supabaseServiceHealthSchema = z.object({
  name: z.string().min(1).max(64),
  status: z.string().min(1).max(32),
  healthy: z.boolean().optional(),
  error: z.string().max(500).optional()
});

const supabaseHealthResponseSchema = z.array(supabaseServiceHealthSchema).max(64);

const supabaseApiCountsResponseSchema = z.object({
  result: z
    .array(
      z.object({
        timestamp: z.string().max(64),
        total_auth_requests: z.number().nonnegative(),
        total_realtime_requests: z.number().nonnegative(),
        total_rest_requests: z.number().nonnegative(),
        total_storage_requests: z.number().nonnegative()
      })
    )
    .max(4096)
});

type SupabaseServiceHealth = z.infer<typeof supabaseServiceHealthSchema>;

function deriveRuntime(services: SupabaseServiceHealth[], now: string): RuntimeSignal {
  const base = { observed_at: now, source: "provider" as const };
  const unrecognized = services.filter((service) => !KNOWN_SERVICE_STATUSES.has(service.status));
  if (unrecognized.length > 0) {
    const statuses = [...new Set(unrecognized.map((service) => service.status))].join(", ");
    return { ...base, state: "unknown", detail: `unrecognized service statuses (${statuses})` };
  }
  const reported = new Set(services.map((service) => service.name));
  const missing = SUPABASE_HEALTH_SERVICES.filter((name) => !reported.has(name));
  const unhealthy = services.filter((service) => service.status === "UNHEALTHY");
  if (services.length > 0 && unhealthy.length === services.length) {
    return { ...base, state: "unhealthy", detail: `all ${services.length} reported service(s) unhealthy` };
  }
  const comingUp = services.filter((service) => service.status === "COMING_UP");
  const errored = services.filter((service) => service.error !== undefined && service.status !== "UNHEALTHY");
  if (unhealthy.length > 0 || comingUp.length > 0 || errored.length > 0 || missing.length > 0) {
    // Partial evidence (missing requested services), provider-reported
    // service errors, restarting services, or a subset of failed services all
    // degrade the signal without inventing health.
    const parts: string[] = [];
    if (unhealthy.length > 0) parts.push(`${unhealthy.length} unhealthy`);
    if (comingUp.length > 0) parts.push(`${comingUp.length} coming up`);
    if (errored.length > 0) parts.push(`${errored.length} with errors`);
    if (missing.length > 0) parts.push(`missing services: ${missing.join(", ")}`);
    return { ...base, state: "degraded", detail: parts.join("; ") };
  }
  return { ...base, state: "healthy", detail: `all ${services.length} requested service(s) active and healthy` };
}

const USAGE_METRICS = [
  { field: "total_auth_requests", metric: "auth_requests" },
  { field: "total_realtime_requests", metric: "realtime_requests" },
  { field: "total_rest_requests", metric: "rest_requests" },
  { field: "total_storage_requests", metric: "storage_requests" }
] as const;

function unavailableUsageMeasures(periodStart: string, now: string): UsageMeasure[] {
  return USAGE_METRICS.map((def) => ({
    metric: def.metric,
    unit: "requests",
    period_start: periodStart,
    period_end: now,
    provider_reported_at: now,
    billing_alignment: "operational_only" as const,
    availability: "not_available" as const
  }));
}

function normalizeUsage(data: unknown, periodStart: string, now: string): UsageMeasure[] | null {
  const parsed = supabaseApiCountsResponseSchema.safeParse(data);
  if (!parsed.success) return null;
  if (parsed.data.result.length === 0) {
    // An empty window is ambiguous (no traffic vs. no data): stay explicitly
    // not_available rather than inventing zeroes.
    return null;
  }
  return USAGE_METRICS.map((def) => ({
    metric: def.metric,
    value: parsed.data.result.reduce((sum, row) => sum + row[def.field], 0),
    unit: "requests",
    period_start: periodStart,
    period_end: now,
    provider_reported_at: now,
    billing_alignment: "operational_only" as const,
    availability: "available" as const
  }));
}

/** True when the payload is schema-valid but carries an empty result window. */
function isEmptyResult(data: unknown): boolean {
  const parsed = supabaseApiCountsResponseSchema.safeParse(data);
  return parsed.success && parsed.data.result.length === 0;
}

interface SupabaseRequestOptions {
  fetch: FetchLike;
  credential: AdapterCollectInput["credential"];
  signal: AbortSignal;
  url: string;
}

interface SupabaseGetOk {
  ok: true;
  json: unknown;
  /** True when the 2xx body was not valid JSON (callers decide severity). */
  parseError: boolean;
}
interface SupabaseGetErr {
  ok: false;
  status: number;
  retryAfterSeconds?: number;
}

/**
 * One fixed Supabase Management API GET with bounded body. Unlike neonGet,
 * status mapping is left to the caller (the optional usage endpoint has
 * different failure semantics than the health endpoint); transport failures
 * are already wrapped into the closed taxonomy here.
 */
async function supabaseGet(options: SupabaseRequestOptions): Promise<SupabaseGetOk | SupabaseGetErr> {
  const { fetch: fetchImpl, credential, signal, url } = options;
  if (signal.aborted) {
    throw new AdapterError("timeout", "supabase request aborted before dispatch");
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
      throw new AdapterError("timeout", "supabase request exceeded its abort deadline");
    }
    throw new AdapterError("malformed_response", "supabase transport failed");
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > ADAPTER_MAX_RESPONSE_BYTES) {
    throw new AdapterError("malformed_response", "supabase response exceeded the bounded size limit");
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new AdapterError("malformed_response", "supabase response body could not be read");
  }
  if (text.length > ADAPTER_MAX_RESPONSE_BYTES) {
    throw new AdapterError("malformed_response", "supabase response exceeded the bounded size limit");
  }

  if (response.status < 200 || response.status >= 300) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const err: SupabaseGetErr = { ok: false, status: response.status };
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      err.retryAfterSeconds = Math.floor(retryAfter);
    }
    return err;
  }
  try {
    return { ok: true, json: JSON.parse(text), parseError: false };
  } catch {
    return { ok: true, json: undefined, parseError: true };
  }
}

function statusToAdapterError(status: number): AdapterError {
  if (status === 401) return new AdapterError("authentication_failed", "supabase authentication failed");
  if (status === 403) return new AdapterError("permission_denied", "supabase permission denied");
  return new AdapterError("malformed_response", `supabase responded with unexpected status ${status}`);
}

export function createSupabaseAdapter(): MonitoringAdapter {
  const provider = "supabase" as const;

  function capabilities(): AdapterCapabilities {
    return {
      resourceKinds: ["project"],
      supportedSignals: SUPPORTED_SIGNALS,
      consoleHosts: ["supabase.com", "app.supabase.com"],
      implemented: true,
      apiHosts: [SUPABASE_API_HOST],
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
      throw new AdapterError("timeout", "supabase request aborted before dispatch");
    }
    // Validate the project ref before it is ever interpolated into a URL path.
    const ref = input.binding.resource_id;
    if (!SUPABASE_PROJECT_REF.test(ref)) {
      throw new AdapterError("unsupported_capability", "supabase binding resource_id is not a 20-character project ref");
    }

    const requestBase = { fetch: input.fetch, credential: input.credential, signal };

    // 1. Service health → runtime signal (normalized separately from usage).
    const healthUrl = `${SUPABASE_API_BASE}/projects/${ref}/health?services=${SUPABASE_HEALTH_SERVICES.join(",")}`;
    const health = await supabaseGet({ ...requestBase, url: healthUrl });
    if (!health.ok) {
      if (health.status === 429) {
        throw new AdapterError("rate_limited", "supabase rate limited", {
          retryAfterSeconds: health.retryAfterSeconds
        });
      }
      throw statusToAdapterError(health.status);
    }
    const healthParsed = supabaseHealthResponseSchema.safeParse(health.json);
    if (health.parseError || !healthParsed.success) {
      throw new AdapterError("malformed_response", "supabase health payload failed schema validation");
    }

    // 2. API-count usage over the trailing 24h. Optional by default: any
    // permission failure or unavailable endpoint downgrades the measures to
    // not_available; only a required usage signal fails closed.
    const usageRequired = input.binding.required_signals.includes("usage");
    const periodStart = secondPrecisionIso(Date.parse(input.now) - USAGE_WINDOW_MS);
    const usageUrl = `${SUPABASE_API_BASE}/projects/${ref}/analytics/endpoints/usage.api-counts?interval=1day`;
    let usage: UsageMeasure[] = unavailableUsageMeasures(periodStart, input.now);
    const usageResponse = await supabaseGet({ ...requestBase, url: usageUrl });
    if (!usageResponse.ok) {
      if (usageResponse.status === 429) {
        // Rate limiting is collection-level backpressure, not a capability
        // gap: surface it so the collector retries later.
        throw new AdapterError("rate_limited", "supabase rate limited", {
          retryAfterSeconds: usageResponse.retryAfterSeconds
        });
      }
      if (usageRequired) {
        throw statusToAdapterError(usageResponse.status);
      }
      // Optional usage: permission failure or unavailable endpoint stays
      // not_available and collection succeeds with health unaffected.
    } else {
      const normalized = usageResponse.parseError
        ? null
        : normalizeUsage(usageResponse.json, periodStart, input.now);
      if (normalized) {
        usage = normalized;
      } else if (usageRequired && (usageResponse.parseError || !isEmptyResult(usageResponse.json))) {
        // A required usage signal fails closed on malformed payloads; a valid
        // but empty result window stays not_available (never a synthetic zero)
        // without failing the collection.
        throw new AdapterError("malformed_response", "supabase usage payload failed schema validation");
      }
    }

    return {
      adapter: { version: SUPABASE_ADAPTER_VERSION, capabilities: [...SUPPORTED_SIGNALS] },
      deployment: null,
      runtime: deriveRuntime(healthParsed.data, input.now),
      usage,
      platform_incident: null
    };
  }

  return { provider, version: SUPABASE_ADAPTER_VERSION, capabilities, validateBinding, collect };
}
