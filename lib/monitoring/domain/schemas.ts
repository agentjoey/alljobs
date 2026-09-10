import { z } from "zod";

// R5 Application Monitoring — normalized domain contracts (schema version 1).
// Everything here is `.strict()` and closed: no z.any(), no free-form provider
// endpoints, and no secret values. Credentials are referenced by name only.

export const monitoringProviderSchema = z.enum([
  "railway",
  "fly",
  "neon",
  "supabase",
  "vercel",
  "cloudflare",
  "github"
]);
export type MonitoringProvider = z.infer<typeof monitoringProviderSchema>;

export const attentionLevelSchema = z.enum(["critical", "warning", "unknown", "watch", "healthy"]);
export const expectedRuntimeSchema = z.enum(["always-on", "scale-to-zero", "scheduled", "manual"]);
export const requiredSignalSchema = z.enum(["deployment", "runtime", "usage", "platform_incident"]);
export type RequiredSignal = z.infer<typeof requiredSignalSchema>;
export const billingAlignmentSchema = z.enum(["exact", "provider_estimate", "operational_only"]);

export interface MonitoringProviderCapabilities {
  /** Closed resource-kind set for the provider adapter; never an arbitrary endpoint. */
  resourceKinds: readonly string[];
  /** Signals the adapter itself can supply. `runtime` may additionally be satisfied by a binding probe. */
  supportedSignals: readonly RequiredSignal[];
  /** Exact hostnames allowed for `console_url`. */
  consoleHosts: readonly string[];
  /** Extension providers parse but cannot collect in Phase 1. */
  implemented: boolean;
}

export const MONITORING_PROVIDER_CAPABILITIES: Record<MonitoringProvider, MonitoringProviderCapabilities> = {
  railway: {
    resourceKinds: ["service"],
    supportedSignals: ["deployment", "usage"],
    consoleHosts: ["railway.com", "railway.app"],
    implemented: true
  },
  fly: {
    resourceKinds: ["app"],
    supportedSignals: ["runtime", "usage"],
    consoleHosts: ["fly.io"],
    implemented: true
  },
  neon: {
    resourceKinds: ["project"],
    supportedSignals: ["runtime", "usage", "platform_incident"],
    consoleHosts: ["console.neon.tech"],
    implemented: true
  },
  supabase: {
    resourceKinds: ["project"],
    supportedSignals: ["runtime", "usage", "platform_incident"],
    consoleHosts: ["supabase.com", "app.supabase.com"],
    implemented: true
  },
  vercel: {
    resourceKinds: ["project"],
    supportedSignals: [],
    consoleHosts: ["vercel.com"],
    implemented: false
  },
  cloudflare: {
    resourceKinds: ["pages_project", "worker"],
    supportedSignals: [],
    consoleHosts: ["dash.cloudflare.com"],
    implemented: false
  },
  github: {
    resourceKinds: ["repository"],
    supportedSignals: [],
    consoleHosts: ["github.com"],
    implemented: false
  }
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RAILWAY_SERVICE_RESOURCE_ID = new RegExp(`^${UUID}/${UUID}/${UUID}$`, "i");
const SLUGGY_RESOURCE_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SUPABASE_PROJECT_REF = /^[a-z0-9]{20}$/;
// Extension providers are not implemented in Phase 1; their identifiers only
// need to be opaque, bounded, and free of URL/control characters.
const EXTENSION_RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

function resourceIdError(message: string) {
  return { code: z.ZodIssueCode.custom, path: ["resource_id"], message };
}

function validateResourceId(
  provider: MonitoringProvider,
  resourceKind: string,
  resourceId: string,
  ctx: z.RefinementCtx
) {
  switch (provider) {
    case "railway":
      if (!RAILWAY_SERVICE_RESOURCE_ID.test(resourceId)) {
        ctx.addIssue(resourceIdError("Railway service resource_id must be '<project UUID>/<environment UUID>/<service UUID>'"));
      }
      return;
    case "fly":
      if (!SLUGGY_RESOURCE_ID.test(resourceId)) {
        ctx.addIssue(resourceIdError("Fly app resource_id must be a Fly app slug (lowercase letters, digits, hyphens)"));
      }
      return;
    case "neon":
      if (!SLUGGY_RESOURCE_ID.test(resourceId)) {
        ctx.addIssue(resourceIdError("Neon project resource_id must be a Neon project identifier (lowercase letters, digits, hyphens)"));
      }
      return;
    case "supabase":
      if (!SUPABASE_PROJECT_REF.test(resourceId)) {
        ctx.addIssue(resourceIdError("Supabase project resource_id must be a 20-character lowercase project ref"));
      }
      return;
    default:
      if (!EXTENSION_RESOURCE_ID.test(resourceId)) {
        ctx.addIssue(resourceIdError("resource_id must be an opaque bounded identifier without URL or control characters"));
      }
  }
}

const bindingIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Binding id must be lowercase letters, digits, and hyphens, starting with a letter or digit");

const hostRefSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "host_ref must be a lowercase lookup key into Control Host probeAllowedHosts, not a URL");

const environmentLabelSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "environment must be a lowercase label such as 'production' or 'preview'");

const probePathSchema = z
  .string()
  .max(240)
  .regex(/^\/[^\s]*$/, "Probe path must be a relative path starting with '/'")
  .refine((value) => !value.startsWith("//"), "Probe path must not be scheme-relative")
  .refine((value) => !value.includes(".."), "Probe path must not contain '..'")
  .refine((value) => !value.includes("\\"), "Probe path must not contain backslashes");

export const monitoringProbeSchema = z.object({
  host_ref: hostRefSchema,
  path: probePathSchema.optional(),
  method: z.enum(["GET", "HEAD"]),
  expected_status: z
    .array(z.number().int().min(100).max(599))
    .min(1, "Probe must declare at least one expected status")
    .max(10, "Probe expected status list is bounded to 10 entries")
    .refine((values) => new Set(values).size === values.length, "Probe expected statuses must be unique"),
  timeout_ms: z.number().int().min(250).max(30_000)
}).strict();

function validateConsoleUrl(provider: MonitoringProvider, consoleUrl: string, ctx: z.RefinementCtx) {
  let url: URL;
  try {
    url = new URL(consoleUrl);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["console_url"], message: "console_url must be a valid URL" });
    return;
  }
  if (url.protocol !== "https:") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["console_url"], message: "console_url must use HTTPS" });
    return;
  }
  if (url.username || url.password) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["console_url"], message: "console_url must not embed user information" });
    return;
  }
  if (!MONITORING_PROVIDER_CAPABILITIES[provider].consoleHosts.includes(url.hostname)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["console_url"],
      message: `console_url hostname must be one of: ${MONITORING_PROVIDER_CAPABILITIES[provider].consoleHosts.join(", ")}`
    });
  }
}

export const monitoringBindingSchema = z.object({
  id: bindingIdSchema,
  provider: monitoringProviderSchema,
  resource_kind: z.string().min(1).max(64),
  resource_id: z.string().min(1).max(240),
  environment: environmentLabelSchema,
  expected_runtime: expectedRuntimeSchema,
  required_signals: z
    .array(requiredSignalSchema)
    .max(4)
    .refine((values) => new Set(values).size === values.length, "required_signals must be unique"),
  credential_ref: z
    .string()
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "credential_ref must be a lowercase lookup key, never a secret value"),
  console_url: z.string().max(500),
  probe: monitoringProbeSchema.optional()
}).strict().superRefine((binding, ctx) => {
  const capabilities = MONITORING_PROVIDER_CAPABILITIES[binding.provider];

  if (!capabilities.resourceKinds.includes(binding.resource_kind)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resource_kind"],
      message: `${binding.provider} supports resource kinds: ${capabilities.resourceKinds.join(", ")}`
    });
    return;
  }

  validateResourceId(binding.provider, binding.resource_kind, binding.resource_id, ctx);
  validateConsoleUrl(binding.provider, binding.console_url, ctx);

  // Extension providers parse but cannot collect in Phase 1, so they cannot
  // declare required signals. Implemented providers additionally satisfy a
  // required `runtime` signal through the binding's independent probe.
  const satisfiable = capabilities.implemented
    ? new Set<RequiredSignal>([
        ...capabilities.supportedSignals,
        ...(binding.probe ? (["runtime"] as const) : [])
      ])
    : new Set<RequiredSignal>();
  for (const signal of binding.required_signals) {
    if (!satisfiable.has(signal)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["required_signals"],
        message: capabilities.implemented
          ? `${binding.provider}/${binding.resource_kind} cannot supply required signal '${signal}'`
          : `${binding.provider} is an extension provider (implemented: false) and cannot collect required signals in Phase 1`
      });
    }
  }
});

// --- Normalized snapshot contracts (schema version 1) ---

const isoTimestamp = z.iso.datetime({ offset: true });

export const signalDimensionSchema = z.enum([
  "collector",
  "deployment",
  "runtime",
  "usage",
  "platform_incident",
  "freshness"
]);

export const attentionReasonSchema = z.object({
  code: z.string().max(64).regex(/^[a-z][a-z0-9_]*$/, "Reason codes are stable lowercase snake_case identifiers"),
  dimension: signalDimensionSchema,
  severity: attentionLevelSchema,
  summary: z.string().min(1).max(280),
  observed_at: isoTimestamp
}).strict();

export const collectorSignalSchema = z.object({
  state: z.enum([
    "success",
    "authentication_failed",
    "permission_denied",
    "rate_limited",
    "timeout",
    "malformed_response",
    "unsupported_capability"
  ]),
  attempted_at: isoTimestamp,
  detail: z.string().max(280).optional(),
  retry_after_seconds: z.number().int().positive().optional()
}).strict();

const providerConsoleUrlSchema = z.string().max(500).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Evidence URLs must be HTTPS without user information");

export const deploymentSignalSchema = z.object({
  state: z.enum(["queued", "building", "succeeded", "failed", "cancelled", "unavailable", "not_applicable"]),
  deployment_id: z.string().min(1).max(128).optional(),
  revision: z.string().min(1).max(128).optional(),
  observed_at: isoTimestamp,
  url: providerConsoleUrlSchema.optional()
}).strict();

export const runtimeSignalSchema = z.object({
  state: z.enum(["healthy", "degraded", "unhealthy", "expected_idle", "stopped", "unknown", "not_applicable"]),
  observed_at: isoTimestamp,
  source: z.enum(["provider", "probe"]).optional(),
  consecutive_failures: z.number().int().nonnegative().optional(),
  detail: z.string().max(280).optional()
}).strict();

export const usageMeasureSchema = z.object({
  metric: z.string().min(1).max(64),
  value: z.number().nonnegative().optional(),
  unit: z.string().min(1).max(32),
  period_start: isoTimestamp,
  period_end: isoTimestamp,
  allowance: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code").optional(),
  provider_reported_at: isoTimestamp,
  billing_alignment: billingAlignmentSchema,
  availability: z.enum(["available", "not_available"])
}).strict().superRefine((measure, ctx) => {
  if (measure.availability === "available" && measure.value === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Available measures must carry their observed value" });
  }
  if (measure.availability === "not_available" && measure.value !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Unavailable measures must not carry a synthetic value" });
  }
  if (measure.cost !== undefined && measure.currency === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["currency"], message: "cost requires an ISO 4217 currency" });
  }
  if (measure.cost !== undefined && measure.billing_alignment !== "exact") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["billing_alignment"],
      message: "Only provider-reported exact billing alignment may carry a cost"
    });
  }
  if (Date.parse(measure.period_end) <= Date.parse(measure.period_start)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["period_end"], message: "period_end must be after period_start" });
  }
});

export const platformIncidentSignalSchema = z.object({
  incident_id: z.string().min(1).max(128),
  summary: z.string().min(1).max(280),
  severity: z.string().min(1).max(32),
  status: z.string().min(1).max(32),
  url: providerConsoleUrlSchema.optional(),
  started_at: isoTimestamp,
  provider_reported_at: isoTimestamp
}).strict();

export const signalFreshnessSchema = z.object({
  signal: z.enum(["deployment", "runtime", "usage", "platform_incident"]),
  observed_at: isoTimestamp.nullable(),
  max_age_seconds: z.number().int().positive(),
  state: z.enum(["current", "delayed", "expired", "never_collected"])
}).strict();

export const freshnessSignalSchema = z.object({
  signals: z.array(signalFreshnessSchema).max(16)
}).strict();

export const adapterMetadataSchema = z.object({
  version: z.string().min(1).max(32),
  capabilities: z.array(requiredSignalSchema).max(8)
}).strict();

export const monitoringSnapshotSchema = z.object({
  schema_version: z.literal(1),
  cycle_id: z.string().max(64).regex(/^[a-z0-9][a-z0-9._-]*$/, "cycle_id must be a safe lowercase identifier"),
  project: z.string().regex(/^[a-z0-9-]+$/, "project must be a Project slug"),
  binding_id: bindingIdSchema,
  provider: monitoringProviderSchema,
  adapter: adapterMetadataSchema,
  attempted_at: isoTimestamp,
  collector: collectorSignalSchema,
  deployment: deploymentSignalSchema.nullable(),
  runtime: runtimeSignalSchema.nullable(),
  usage: z.array(usageMeasureSchema).max(32),
  platform_incident: platformIncidentSignalSchema.nullable(),
  freshness: freshnessSignalSchema,
  attention: attentionLevelSchema,
  reasons: z.array(attentionReasonSchema).max(32)
}).strict();

export function parseMonitoringSnapshot(data: unknown) {
  return monitoringSnapshotSchema.parse(data);
}

// --- Cross-checks between registry bindings and Control Host monitoring config ---

export interface MonitoringBindingConfigIssue {
  project: string;
  binding_id: string;
  code: "credential_ref_unknown" | "credential_provider_mismatch" | "probe_host_ref_unknown";
  message: string;
}

interface BindingRefShape {
  id: string;
  provider: MonitoringProvider;
  credential_ref: string;
  probe?: { host_ref: string };
}

/**
 * Validates that every binding's credential_ref resolves to a Control Host
 * credential entry for the same provider, and that every probe host_ref
 * resolves to an allowlisted origin. Credential values never appear here —
 * only references and provider identity are compared.
 */
export function validateMonitoringBindingsAgainstConfig(
  projects: ReadonlyArray<{ slug: string; monitoring?: { bindings: ReadonlyArray<BindingRefShape> } }>,
  monitoring: {
    credentials: Record<string, { provider: MonitoringProvider }>;
    probeAllowedHosts: Record<string, string>;
  } | undefined
): MonitoringBindingConfigIssue[] {
  const issues: MonitoringBindingConfigIssue[] = [];
  for (const project of projects) {
    for (const binding of project.monitoring?.bindings ?? []) {
      const credential = monitoring?.credentials[binding.credential_ref];
      if (!credential) {
        issues.push({
          project: project.slug,
          binding_id: binding.id,
          code: "credential_ref_unknown",
          message: `credential_ref '${binding.credential_ref}' is not declared in Control Host monitoring credentials`
        });
      } else if (credential.provider !== binding.provider) {
        issues.push({
          project: project.slug,
          binding_id: binding.id,
          code: "credential_provider_mismatch",
          message: `credential_ref '${binding.credential_ref}' is a ${credential.provider} credential but the binding targets ${binding.provider}`
        });
      }
      if (binding.probe && !monitoring?.probeAllowedHosts[binding.probe.host_ref]) {
        issues.push({
          project: project.slug,
          binding_id: binding.id,
          code: "probe_host_ref_unknown",
          message: `probe host_ref '${binding.probe.host_ref}' is not declared in Control Host probeAllowedHosts`
        });
      }
    }
  }
  return issues;
}
