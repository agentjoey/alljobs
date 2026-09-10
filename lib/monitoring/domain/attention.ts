import type {
  AttentionLevel,
  AttentionReason,
  CollectorSignal,
  DeploymentSignal,
  FreshnessSignal,
  MonitoringBinding,
  PlatformIncidentSignal,
  RequiredSignal,
  RuntimeSignal,
  SignalDimension,
  SignalFreshness,
  UsageMeasure
} from "./types";

// Deterministic attention and freshness evaluation (design §8 and §9).
// Everything here is a pure function of its input: the clock is injected as
// `now`, and no filesystem, config, or network access happens inside the
// evaluator. There is intentionally no numeric composite score — attention is
// the highest-precedence severity among explainable, machine-readable reasons.

/** Consecutive probe/runtime failures required before "unhealthy" is confirmed. */
export const CONFIRMED_CONSECUTIVE_FAILURES = 2;
/** Known-allowance percentage at which a measure enters the watch band. */
export const ALLOWANCE_WATCH_PERCENT = 75;
/** Known-allowance percentage at which a measure enters the warning band. */
export const ALLOWANCE_WARNING_PERCENT = 90;
/** Known-allowance percentage at which the allowance is exhausted. */
export const ALLOWANCE_EXHAUSTED_PERCENT = 100;

const SEVERITY_RANK: Record<AttentionLevel, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  watch: 3,
  healthy: 4
};

const SIGNAL_DIMENSION: Record<RequiredSignal, SignalDimension> = {
  deployment: "deployment",
  runtime: "runtime",
  usage: "usage",
  platform_incident: "platform_incident"
};

/** Incident statuses that mean the incident no longer threatens the binding. */
const RESOLVED_INCIDENT_STATUSES = new Set(["resolved", "completed", "closed"]);

export interface AttentionEvaluationInput {
  binding: MonitoringBinding;
  collector: CollectorSignal;
  deployment: DeploymentSignal | null;
  runtime: RuntimeSignal | null;
  usage: UsageMeasure[];
  platform_incident: PlatformIncidentSignal | null;
  freshness: FreshnessSignal;
  /** Signals the selected adapter itself can supply (probe-derived runtime is added from the binding). */
  adapter_capabilities: readonly RequiredSignal[];
  /** Injected evaluation time (ISO timestamp). */
  now: string;
}

export interface AttentionEvaluation {
  attention: AttentionLevel;
  /** Highest-precedence reason (severity precedence, then stable code sort); null when healthy. */
  leading: AttentionReason | null;
  /** Every applicable reason, sorted leading-first. */
  reasons: AttentionReason[];
}

/**
 * Derives one signal's freshness state from its observation timestamp, the
 * declared maximum trustworthy age, and whether the latest collection attempt
 * failed. Boundary: age exactly at max_age_seconds is still `current`.
 */
export function deriveSignalFreshness(
  input: { signal: SignalFreshness["signal"]; observed_at: string | null; max_age_seconds: number },
  now: string,
  attemptFailed = false
): SignalFreshness {
  let state: SignalFreshness["state"];
  if (input.observed_at === null) {
    state = "never_collected";
  } else {
    // Defensive clamp: a future provider timestamp must not look expired.
    const ageMs = Math.max(0, Date.parse(now) - Date.parse(input.observed_at));
    if (ageMs > input.max_age_seconds * 1000) {
      state = "expired";
    } else if (attemptFailed) {
      state = "delayed";
    } else {
      state = "current";
    }
  }
  return {
    signal: input.signal,
    observed_at: input.observed_at,
    max_age_seconds: input.max_age_seconds,
    state
  };
}

/** Derives the whole freshness signal; a non-success collector attempt delays every observed signal. */
export function deriveFreshnessSignal(
  entries: ReadonlyArray<{ signal: SignalFreshness["signal"]; observed_at: string | null; max_age_seconds: number }>,
  now: string,
  collector: CollectorSignal
): FreshnessSignal {
  const attemptFailed = collector.state !== "success";
  return { signals: entries.map((entry) => deriveSignalFreshness(entry, now, attemptFailed)) };
}

function formatPercent(percent: number): string {
  return Number.isFinite(percent) ? `${Math.round(percent * 10) / 10}` : "over 100";
}

/**
 * Evaluates aggregate attention for one binding snapshot.
 *
 * Precedence is critical > warning > unknown > watch > healthy; every
 * applicable reason is retained. Missing, stale, unauthorized, malformed, or
 * required-unsupported data can never produce `healthy`.
 */
export function evaluateAttention(input: AttentionEvaluationInput): AttentionEvaluation {
  const { binding, collector, now } = input;
  const reasons: AttentionReason[] = [];
  const add = (
    code: string,
    dimension: SignalDimension,
    severity: AttentionLevel,
    summary: string,
    observed_at: string
  ) => {
    reasons.push({ code, dimension, severity, summary, observed_at });
  };

  const required = new Set(binding.required_signals);
  const supported = new Set(input.adapter_capabilities);
  const isSatisfiable = (signal: RequiredSignal) =>
    supported.has(signal) || (signal === "runtime" && binding.probe !== undefined);

  // Signals that must not be value-evaluated: unsupported-required (binding
  // validation failure) or invalidated by an auth/permission failure.
  const unevaluable = new Set<RequiredSignal>();

  for (const signal of binding.required_signals) {
    if (!isSatisfiable(signal)) {
      unevaluable.add(signal);
      add(
        "unsupported_required_signal",
        SIGNAL_DIMENSION[signal],
        "unknown",
        `Required signal '${signal}' cannot be supplied by the ${binding.provider} adapter` +
          `${signal === "runtime" ? " and no independent probe is configured" : ""}; the binding must be corrected before health can be judged.`,
        now
      );
    }
  }

  if (collector.state === "authentication_failed" || collector.state === "permission_denied") {
    const code =
      collector.state === "authentication_failed" ? "collector_authentication_failed" : "collector_permission_denied";
    const affected = binding.required_signals.filter((signal) => !unevaluable.has(signal));
    if (affected.length === 0) {
      // No required signal exists to invalidate, but the failure stays visible.
      add(
        code,
        "collector",
        "watch",
        `Collection is blocked by ${collector.state === "authentication_failed" ? "an authentication failure" : "a permission denial"} on credential reference '${binding.credential_ref}'; no required signal is affected.`,
        collector.attempted_at
      );
    } else {
      for (const signal of affected) {
        unevaluable.add(signal);
        add(
          code,
          SIGNAL_DIMENSION[signal],
          "unknown",
          `Required signal '${signal}' is untrustworthy: ${collector.state === "authentication_failed" ? "authentication failed" : "permission was denied"} for credential reference '${binding.credential_ref}'. Renew the credential or its scopes; retrying cannot restore trust.`,
          collector.attempted_at
        );
      }
    }
  }

  // Freshness gating for required signals. Only signals whose last value is
  // still inside its maximum age may be value-evaluated below.
  const valueTrustworthy = new Set<RequiredSignal>();
  for (const signal of binding.required_signals) {
    if (unevaluable.has(signal)) continue;
    const entry = input.freshness.signals.find((candidate) => candidate.signal === signal);
    const state = entry?.state ?? "never_collected";
    const evidence = entry?.observed_at ?? collector.attempted_at;
    if (state === "never_collected") {
      add(
        "first_collection",
        SIGNAL_DIMENSION[signal],
        "unknown",
        `Required signal '${signal}' has never been collected; no trustworthy value exists to evaluate.`,
        collector.attempted_at
      );
      continue;
    }
    if (state === "expired") {
      add(
        "stale_max_age_exceeded",
        "freshness",
        "unknown",
        `Required signal '${signal}' is older than its maximum trustworthy age of ${entry?.max_age_seconds ?? "?"}s; the retained value no longer proves current health.`,
        evidence
      );
      continue;
    }
    if (state === "delayed") {
      add(
        "collection_delayed",
        "freshness",
        "watch",
        `Collection of required signal '${signal}' is delayed; the last trustworthy value from ${entry?.observed_at ?? "the previous cycle"} is still inside its maximum age.`,
        evidence
      );
    }
    valueTrustworthy.add(signal);
  }

  const missingRequired = (signal: RequiredSignal) => {
    add(
      "required_signal_missing",
      SIGNAL_DIMENSION[signal],
      "unknown",
      `Required signal '${signal}' has no current value despite a collection window inside its maximum age.`,
      now
    );
  };

  // --- Deployment ---
  const deployment = input.deployment;
  const deploymentRequired = required.has("deployment");
  const deploymentUsable = deployment !== null && deployment.state !== "not_applicable";
  // A stale/expired retained value is never evaluated as current truth.
  const deploymentEvaluable = deploymentUsable && (!deploymentRequired || valueTrustworthy.has("deployment"));
  if (deploymentEvaluable && deployment) {
    if (deployment.state === "failed") {
      add(
        "deployment_failed",
        "deployment",
        "warning",
        `Latest ${binding.environment} deployment${deployment.deployment_id ? ` '${deployment.deployment_id}'` : ""} failed.`,
        deployment.observed_at
      );
    } else if (
      deployment.state === "unavailable" &&
      required.has("deployment") &&
      valueTrustworthy.has("deployment")
    ) {
      add(
        "deployment_unavailable",
        "deployment",
        "unknown",
        "The provider reports no obtainable deployment state for a required deployment signal.",
        deployment.observed_at
      );
    }
  }
  if (required.has("deployment") && valueTrustworthy.has("deployment") && !deploymentUsable) {
    missingRequired("deployment");
  }

  // --- Runtime (provider or independent probe evidence) ---
  const runtime = input.runtime;
  const runtimeRequired = required.has("runtime");
  const runtimeUsable = runtime !== null && runtime.state !== "not_applicable";
  const runtimeEvaluable = runtimeUsable && (!runtimeRequired || valueTrustworthy.has("runtime"));
  if (runtimeEvaluable && runtime) {
    switch (runtime.state) {
      case "unhealthy": {
        const failures = runtime.consecutive_failures ?? 1;
        if (failures >= CONFIRMED_CONSECUTIVE_FAILURES) {
          add(
            "runtime_unhealthy_confirmed",
            "runtime",
            runtimeRequired ? "critical" : "warning",
            `Runtime is confirmed unhealthy after ${failures} consecutive failures` +
              `${runtime.source === "probe" ? " of the independent probe" : ""}.`,
            runtime.observed_at
          );
        } else {
          add(
            "runtime_unhealthy_transient",
            "runtime",
            "warning",
            `Runtime reported unhealthy once; a single transient failure is below the confirmed-failure threshold of ${CONFIRMED_CONSECUTIVE_FAILURES}.`,
            runtime.observed_at
          );
        }
        break;
      }
      case "degraded":
        add(
          "runtime_degraded",
          "runtime",
          runtimeRequired ? "warning" : "watch",
          "Runtime is degraded but not confirmed down.",
          runtime.observed_at
        );
        break;
      case "stopped":
      case "expected_idle":
        // Idle/stopped matches scale-to-zero, scheduled, and manual policy; an
        // always-on service in one of these states is explicitly unavailable.
        if (binding.expected_runtime === "always-on") {
          add(
            "runtime_unexpected_stopped",
            "runtime",
            runtimeRequired ? "critical" : "warning",
            `Runtime is ${runtime.state === "stopped" ? "stopped" : "idle"} but the binding declares expected_runtime 'always-on'; the required service is explicitly unavailable.`,
            runtime.observed_at
          );
        }
        break;
      case "unknown":
        if (runtimeRequired) {
          add(
            "runtime_state_unknown",
            "runtime",
            "unknown",
            "The provider reports the runtime state as unknown for a required runtime signal.",
            runtime.observed_at
          );
        }
        break;
      default:
        break; // healthy matches every expected-runtime policy
    }
  }
  if (runtimeRequired && valueTrustworthy.has("runtime") && !runtimeUsable) {
    missingRequired("runtime");
  }

  // --- Usage allowance bands (only when a same-measure allowance is known) ---
  const usageRequired = required.has("usage");
  const usageEvaluable = !usageRequired || valueTrustworthy.has("usage");
  if (usageEvaluable) {
    const availableMeasures = input.usage.filter((measure) => measure.availability === "available");
    if (usageRequired && availableMeasures.length === 0) {
      add(
        "usage_unavailable",
        "usage",
        "unknown",
        "Required usage signal has no available measure; unsupported or permission-limited usage can never be treated as healthy.",
        input.usage[0]?.provider_reported_at ?? now
      );
    }
    for (const measure of availableMeasures) {
      if (measure.allowance === undefined || measure.value === undefined) continue;
      const percent =
        measure.allowance === 0
          ? measure.value > 0
            ? Number.POSITIVE_INFINITY
            : 0
          : (measure.value * 100) / measure.allowance;
      if (percent >= ALLOWANCE_EXHAUSTED_PERCENT) {
        // Service impact is observed runtime/probe evidence, never a guess.
        const impact = runtimeUsable && (runtime.state === "unhealthy" || runtime.state === "degraded");
        add(
          impact ? "quota_exhausted_with_impact" : "quota_exhausted",
          "usage",
          impact ? "critical" : "warning",
          `Usage measure '${measure.metric}' is at ${formatPercent(percent)}% of its known allowance` +
            (impact ? " and runtime evidence shows service impact." : "; no service impact is observed."),
          measure.provider_reported_at
        );
      } else if (percent >= ALLOWANCE_WARNING_PERCENT) {
        add(
          "allowance_near_limit",
          "usage",
          "warning",
          `Usage measure '${measure.metric}' is at ${formatPercent(percent)}% of its known allowance (>= ${ALLOWANCE_WARNING_PERCENT}%).`,
          measure.provider_reported_at
        );
      } else if (percent >= ALLOWANCE_WATCH_PERCENT) {
        add(
          "allowance_watch",
          "usage",
          "watch",
          `Usage measure '${measure.metric}' is at ${formatPercent(percent)}% of its known allowance (>= ${ALLOWANCE_WATCH_PERCENT}%).`,
          measure.provider_reported_at
        );
      }
    }
  }

  // --- Platform incident (missing optional status never downgrades) ---
  const incident = input.platform_incident;
  const incidentRequired = required.has("platform_incident");
  if (incident !== null) {
    const incidentEvaluable = !incidentRequired || valueTrustworthy.has("platform_incident");
    if (incidentEvaluable && !RESOLVED_INCIDENT_STATUSES.has(incident.status.trim().toLowerCase())) {
      add(
        "platform_incident_active",
        "platform_incident",
        "warning",
        `Active provider platform incident '${incident.incident_id}' (${incident.severity}, status '${incident.status}') may threaten this binding.`,
        incident.provider_reported_at
      );
    }
  } else if (incidentRequired && valueTrustworthy.has("platform_incident")) {
    missingRequired("platform_incident");
  }

  reasons.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
  );
  const leading = reasons[0] ?? null;
  return { attention: leading ? leading.severity : "healthy", leading, reasons };
}
