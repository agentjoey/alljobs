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
  type MonitoringAdapter
} from "../contracts";

// Fly.io Machines API adapter (design §12.1, §13; plan Task 5). Exactly one
// read operation: GET /v1/apps/{validated-app}/machines on the fixed
// api.machines.dev host with a Bearer token (app- or org-scoped, preferably
// read-only). Aggregation is operational evidence only: machine count and
// allocated vCPU/memory are never labeled billable consumption, and no
// billing endpoint is called.
//
// References (re-verified 2026-09-11; adapter compatibility date 2026-09-11):
// - Machines resource (list machines, machine states, checks, guest):
//   https://fly.io/docs/machines/api/machines-resource/
// - Access tokens (deploy/org/read-only scopes, Bearer usage):
//   https://fly.io/docs/security/tokens/
export const FLY_ADAPTER_COMPATIBILITY_DATE = "2026-09-11";

export const FLY_API_HOST = "api.machines.dev";
export const FLY_ADAPTER_VERSION = "1.0.0";
const SUPPORTED_SIGNALS: readonly RequiredSignal[] = ["runtime", "usage"];

/** Fly app slug grammar (Task 1 domain schema SLUGGY_RESOURCE_ID). */
const FLY_APP_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

// Documented machine states (fly.io/docs/machines/api/machines-resource/,
// re-verified 2026-09-11). Anything outside these sets is reported as unknown
// rather than mapped to an invented state.
const TRANSITIONING_STATES = new Set(["created", "starting", "stopping", "suspending", "replacing"]);
const STOPPED_STATES = new Set(["stopped", "suspended", "destroyed"]);

const flyCheckSchema = z.object({
  status: z.string().min(1).max(32),
  output: z.string().max(1000).optional(),
  updated_at: z.string().max(64).optional()
});

const flyMachineSchema = z.object({
  id: z.string().min(1).max(64),
  state: z.string().min(1).max(32),
  checks: z.record(z.string(), flyCheckSchema).optional(),
  config: z
    .object({
      guest: z
        .object({
          cpus: z.number().nonnegative().optional(),
          memory_mb: z.number().nonnegative().optional()
        })
        .optional()
    })
    .optional()
});

const flyMachinesSchema = z.array(flyMachineSchema).max(1024);

type FlyMachine = z.infer<typeof flyMachineSchema>;

function checkStatuses(machine: FlyMachine): string[] {
  return Object.values(machine.checks ?? {}).map((check) => check.status);
}

function deriveRuntime(machines: FlyMachine[], now: string): RuntimeSignal {
  const base = { observed_at: now, source: "provider" as const };
  if (machines.length === 0) {
    // Zero machines is faithful stopped evidence; the attention evaluator owns
    // the scale-to-zero/scheduled/manual policy match.
    return { ...base, state: "stopped", detail: "fly returned no machines for this app" };
  }

  const started = machines.filter((machine) => machine.state === "started");
  if (started.length > 0) {
    const critical = started.filter((machine) => checkStatuses(machine).includes("critical"));
    const warning = started.filter(
      (machine) => !checkStatuses(machine).includes("critical") &&
        checkStatuses(machine).some((status) => status !== "passing")
    );
    if (critical.length === started.length) {
      return {
        ...base,
        state: "unhealthy",
        detail: `all ${started.length} started machine(s) report critical health checks`
      };
    }
    if (critical.length > 0 || warning.length > 0) {
      return {
        ...base,
        state: "degraded",
        detail: `${critical.length} critical and ${warning.length} warning health-check result(s) across ${started.length} started machine(s)`
      };
    }
    return {
      ...base,
      state: "healthy",
      detail: `${started.length} of ${machines.length} machine(s) started with passing checks`
    };
  }

  if (machines.some((machine) => TRANSITIONING_STATES.has(machine.state))) {
    return {
      ...base,
      state: "degraded",
      detail: `machines transitioning (${[...new Set(machines.map((machine) => machine.state))].join(", ")})`
    };
  }
  if (machines.every((machine) => STOPPED_STATES.has(machine.state))) {
    return {
      ...base,
      state: "stopped",
      detail: `all ${machines.length} machine(s) stopped or suspended`
    };
  }
  return {
    ...base,
    state: "unknown",
    detail: `unrecognized machine states (${[...new Set(machines.map((machine) => machine.state))].join(", ")})`
  };
}

function deriveUsage(machines: FlyMachine[], now: string): UsageMeasure[] {
  // Point-in-time allocation observation: the measure period is the receipt
  // instant, and allocation totals are operational-only — never billable
  // consumption.
  const periodStart = new Date(Date.parse(now) - 1000).toISOString();
  const base = {
    period_start: periodStart,
    period_end: now,
    provider_reported_at: now,
    billing_alignment: "operational_only" as const,
    availability: "available" as const
  };
  const allocatedVcpu = machines.reduce((sum, machine) => sum + (machine.config?.guest?.cpus ?? 0), 0);
  const allocatedMemoryMb = machines.reduce((sum, machine) => sum + (machine.config?.guest?.memory_mb ?? 0), 0);
  return [
    { ...base, metric: "machine_count", value: machines.length, unit: "machines" },
    { ...base, metric: "allocated_vcpu", value: allocatedVcpu, unit: "vcpu" },
    { ...base, metric: "allocated_memory_mb", value: allocatedMemoryMb, unit: "MB" }
  ];
}

export function createFlyAdapter(): MonitoringAdapter {
  const provider = "fly" as const;

  function capabilities(): AdapterCapabilities {
    return {
      resourceKinds: ["app"],
      supportedSignals: SUPPORTED_SIGNALS,
      consoleHosts: ["fly.io"],
      implemented: true,
      apiHosts: [FLY_API_HOST],
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
      throw new AdapterError("timeout", "fly request aborted before dispatch");
    }
    // Validate the app slug before it is ever interpolated into the URL path.
    const app = input.binding.resource_id;
    if (!FLY_APP_SLUG.test(app)) {
      throw new AdapterError("unsupported_capability", "fly binding resource_id is not a valid Fly app slug");
    }

    let response: Response;
    try {
      response = await input.fetch(`https://${FLY_API_HOST}/v1/apps/${app}/machines`, {
        method: "GET",
        headers: { authorization: input.credential.authorizationHeader(), accept: "application/json" },
        redirect: "manual",
        signal
      });
    } catch (error) {
      if (isAdapterError(error)) throw error;
      const name = (error as { name?: string } | null)?.name;
      if (signal.aborted || name === "TimeoutError" || name === "AbortError") {
        throw new AdapterError("timeout", "fly request exceeded its abort deadline");
      }
      throw new AdapterError("malformed_response", "fly transport failed");
    }

    if (response.status === 401) throw new AdapterError("authentication_failed", "fly authentication failed");
    if (response.status === 403) throw new AdapterError("permission_denied", "fly permission denied");
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new AdapterError("rate_limited", "fly rate limited", {
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.floor(retryAfter) : undefined
      });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new AdapterError("malformed_response", `fly responded with unexpected status ${response.status}`);
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > ADAPTER_MAX_RESPONSE_BYTES) {
      throw new AdapterError("malformed_response", "fly response exceeded the bounded size limit");
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AdapterError("malformed_response", "fly response body could not be read");
    }
    if (text.length > ADAPTER_MAX_RESPONSE_BYTES) {
      throw new AdapterError("malformed_response", "fly response exceeded the bounded size limit");
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AdapterError("malformed_response", "fly response was not valid JSON");
    }
    const machines = flyMachinesSchema.safeParse(json);
    if (!machines.success) {
      throw new AdapterError("malformed_response", "fly machines payload failed schema validation");
    }

    return {
      adapter: { version: FLY_ADAPTER_VERSION, capabilities: [...SUPPORTED_SIGNALS] },
      deployment: null,
      runtime: deriveRuntime(machines.data, input.now),
      usage: deriveUsage(machines.data, input.now),
      platform_incident: null
    };
  }

  return { provider, version: FLY_ADAPTER_VERSION, capabilities, validateBinding, collect };
}
