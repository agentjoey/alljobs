"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  AttentionReason,
  BillingAlignment,
  CollectorSignal,
  DeploymentSignal,
  RuntimeSignal,
  UsageMeasure
} from "@/lib/monitoring/domain/types";
import type {
  MonitoringBindingDetail,
  MonitoringProjectView,
  MonitoringRecentEvent
} from "@/lib/monitoring/queries/project";
import {
  AttentionStatus,
  MONITORING_PROVIDER_LABELS,
  formatClock,
  formatTimestamp,
  freshnessLabel
} from "./monitoring-overview";
import { MonitoringRefreshControl } from "./monitoring-refresh-control";

// R5 Application Monitoring — Project detail (design §11.2, plan Task 8).
// Order is fixed: Project attention + leading reason → provider-binding
// comparison → expanded signal matrix → recent normalized evidence with a
// bounded deterministic interpretation that never claims root cause. Every
// signal stays separate: a succeeded deployment and a failed runtime probe are
// rendered side by side, never merged. No credentials, raw provider payloads,
// or logs can appear — the view model only carries normalized fields.

const COLLECTOR_LABELS: Record<CollectorSignal["state"], string> = {
  success: "Healthy",
  authentication_failed: "Authentication failed",
  permission_denied: "Permission denied",
  rate_limited: "Rate limited",
  timeout: "Timeout",
  malformed_response: "Malformed response",
  unsupported_capability: "Unsupported capability"
};

const DEPLOYMENT_LABELS: Record<DeploymentSignal["state"], string> = {
  queued: "Queued",
  building: "Building",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  unavailable: "Unavailable",
  not_applicable: "Not applicable"
};

const RUNTIME_LABELS: Record<RuntimeSignal["state"], string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
  expected_idle: "Expected idle",
  stopped: "Stopped",
  unknown: "Unknown",
  not_applicable: "Not applicable"
};

const BILLING_LABELS: Record<BillingAlignment, string> = {
  exact: "Exact billing",
  provider_estimate: "Provider estimate",
  operational_only: "Operational only"
};

const FRESHNESS_RANK = { expired: 0, never_collected: 1, delayed: 2, current: 3 } as const;

function collectorText(collector: CollectorSignal): string {
  const base = COLLECTOR_LABELS[collector.state];
  return collector.state === "rate_limited" && collector.retry_after_seconds !== undefined
    ? `${base} · retry in ${collector.retry_after_seconds}s`
    : base;
}

function deploymentText(deployment: DeploymentSignal | null): string {
  if (!deployment) return "—";
  const label = DEPLOYMENT_LABELS[deployment.state];
  return deployment.revision ? `${label} · ${deployment.revision}` : label;
}

function runtimeText(runtime: RuntimeSignal | null): string {
  if (!runtime) return "—";
  const label = RUNTIME_LABELS[runtime.state];
  const parts = [label];
  if (runtime.detail) parts.push(runtime.detail);
  if (runtime.consecutive_failures && runtime.consecutive_failures > 1) {
    parts.push(`${runtime.consecutive_failures} consecutive failures`);
  }
  return parts.join(" · ");
}

/** Compact usage summary for comparison cells — never carries cost/currency. */
function usageSummary(usage: readonly UsageMeasure[]): string {
  if (usage.length === 0) return "—";
  const measure = usage.find((entry) => entry.availability === "available");
  if (!measure || measure.value === undefined) return "Not available";
  const base = `${measure.value} ${measure.unit}`;
  if (measure.allowance && measure.allowance > 0) {
    return `${base} · ${Math.round((measure.value * 100) / measure.allowance)}% of allowance`;
  }
  return base;
}

function bindingFreshness(binding: MonitoringBindingDetail): string {
  const signals = binding.freshness?.signals ?? [];
  if (signals.length === 0) return "—";
  const worst = signals.reduce((a, b) => (FRESHNESS_RANK[a.state] <= FRESHNESS_RANK[b.state] ? a : b));
  return freshnessLabel(worst.state);
}

function bindingLabel(binding: MonitoringBindingDetail): string {
  // binding_id keeps two bindings of the same provider and resource kind
  // distinguishable in the row, the toggle's accessible name, and the
  // expanded panel heading; its charset is schema-restricted and safe.
  return `${MONITORING_PROVIDER_LABELS[binding.provider]} · ${binding.resource_kind} · ${binding.binding_id}`;
}

function SignalCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="mon-signal">
      <span className="mon-signal__label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function sameReason(a: AttentionReason, b: AttentionReason): boolean {
  return a.code === b.code && a.summary === b.summary && a.observed_at === b.observed_at;
}

function BindingPanel({
  binding,
  leadingReason
}: {
  binding: MonitoringBindingDetail;
  leadingReason: AttentionReason | null;
}) {
  // The Project-level leading reason is already called out in the "Why
  // attention" strip; repeat it here only when it is not the same reason.
  const reasons = leadingReason
    ? binding.reasons.filter((reason) => !sameReason(reason, leadingReason))
    : binding.reasons;
  return (
    <>
      <div className="mon-signal-grid" role="group" aria-label={`Signal matrix for ${bindingLabel(binding)}`}>
        <SignalCell
          label="Collector"
          value={binding.collector ? collectorText(binding.collector) : "Not yet collected"}
        />
        <SignalCell label="Deployment" value={deploymentText(binding.deployment)} />
        <SignalCell label="Runtime" value={runtimeText(binding.runtime)} />
        <SignalCell label="Usage" value={usageSummary(binding.usage)} />
        <SignalCell
          label="Platform incident"
          value={
            binding.platform_incident
              ? `${binding.platform_incident.summary} · ${binding.platform_incident.severity}/${binding.platform_incident.status}`
              : "None related"
          }
        />
        <SignalCell label="Freshness" value={bindingFreshness(binding)} />
      </div>

      {binding.usage.length > 0 && (
        <ul className="mon-usage-list" aria-label="Usage measures">
          {binding.usage.map((measure) => (
            <li key={measure.metric}>
              <code>{measure.metric}</code>
              <span data-usage-availability={measure.availability}>
                {measure.availability === "available" && measure.value !== undefined
                  ? `${measure.value} ${measure.unit}${
                      measure.allowance && measure.allowance > 0
                        ? ` · ${Math.round((measure.value * 100) / measure.allowance)}% of allowance`
                        : ""
                    }`
                  : "Not available"}
              </span>
              <span>{BILLING_LABELS[measure.billing_alignment]}</span>
              {measure.cost !== undefined && measure.currency !== undefined && (
                <span>
                  {measure.currency} {measure.cost}
                </span>
              )}
              <span className="mon-secondary">
                period <time dateTime={measure.period_start}>{formatClock(measure.period_start)}</time>
                {" → "}
                <time dateTime={measure.period_end}>{formatTimestamp(measure.period_end)}</time>
              </span>
              <span className="mon-secondary">
                reported{" "}
                <time dateTime={measure.provider_reported_at}>
                  {formatTimestamp(measure.provider_reported_at)}
                </time>
              </span>
            </li>
          ))}
        </ul>
      )}

      {binding.freshness && binding.freshness.signals.length > 0 && (
        <ul className="mon-freshness-list" aria-label="Signal freshness">
          {binding.freshness.signals.map((signal) => (
            <li key={signal.signal}>
              <code>{signal.signal}</code>
              <span>{freshnessLabel(signal.state)}</span>
              <span className="mon-secondary">
                {signal.observed_at ? (
                  <>
                    observed <time dateTime={signal.observed_at}>{formatTimestamp(signal.observed_at)}</time>
                  </>
                ) : (
                  "never observed"
                )}{" "}
                · max age {signal.max_age_seconds}s
              </span>
            </li>
          ))}
        </ul>
      )}

      {reasons.length > 0 && (
        <ul className="mon-reason-list" aria-label="Attention reasons">
          {reasons.map((reason: AttentionReason) => (
            <li key={`${reason.code}/${reason.observed_at}`}>
              <code>{reason.code}</code>
              <span>{reason.summary}</span>
              <span className="mon-secondary">
                {reason.dimension} · observed{" "}
                <time dateTime={reason.observed_at}>{formatClock(reason.observed_at)}</time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Deterministic, bounded interpretation: the only claim allowed is a timing
 * relationship between a deployment transition and a later runtime failure on
 * the same binding. It is correlation evidence, never a root cause.
 *
 * Production contract (lib/monitoring/store/events.ts): a deployment reaching
 * `succeeded` is a signal_state event whose `new` is the state token. A
 * deployment_identity event's `new` is the `deployment_id/revision` identity
 * token, never a state, so identity events can never satisfy this correlation.
 */
function interpretationFor(events: readonly MonitoringRecentEvent[]): string {
  for (const runtimeEvent of events) {
    if (runtimeEvent.type !== "signal_state" || runtimeEvent.dimension !== "runtime") continue;
    if (runtimeEvent.new !== "unhealthy" && runtimeEvent.new !== "degraded") continue;
    const failedAt = Date.parse(runtimeEvent.observed_at);
    // Deterministic pick: the latest same-binding `succeeded` deployment
    // signal transition observed at or before the failure (ties broken by
    // recorded_at). Later deployments and other bindings never qualify.
    let deployment: MonitoringRecentEvent | null = null;
    for (const event of events) {
      if (event.type !== "signal_state" || event.dimension !== "deployment") continue;
      if (event.binding_id !== runtimeEvent.binding_id || event.new !== "succeeded") continue;
      const deployedAt = Date.parse(event.observed_at);
      if (deployedAt > failedAt) continue;
      if (
        deployment === null ||
        deployedAt > Date.parse(deployment.observed_at) ||
        (deployedAt === Date.parse(deployment.observed_at) && event.recorded_at > deployment.recorded_at)
      ) {
        deployment = event;
      }
    }
    if (!deployment) continue;
    const minutes = Math.round((failedAt - Date.parse(deployment.observed_at)) / 60000);
    return `The failure began ${minutes} minutes after the active deployment. This is correlation evidence only; the initial release does not claim root cause or remediate automatically.`;
  }
  return "These are normalized transition events — correlation evidence only; the initial release does not claim root cause or remediate automatically.";
}

function RecentEvidence({ events }: { events: MonitoringRecentEvent[] }) {
  return (
    <section aria-labelledby="mon-evidence-title">
      <div className="mon-section-head">
        <h2 id="mon-evidence-title">Recent evidence</h2>
        <span className="mon-section-note">Normalized cache · bounded window</span>
      </div>
      {events.length === 0 ? (
        <p className="mon-empty">No transition events recorded in the recent window.</p>
      ) : (
        <div className="mon-history">
          <ul className="mon-event-list">
            {events.map((event, index) => (
              <li key={`${event.recorded_at}/${index}`} className="mon-event">
                <time dateTime={event.observed_at}>{formatClock(event.observed_at)}</time>
                <div className="mon-event__copy">
                  <span>
                    {event.dimension} · {event.key}: {event.previous ?? "none"} → {event.new}
                  </span>
                  <span className="mon-secondary">
                    binding {event.binding_id} · recorded{" "}
                    <time dateTime={event.recorded_at}>{formatClock(event.recorded_at)}</time>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <aside className="mon-interpretation">
            <span className="mon-kicker">Deterministic interpretation</span>
            <p>{interpretationFor(events)}</p>
          </aside>
        </div>
      )}
    </section>
  );
}

function DetailHeader({ view }: { view: MonitoringProjectView }) {
  const project = view.project ?? { slug: "unknown", name: "Unknown project" };
  const policies = [...new Set(view.bindings.map((binding) => binding.expected_runtime))];
  return (
    <header className="view-header view-header--center">
      <div>
        <span className="mon-kicker">Project monitoring</span>
        <h1 className="view-title">{project.name}</h1>
        <p className="view-subtitle">
          {view.bindings.length} provider binding{view.bindings.length === 1 ? "" : "s"}
          {policies.length > 0 ? ` · ${policies.join(", ")}` : ""}
        </p>
      </div>
      <div className="view-header__actions">
        {view.attention ? (
          <AttentionStatus level={view.attention} />
        ) : (
          <span className="mon-status mon-status--pending">Not yet collected</span>
        )}
        {view.project && view.bindings.length > 0 && (
          <MonitoringRefreshControl project={project.slug} />
        )}
      </div>
    </header>
  );
}

export function ProjectMonitoringDetail({ view }: { view: MonitoringProjectView }) {
  const [expanded, setExpanded] = useState<readonly string[]>([]);

  if (view.status === "disabled") {
    return (
      <div className="mon-view">
        <p className="mon-notice">
          Monitoring is disabled on this Control Host. Enable it in the Control Host configuration
          to start bounded, read-only collection.
        </p>
      </div>
    );
  }

  if (view.status === "not_found") {
    return (
      <div className="mon-view">
        <p className="mon-notice">This Project is not monitored.</p>
      </div>
    );
  }

  if (view.status === "cache_unavailable") {
    return (
      <div className="mon-view">
        <p role="alert" className="mon-notice mon-notice--error">
          Cached monitoring projection is unavailable ({view.issue ?? "unknown issue"}). The last
          good snapshot is not shown because it cannot be trusted; the next successful collection
          cycle replaces it.
        </p>
      </div>
    );
  }

  const project = view.project ?? { slug: "unknown", name: "Unknown project" };

  const toggle = (bindingId: string) => {
    setExpanded((current) =>
      current.includes(bindingId)
        ? current.filter((id) => id !== bindingId)
        : [...current, bindingId]
    );
  };

  return (
    <div className="mon-view">
      <nav className="mon-breadcrumb" aria-label="Breadcrumb">
        <Link href="/monitoring">Monitoring</Link> / {project.name}
      </nav>
      <div className="mon-provenance" aria-label="Cached projection provenance">
        <span>/monitoring/{project.slug} · cached projection</span>
        <span>
          {view.collected_at ? (
            <>
              collected <time dateTime={view.collected_at}>{formatTimestamp(view.collected_at)}</time>
            </>
          ) : (
            "no collection yet"
          )}
          {view.cycle_id ? <> · cycle {view.cycle_id}</> : null}
        </span>
      </div>
      <DetailHeader view={view} />

      {view.status === "awaiting_first_collection" && (
        <p className="mon-notice">
          Awaiting first collection — this Project is registered for monitoring but has not been
          collected yet; no binding here can report healthy.
        </p>
      )}

      <section className="mon-why" aria-label="Why attention">
        <span className="mon-kicker">Why attention</span>
        <p>
          {view.leading_reason ? (
            <strong>{view.leading_reason.summary}</strong>
          ) : view.attention === "healthy" ? (
            "No active reasons — every required signal is current and good."
          ) : (
            "No attention reason is available yet."
          )}
        </p>
      </section>

      <section aria-labelledby="mon-bindings-title">
        <div className="mon-section-head">
          <h2 id="mon-bindings-title">Provider bindings</h2>
          <span className="mon-section-note">
            Signals stay separate; Project state uses the most severe required signal
          </span>
        </div>
        {view.bindings.length === 0 ? (
          <p className="mon-empty">This Project declares no monitoring bindings.</p>
        ) : (
          <>
            <div className="mon-table-wrap">
              <table className="ledger-table" aria-label={`Provider bindings for ${project.name}`}>
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>State</th>
                    <th>Deployment</th>
                    <th>Runtime</th>
                    <th>Usage</th>
                    <th>Freshness</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {view.bindings.map((binding) => (
                    <tr key={binding.binding_id}>
                      <td data-label="Resource">
                        <strong>{bindingLabel(binding)}</strong>
                      </td>
                      <td data-label="State">
                        {binding.pending || !binding.attention ? (
                          <span className="mon-status mon-status--pending">Not yet collected</span>
                        ) : (
                          <AttentionStatus level={binding.attention} />
                        )}
                      </td>
                      <td data-label="Deployment">
                        {binding.deployment
                          ? DEPLOYMENT_LABELS[binding.deployment.state]
                          : "—"}
                      </td>
                      <td data-label="Runtime">
                        {binding.runtime ? RUNTIME_LABELS[binding.runtime.state] : "—"}
                      </td>
                      <td data-label="Usage">{usageSummary(binding.usage)}</td>
                      <td data-label="Freshness">{bindingFreshness(binding)}</td>
                      <td data-label="Action">
                        <span className="mon-binding-actions">
                          <button
                            type="button"
                            className="mon-open"
                            aria-expanded={expanded.includes(binding.binding_id)}
                            aria-controls={`mon-binding-${binding.binding_id}`}
                            aria-label={`Signal matrix for ${bindingLabel(binding)}`}
                            onClick={() => toggle(binding.binding_id)}
                          >
                            {expanded.includes(binding.binding_id) ? "Collapse ↑" : "Open ›"}
                          </button>
                          <a
                            className="mon-open"
                            href={binding.console_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Provider console ↗
                          </a>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {view.bindings.map((binding) => (
              <div
                key={binding.binding_id}
                id={`mon-binding-${binding.binding_id}`}
                className="mon-binding-panel"
                hidden={!expanded.includes(binding.binding_id)}
              >
                <div className="mon-binding-panel__head">
                  <div>
                    <span className="mon-kicker">Selected binding</span>
                    <h3>{bindingLabel(binding)}</h3>
                  </div>
                </div>
                <BindingPanel binding={binding} leadingReason={view.leading_reason} />
              </div>
            ))}
          </>
        )}
      </section>

      <RecentEvidence events={view.recent_evidence} />
    </div>
  );
}
