import {
  collectorSignalSchema,
  deploymentSignalSchema,
  freshnessSignalSchema,
  monitoringBindingSchema,
  monitoringSnapshotSchema,
  platformIncidentSignalSchema,
  runtimeSignalSchema,
  signalFreshnessSchema,
  usageMeasureSchema
} from "./schemas";
import type {
  CollectorSignal,
  DeploymentSignal,
  FreshnessSignal,
  MonitoringBinding,
  MonitoringSnapshot,
  PlatformIncidentSignal,
  RuntimeSignal,
  SignalFreshness,
  UsageMeasure
} from "./types";

// Reusable fixture builders for monitoring domain, adapter, store, query, and
// UI tests. Every builder parses its result through the strict schema before
// returning, so fixtures can only emit valid schema-version-1 objects.

export const FIXTURE_NOW = "2026-09-11T06:00:00Z";
export const FIXTURE_OBSERVED = "2026-09-11T05:59:00Z";
export const FIXTURE_PERIOD_START = "2026-09-01T00:00:00Z";
export const FIXTURE_PERIOD_END = "2026-10-01T00:00:00Z";

const RAILWAY_RESOURCE_ID = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333"
].join("/");

export function buildMonitoringBinding(overrides: Record<string, unknown> = {}): MonitoringBinding {
  return monitoringBindingSchema.parse({
    id: "railway-production-api",
    provider: "railway",
    resource_kind: "service",
    resource_id: RAILWAY_RESOURCE_ID,
    environment: "production",
    expected_runtime: "always-on",
    required_signals: ["deployment"],
    credential_ref: "railway-primary",
    console_url: "https://railway.com/project/example",
    probe: {
      host_ref: "talentvault-production",
      path: "/healthz",
      method: "GET",
      expected_status: [200],
      timeout_ms: 5000
    },
    ...overrides
  });
}

export function buildNeonBinding(overrides: Record<string, unknown> = {}): MonitoringBinding {
  return monitoringBindingSchema.parse({
    id: "neon-production-db",
    provider: "neon",
    resource_kind: "project",
    resource_id: "cool-project",
    environment: "production",
    expected_runtime: "scale-to-zero",
    required_signals: ["runtime"],
    credential_ref: "neon-primary",
    console_url: "https://console.neon.tech/app/projects/cool-project",
    ...overrides
  });
}

export function buildCollectorSignal(overrides: Record<string, unknown> = {}): CollectorSignal {
  return collectorSignalSchema.parse({
    state: "success",
    attempted_at: FIXTURE_NOW,
    ...overrides
  });
}

export function buildDeploymentSignal(overrides: Record<string, unknown> = {}): DeploymentSignal {
  return deploymentSignalSchema.parse({
    state: "succeeded",
    deployment_id: "dep-123",
    observed_at: FIXTURE_OBSERVED,
    ...overrides
  });
}

export function buildRuntimeSignal(overrides: Record<string, unknown> = {}): RuntimeSignal {
  return runtimeSignalSchema.parse({
    state: "healthy",
    observed_at: FIXTURE_OBSERVED,
    source: "probe",
    ...overrides
  });
}

export function buildUsageMeasure(overrides: Record<string, unknown> = {}): UsageMeasure {
  return usageMeasureSchema.parse({
    metric: "cpu_seconds",
    value: 120,
    unit: "cpu_seconds",
    period_start: FIXTURE_PERIOD_START,
    period_end: FIXTURE_PERIOD_END,
    allowance: 1000,
    provider_reported_at: FIXTURE_OBSERVED,
    billing_alignment: "operational_only",
    availability: "available",
    ...overrides
  });
}

export function buildPlatformIncidentSignal(overrides: Record<string, unknown> = {}): PlatformIncidentSignal {
  return platformIncidentSignalSchema.parse({
    incident_id: "inc-456",
    summary: "Elevated errors in the provider region hosting this binding.",
    severity: "major",
    status: "investigating",
    started_at: "2026-09-11T05:00:00Z",
    provider_reported_at: FIXTURE_OBSERVED,
    ...overrides
  });
}

export function buildSignalFreshness(overrides: Record<string, unknown> = {}): SignalFreshness {
  return signalFreshnessSchema.parse({
    signal: "deployment",
    observed_at: FIXTURE_OBSERVED,
    max_age_seconds: 3600,
    state: "current",
    ...overrides
  });
}

export function buildFreshnessSignal(overrides: Record<string, unknown> = {}): FreshnessSignal {
  return freshnessSignalSchema.parse({
    signals: [buildSignalFreshness()],
    ...overrides
  });
}

export function buildMonitoringSnapshot(overrides: Record<string, unknown> = {}): MonitoringSnapshot {
  return monitoringSnapshotSchema.parse({
    schema_version: 1,
    cycle_id: "2026-09-11t06-00-00z",
    project: "talentvault",
    binding_id: "railway-production-api",
    provider: "railway",
    adapter: { version: "1.0.0", capabilities: ["deployment", "usage"] },
    attempted_at: FIXTURE_NOW,
    collector: buildCollectorSignal(),
    deployment: buildDeploymentSignal(),
    runtime: null,
    usage: [],
    platform_incident: null,
    freshness: buildFreshnessSignal(),
    attention: "healthy",
    reasons: [],
    ...overrides
  });
}
