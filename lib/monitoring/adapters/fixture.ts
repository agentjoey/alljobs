import { z } from "zod";
import {
  deploymentSignalSchema,
  monitoringBindingSchema,
  MONITORING_PROVIDER_CAPABILITIES,
  platformIncidentSignalSchema,
  runtimeSignalSchema,
  usageMeasureSchema,
  type MonitoringProvider,
  type RequiredSignal
} from "../domain/schemas";
import type { MonitoringBinding } from "../domain/types";
import {
  ADAPTER_MAX_RESPONSE_BYTES,
  AdapterError,
  isAdapterError,
  type AdapterCapabilities,
  type AdapterCollectInput,
  type AdapterCollectResult,
  type BindingValidation,
  type MonitoringAdapter
} from "./contracts";

// Fixture adapter: a fully contract-conformant adapter over a fixed,
// never-real host. Unit and e2e tests drive it through the injected fetch
// seam; conformance proves the shared request/response boundaries against it.
// Phase 0 uses it for end-to-end state-matrix verification without any
// production provider credential.

export const FIXTURE_ADAPTER_HOST = "fixture-collector.invalid";
const FIXTURE_DEFAULT_SIGNALS: readonly RequiredSignal[] = ["deployment", "runtime", "usage"];

const fixtureEvidenceSchema = z
  .object({
    deployment: deploymentSignalSchema.nullable().optional(),
    runtime: runtimeSignalSchema.nullable().optional(),
    usage: z.array(usageMeasureSchema).max(32).optional(),
    platform_incident: platformIncidentSignalSchema.nullable().optional()
  })
  .strict();

export interface FixtureAdapterOptions {
  provider?: MonitoringProvider;
  version?: string;
  supportedSignals?: readonly RequiredSignal[];
  signalMaxAgeSeconds?: Readonly<Partial<Record<RequiredSignal, number>>>;
}

export function createFixtureAdapter(options: FixtureAdapterOptions = {}): MonitoringAdapter {
  const provider: MonitoringProvider = options.provider ?? "railway";
  const version = options.version ?? "0.0.0-fixture";
  const supportedSignals = options.supportedSignals ?? FIXTURE_DEFAULT_SIGNALS;
  const signalMaxAgeSeconds = Object.fromEntries(
    supportedSignals.map((signal) => [signal, 3600])
  ) as Partial<Record<RequiredSignal, number>>;
  const domainCapabilities = MONITORING_PROVIDER_CAPABILITIES[provider];

  function capabilities(): AdapterCapabilities {
    return {
      resourceKinds: domainCapabilities.resourceKinds,
      supportedSignals,
      consoleHosts: domainCapabilities.consoleHosts,
      implemented: true,
      apiHosts: [FIXTURE_ADAPTER_HOST],
      methods: ["GET"],
      signalMaxAgeSeconds
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
      if (!supportedSignals.includes(signal)) {
        issues.push(`required signal '${signal}' is not supported by this adapter`);
      }
    }
    return issues.length === 0 ? { ok: true } : { ok: false, issues };
  }

  async function collect(input: AdapterCollectInput, signal: AbortSignal): Promise<AdapterCollectResult> {
    if (signal.aborted) {
      throw new AdapterError("timeout", "fixture request aborted before dispatch");
    }

    let response: Response;
    try {
      response = await input.fetch(`https://${FIXTURE_ADAPTER_HOST}/v1/collect/${input.binding.id}`, {
        method: "GET",
        headers: { authorization: input.credential.authorizationHeader(), accept: "application/json" },
        redirect: "manual",
        signal
      });
    } catch (error) {
      if (isAdapterError(error)) throw error;
      const name = (error as { name?: string } | null)?.name;
      if (signal.aborted || name === "TimeoutError" || name === "AbortError") {
        throw new AdapterError("timeout", "fixture request exceeded its abort deadline");
      }
      throw new AdapterError("malformed_response", "fixture transport failed");
    }

    if (response.status === 401) throw new AdapterError("authentication_failed", "fixture authentication failed");
    if (response.status === 403) throw new AdapterError("permission_denied", "fixture permission denied");
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new AdapterError("rate_limited", "fixture rate limited", {
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.floor(retryAfter) : undefined
      });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new AdapterError("malformed_response", `fixture responded with unexpected status ${response.status}`);
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > ADAPTER_MAX_RESPONSE_BYTES) {
      throw new AdapterError("malformed_response", "fixture response exceeded the bounded size limit");
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AdapterError("malformed_response", "fixture response body could not be read");
    }
    if (text.length > ADAPTER_MAX_RESPONSE_BYTES) {
      throw new AdapterError("malformed_response", "fixture response exceeded the bounded size limit");
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AdapterError("malformed_response", "fixture response was not valid JSON");
    }
    const evidence = fixtureEvidenceSchema.safeParse(json);
    if (!evidence.success) {
      throw new AdapterError("malformed_response", "fixture evidence failed schema validation");
    }

    return {
      adapter: { version, capabilities: [...supportedSignals] },
      deployment: evidence.data.deployment ?? null,
      runtime: evidence.data.runtime ?? null,
      usage: evidence.data.usage ?? [],
      platform_incident: evidence.data.platform_incident ?? null
    };
  }

  return { provider, version, capabilities, validateBinding, collect };
}
