import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/actions/action-result";
import { requestMonitoringRefresh, type MonitoringRefreshAck } from "@/app/actions/monitoring-refresh";
import type { MonitoringSnapshot } from "@/lib/monitoring/domain/types";
import type {
  MonitoringLandingView,
  MonitoringLedgerRow,
  MonitoringQueueItem
} from "@/lib/monitoring/queries/landing";
import type {
  MonitoringBindingDetail,
  MonitoringProjectView,
  MonitoringRecentEvent
} from "@/lib/monitoring/queries/project";
import { diffTransitions, type TransitionEvent } from "@/lib/monitoring/store/events";
import { MonitoringOverview } from "./monitoring-overview";
import { MonitoringRefreshControl } from "./monitoring-refresh-control";
import { ProjectMonitoringDetail } from "./project-monitoring-detail";

vi.mock("@/app/actions/monitoring-refresh", () => ({ requestMonitoringRefresh: vi.fn() }));

const NOW = "2026-09-11T06:00:00Z";
const OBSERVED = "2026-09-11T05:59:00Z";

function queueItem(overrides: Partial<MonitoringQueueItem> = {}): MonitoringQueueItem {
  return {
    project: "talentvault",
    project_name: "TalentVault",
    binding_id: "railway-production-api",
    provider: "railway",
    attention: "critical",
    reason: {
      code: "runtime_probe_failed",
      dimension: "runtime",
      severity: "critical",
      summary: "Required HTTP probe failed twice; deploy succeeded",
      observed_at: OBSERVED
    },
    observed_at: OBSERVED,
    ...overrides
  };
}

function ledgerRow(overrides: Partial<MonitoringLedgerRow> = {}): MonitoringLedgerRow {
  return {
    project: "talentvault",
    name: "TalentVault",
    attention: "critical",
    leading_reason: {
      code: "runtime_probe_failed",
      dimension: "runtime",
      severity: "critical",
      summary: "API probe failed",
      observed_at: OBSERVED
    },
    freshness: "current",
    binding_count: 2,
    providers: ["railway", "neon"],
    ...overrides
  };
}

function landingView(overrides: Partial<MonitoringLandingView> = {}): MonitoringLandingView {
  return {
    status: "ready",
    collected_at: NOW,
    cycle_id: "cycle-2026-09-11-06",
    cycle_status: "complete",
    summary: { projects: 5, bindings: 9, needs_attention: 4, freshness: "current" },
    queue: [],
    ledger: [],
    ...overrides
  };
}

function bindingDetail(overrides: Partial<MonitoringBindingDetail> = {}): MonitoringBindingDetail {
  return {
    binding_id: "railway-production-api",
    provider: "railway",
    resource_kind: "service",
    expected_runtime: "always-on",
    required_signals: ["deployment", "runtime"],
    console_url: "https://railway.com/project/example",
    pending: false,
    attempted_at: NOW,
    collector: { state: "success", attempted_at: NOW },
    deployment: {
      state: "succeeded",
      deployment_id: "dep-123",
      revision: "c41ea1",
      observed_at: OBSERVED
    },
    runtime: { state: "healthy", observed_at: OBSERVED, source: "probe" },
    usage: [],
    platform_incident: null,
    freshness: {
      signals: [{ signal: "runtime", observed_at: OBSERVED, max_age_seconds: 3600, state: "current" }]
    },
    attention: "healthy",
    reasons: [],
    ...overrides
  };
}

function projectView(overrides: Partial<MonitoringProjectView> = {}): MonitoringProjectView {
  return {
    status: "ready",
    project: { slug: "talentvault", name: "TalentVault" },
    attention: "healthy",
    leading_reason: null,
    collected_at: NOW,
    cycle_id: "cycle-2026-09-11-06",
    bindings: [bindingDetail()],
    recent_evidence: [],
    ...overrides
  };
}

function monitoringSnapshot(overrides: Partial<MonitoringSnapshot> = {}): MonitoringSnapshot {
  return {
    schema_version: 1,
    cycle_id: "cycle-2026-09-11-05",
    project: "talentvault",
    binding_id: "railway-production-api",
    provider: "railway",
    adapter: { version: "railway/2026-09-11", capabilities: ["deployment", "runtime"] },
    attempted_at: "2026-09-11T05:45:00Z",
    collector: { state: "success", attempted_at: "2026-09-11T05:45:00Z" },
    deployment: {
      state: "building",
      deployment_id: "dep-123",
      revision: "c41ea1",
      observed_at: "2026-09-11T05:44:00Z"
    },
    runtime: { state: "healthy", observed_at: "2026-09-11T05:44:30Z", source: "probe" },
    usage: [],
    platform_incident: null,
    freshness: { signals: [] },
    attention: "healthy",
    reasons: [],
    ...overrides
  };
}

function toRecentEvent(event: TransitionEvent): MonitoringRecentEvent {
  return {
    type: event.type,
    binding_id: event.binding_id,
    dimension: event.dimension,
    key: event.key,
    previous: event.previous,
    new: event.new,
    observed_at: event.observed_at,
    recorded_at: event.recorded_at
  };
}

function readyLedger(): MonitoringLedgerRow[] {
  return [
    ledgerRow({ project: "talentvault", name: "TalentVault", attention: "critical" }),
    ledgerRow({
      project: "grandegpt",
      name: "GrandeGPT",
      attention: "warning",
      leading_reason: {
        code: "usage_near_allowance",
        dimension: "usage",
        severity: "warning",
        summary: "Transfer reached 92% of allowance",
        observed_at: OBSERVED
      }
    }),
    ledgerRow({
      project: "mathmagics",
      name: "MathMagics",
      attention: "unknown",
      freshness: "expired",
      leading_reason: {
        code: "credential_expired",
        dimension: "collector",
        severity: "unknown",
        summary: "Credential expired; last trustworthy observation was 18h ago",
        observed_at: OBSERVED
      }
    }),
    ledgerRow({
      project: "papertrail",
      name: "Papertrail",
      attention: "watch",
      freshness: "delayed",
      leading_reason: {
        code: "collection_delayed",
        dimension: "freshness",
        severity: "watch",
        summary: "Collection delayed; last value still within maximum age",
        observed_at: OBSERVED
      }
    }),
    ledgerRow({ project: "alljobs", name: "AllJobs", attention: "healthy", leading_reason: null })
  ];
}

describe("MonitoringOverview", () => {
  it("renders the scope/trust summary with projects, bindings, needs-attention and freshness values", () => {
    render(<MonitoringOverview view={landingView({ ledger: readyLedger() })} />);

    const summary = screen.getByRole("group", { name: "Monitoring summary" });
    expect(within(summary).getByText("Projects")).toBeInTheDocument();
    expect(within(summary).getByText("5")).toBeInTheDocument();
    expect(within(summary).getByText("Bindings")).toBeInTheDocument();
    expect(within(summary).getByText("9")).toBeInTheDocument();
    expect(within(summary).getByText("Needs attention")).toBeInTheDocument();
    expect(within(summary).getByText("4")).toBeInTheDocument();
    expect(within(summary).getByText("Freshness")).toBeInTheDocument();
    expect(within(summary).getByText("Current")).toBeInTheDocument();
  });

  it("shows cached-projection provenance: collection time, cycle id and cycle status", () => {
    render(<MonitoringOverview view={landingView()} />);

    expect(screen.getByText(/cached projection/i)).toBeInTheDocument();
    expect(screen.getByText(/cycle-2026-09-11-06/)).toBeInTheDocument();
    expect(screen.getByText(/complete/i)).toBeInTheDocument();
  });

  it("keeps the attention queue to critical/warning/unknown/watch items and omits healthy projects", () => {
    const queue = [
      queueItem(),
      queueItem({
        project: "grandegpt",
        project_name: "GrandeGPT",
        binding_id: "neon-main",
        provider: "neon",
        attention: "warning",
        reason: {
          code: "usage_near_allowance",
          dimension: "usage",
          severity: "warning",
          summary: "Transfer reached 92% of allowance",
          observed_at: OBSERVED
        }
      }),
      queueItem({
        project: "mathmagics",
        project_name: "MathMagics",
        binding_id: "fly-worker",
        provider: "fly",
        attention: "unknown",
        reason: {
          code: "credential_expired",
          dimension: "collector",
          severity: "unknown",
          summary: "Credential expired; health cannot be judged",
          observed_at: OBSERVED
        }
      }),
      queueItem({
        project: "papertrail",
        project_name: "Papertrail",
        binding_id: "supabase-db",
        provider: "supabase",
        attention: "watch",
        reason: {
          code: "collection_delayed",
          dimension: "freshness",
          severity: "watch",
          summary: "Collection delayed; serving last value",
          observed_at: OBSERVED
        }
      })
    ];
    render(<MonitoringOverview view={landingView({ queue, ledger: readyLedger() })} />);

    const queueRegion = screen.getByRole("region", { name: "Needs attention" });
    const items = within(queueRegion).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(queueRegion).getByText("Critical")).toBeInTheDocument();
    expect(within(queueRegion).getByText("Warning")).toBeInTheDocument();
    expect(within(queueRegion).getByText("Unknown")).toBeInTheDocument();
    expect(within(queueRegion).getByText("Watch")).toBeInTheDocument();
    expect(within(queueRegion).queryByText("Healthy")).not.toBeInTheDocument();
    expect(within(queueRegion).queryByText("AllJobs")).not.toBeInTheDocument();
  });

  it("orders the queue by exact precedence critical → warning → unknown → watch", () => {
    const queue = [
      queueItem(),
      queueItem({ project: "grandegpt", project_name: "GrandeGPT", attention: "warning" }),
      queueItem({ project: "mathmagics", project_name: "MathMagics", attention: "unknown" }),
      queueItem({ project: "papertrail", project_name: "Papertrail", attention: "watch" })
    ];
    render(<MonitoringOverview view={landingView({ queue, ledger: readyLedger() })} />);

    const queueRegion = screen.getByRole("region", { name: "Needs attention" });
    const order = within(queueRegion)
      .getAllByRole("listitem")
      .map((item) => within(item).getByText(/Critical|Warning|Unknown|Watch/).textContent);
    expect(order).toEqual(["Critical", "Warning", "Unknown", "Watch"]);
  });

  it("labels the queue evidence time from the leading reason, never the newer collection attempt", () => {
    // A failed collection attempt at 06:00 carried forward evidence last
    // observed the previous day; the queue item's observed_at holds the
    // attempt time (snapshot.attempted_at), so labeling it "observed" would
    // misrepresent stale evidence as newly observed.
    const queue = [
      queueItem({
        attention: "unknown",
        observed_at: NOW, // snapshot.attempted_at: the failed re-collection attempt
        reason: {
          code: "collector_authentication_failed",
          dimension: "collector",
          severity: "unknown",
          summary: "Credential expired; serving the last trustworthy evidence",
          observed_at: "2026-09-10T12:00:00Z"
        }
      })
    ];
    render(<MonitoringOverview view={landingView({ queue, ledger: readyLedger() })} />);

    const queueRegion = screen.getByRole("region", { name: "Needs attention" });
    const item = within(queueRegion).getByRole("listitem");
    const evidenceTime = within(item).getByText("12:00");
    expect(evidenceTime).toHaveAttribute("datetime", "2026-09-10T12:00:00Z");
    expect(within(item).queryByText("06:00")).not.toBeInTheDocument();
  });

  it("falls back to the snapshot attempt time only when the queue item has no reason", () => {
    const queue = [queueItem({ reason: null, observed_at: NOW })];
    render(<MonitoringOverview view={landingView({ queue, ledger: readyLedger() })} />);

    const queueRegion = screen.getByRole("region", { name: "Needs attention" });
    const item = within(queueRegion).getByRole("listitem");
    const evidenceTime = within(item).getByText("06:00");
    expect(evidenceTime).toHaveAttribute("datetime", NOW);
  });

  it("renders the complete project ledger including healthy projects, in precedence order", () => {
    render(<MonitoringOverview view={landingView({ ledger: readyLedger() })} />);

    const table = screen.getByRole("table", { name: /all monitored projects/i });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
      "TalentVault",
      "GrandeGPT",
      "MathMagics",
      "Papertrail",
      "AllJobs"
    ]);
    expect(within(rows[4]).getByText("Healthy")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: /open/i })).toHaveAttribute(
      "href",
      "/monitoring/talentvault"
    );
  });

  it("surfaces delayed and expired freshness as text, never color alone", () => {
    render(<MonitoringOverview view={landingView({ ledger: readyLedger() })} />);

    const table = screen.getByRole("table", { name: /all monitored projects/i });
    expect(within(table).getByText("Delayed")).toBeInTheDocument();
    expect(within(table).getByText("Expired")).toBeInTheDocument();
    expect(within(table).getAllByText("Current").length).toBeGreaterThan(0);
  });

  it("renders a canonical empty state when monitoring is ready with zero projects", () => {
    render(
      <MonitoringOverview
        view={landingView({
          collected_at: null,
          cycle_id: null,
          cycle_status: null,
          summary: { projects: 0, bindings: 0, needs_attention: 0, freshness: null }
        })}
      />
    );

    expect(screen.getByText(/no monitored projects/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Needs attention" })).toBeInTheDocument();
  });

  it("renders the disabled state without fabricating monitoring data", () => {
    render(
      <MonitoringOverview
        view={{
          status: "disabled",
          collected_at: null,
          cycle_id: null,
          cycle_status: null,
          summary: { projects: 0, bindings: 0, needs_attention: 0, freshness: null },
          queue: [],
          ledger: []
        }}
      />
    );

    expect(screen.getByText(/monitoring is disabled/i)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /all monitored projects/i })).not.toBeInTheDocument();
  });

  it("renders awaiting_first_collection with pending rows that never claim health", () => {
    render(
      <MonitoringOverview
        view={landingView({
          status: "awaiting_first_collection",
          collected_at: null,
          cycle_id: null,
          cycle_status: null,
          summary: { projects: 1, bindings: 1, needs_attention: 1, freshness: null },
          queue: [
            queueItem({
              attention: "unknown",
              reason: {
                code: "first_collection_pending",
                dimension: "collector",
                severity: "unknown",
                summary: "This Project is registered for monitoring but has not been collected yet.",
                observed_at: NOW
              }
            })
          ],
          ledger: [
            ledgerRow({
              attention: null,
              leading_reason: null,
              freshness: null,
              binding_count: 1,
              providers: ["railway"]
            })
          ]
        })}
      />
    );

    expect(screen.getByText(/awaiting first collection/i)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /all monitored projects/i });
    expect(within(table).getByText(/not yet collected/i)).toBeInTheDocument();
    expect(within(table).queryByText("Healthy")).not.toBeInTheDocument();
  });

  it("degrades safely on cache_unavailable, surfacing the issue code without throwing", () => {
    render(
      <MonitoringOverview
        view={{
          status: "cache_unavailable",
          collected_at: null,
          cycle_id: null,
          cycle_status: null,
          summary: { projects: 0, bindings: 0, needs_attention: 0, freshness: null },
          queue: [],
          ledger: [],
          issue: "index_unparseable"
        }}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/cached monitoring projection is unavailable/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/index_unparseable/);
    expect(screen.queryByRole("table", { name: /all monitored projects/i })).not.toBeInTheDocument();
  });
});

describe("ProjectMonitoringDetail", () => {
  it("keeps mixed evidence separate: a succeeded deployment plus a failed runtime probe drive critical without rewriting deployment truth", () => {
    render(
      <ProjectMonitoringDetail
        view={projectView({
          attention: "critical",
          leading_reason: {
            code: "runtime_probe_failed",
            dimension: "runtime",
            severity: "critical",
            summary: "Required runtime probe failed twice.",
            observed_at: OBSERVED
          },
          bindings: [
            bindingDetail({
              attention: "critical",
              runtime: {
                state: "unhealthy",
                observed_at: OBSERVED,
                source: "probe",
                consecutive_failures: 2,
                detail: "HTTP 503"
              },
              reasons: [
                {
                  code: "runtime_probe_failed",
                  dimension: "runtime",
                  severity: "critical",
                  summary: "Required runtime probe failed twice.",
                  observed_at: OBSERVED
                }
              ]
            })
          ]
        })}
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: "TalentVault" })).toBeInTheDocument();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
    const table = screen.getByRole("table", { name: /provider bindings/i });
    expect(within(table).getByText(/Succeeded/)).toBeInTheDocument();
    expect(within(table).getByText(/Unhealthy/)).toBeInTheDocument();
    // The reason summary appears twice: in the Project "Why attention" strip
    // and again as the binding's own evidence (all applicable reasons remain
    // visible in Project and binding detail — design §8).
    expect(screen.getAllByText(/Required runtime probe failed twice\./)).toHaveLength(2);
  });

  it("drills down Project → binding → signal: the expanded matrix shows each signal separately", async () => {
    const user = userEvent.setup();
    render(
      <ProjectMonitoringDetail
        view={projectView({
          bindings: [
            bindingDetail({
              usage: [
                {
                  metric: "compute_seconds",
                  value: 42,
                  unit: "cu_seconds",
                  period_start: "2026-09-01T00:00:00Z",
                  period_end: "2026-10-01T00:00:00Z",
                  provider_reported_at: OBSERVED,
                  billing_alignment: "operational_only",
                  availability: "available"
                }
              ]
            })
          ]
        })}
      />
    );

    const toggle = screen.getByRole("button", { name: /signal matrix/i });
    await user.click(toggle);

    const matrix = screen.getByRole("group", { name: /signal matrix/i });
    expect(within(matrix).getByText("Collector")).toBeInTheDocument();
    expect(within(matrix).getByText("Deployment")).toBeInTheDocument();
    expect(within(matrix).getByText("Runtime")).toBeInTheDocument();
    expect(within(matrix).getByText("Usage")).toBeInTheDocument();
    expect(within(matrix).getByText("Platform incident")).toBeInTheDocument();
    expect(within(matrix).getByText("Freshness")).toBeInTheDocument();
    expect(within(matrix).getByText(/Succeeded · c41ea1/)).toBeInTheDocument();
  });

  it("links the provider console in a new tab with noreferrer", () => {
    render(<ProjectMonitoringDetail view={projectView()} />);

    const consoleLink = screen.getByRole("link", { name: /provider console/i });
    expect(consoleLink).toHaveAttribute("href", "https://railway.com/project/example");
    expect(consoleLink).toHaveAttribute("target", "_blank");
    expect(consoleLink).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("renders billing alignment as distinct labels and shows cost only for exact alignment", () => {
    const base = {
      unit: "cu_seconds",
      period_start: "2026-09-01T00:00:00Z",
      period_end: "2026-10-01T00:00:00Z",
      provider_reported_at: OBSERVED,
      availability: "available" as const
    };
    render(
      <ProjectMonitoringDetail
        view={projectView({
          bindings: [
            bindingDetail({
              usage: [
                { ...base, metric: "exact_bill", value: 10, cost: 6.38, currency: "USD", billing_alignment: "exact" },
                { ...base, metric: "estimated_bill", value: 82, billing_alignment: "provider_estimate" },
                { ...base, metric: "ops_only", value: 120, billing_alignment: "operational_only" }
              ]
            })
          ]
        })}
      />
    );

    expect(screen.getByText("Exact billing")).toBeInTheDocument();
    expect(screen.getByText("Provider estimate")).toBeInTheDocument();
    expect(screen.getByText("Operational only")).toBeInTheDocument();
    expect(screen.getByText(/6\.38/)).toBeInTheDocument();
    expect(screen.getAllByText(/USD/)).toHaveLength(1);
  });

  it("shows unavailable usage as unavailable, never as a synthetic zero", () => {
    render(
      <ProjectMonitoringDetail
        view={projectView({
          bindings: [
            bindingDetail({
              usage: [
                {
                  metric: "data_transfer",
                  unit: "gb",
                  period_start: "2026-09-01T00:00:00Z",
                  period_end: "2026-10-01T00:00:00Z",
                  provider_reported_at: OBSERVED,
                  billing_alignment: "operational_only",
                  availability: "not_available"
                }
              ]
            })
          ]
        })}
      />
    );

    const usageCell = screen.getByText("Not available", { selector: "[data-usage-availability]" });
    expect(usageCell).toBeInTheDocument();
    expect(usageCell.textContent).not.toMatch(/\d/);
  });

  it("renders collector authentication and permission failures with actionable reason text and no credential values", () => {
    render(
      <ProjectMonitoringDetail
        view={projectView({
          attention: "unknown",
          bindings: [
            bindingDetail({
              collector: { state: "authentication_failed", attempted_at: NOW },
              reasons: [
                {
                  code: "collector_authentication_failed",
                  dimension: "collector",
                  severity: "unknown",
                  summary: "Credential reference 'railway-primary' was rejected by the provider.",
                  observed_at: NOW
                }
              ]
            }),
            bindingDetail({
              binding_id: "neon-production-db",
              provider: "neon",
              resource_kind: "project",
              collector: { state: "permission_denied", attempted_at: NOW },
              reasons: [
                {
                  code: "collector_permission_denied",
                  dimension: "collector",
                  severity: "unknown",
                  summary: "The configured credential lacks the required read scope.",
                  observed_at: NOW
                }
              ]
            })
          ]
        })}
      />
    );

    expect(screen.getAllByText(/authentication failed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/permission denied/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/lacks the required read scope/)).toBeInTheDocument();
  });

  it("shows rate-limited collector state with its retry delay and unsupported capability as unavailable", () => {
    render(
      <ProjectMonitoringDetail
        view={projectView({
          bindings: [
            bindingDetail({
              collector: { state: "rate_limited", attempted_at: NOW, retry_after_seconds: 45 }
            }),
            bindingDetail({
              binding_id: "neon-production-db",
              provider: "neon",
              resource_kind: "project",
              collector: { state: "unsupported_capability", attempted_at: NOW }
            })
          ]
        })}
      />
    );

    expect(screen.getByText(/rate limited/i)).toBeInTheDocument();
    expect(screen.getByText(/45/)).toBeInTheDocument();
    expect(screen.getByText(/unsupported capability/i)).toBeInTheDocument();
  });

  it("shows reason evidence with code and summary for each binding", () => {
    render(
      <ProjectMonitoringDetail
        view={projectView({
          bindings: [
            bindingDetail({
              attention: "warning",
              reasons: [
                {
                  code: "usage_near_allowance",
                  dimension: "usage",
                  severity: "warning",
                  summary: "Transfer reached 92% of the current-period allowance.",
                  observed_at: OBSERVED
                }
              ]
            })
          ]
        })}
      />
    );

    expect(screen.getByText("usage_near_allowance")).toBeInTheDocument();
    expect(screen.getByText(/Transfer reached 92%/)).toBeInTheDocument();
  });

  it("keeps the binding's only reason visible when it is also the Project leading reason", async () => {
    // The normal critical case: the Project leading reason IS this binding's
    // reason. Expanding the binding must still show the code, summary,
    // dimension and evidence timestamp — filtering it as a duplicate of the
    // "Why attention" strip would erase all binding-level evidence (design §8:
    // all applicable reasons remain visible in Project and binding detail).
    const user = userEvent.setup();
    const reason = {
      code: "runtime_probe_failed",
      dimension: "runtime",
      severity: "critical",
      summary: "Required runtime probe failed twice.",
      observed_at: OBSERVED
    } as const;
    const { container } = render(
      <ProjectMonitoringDetail
        view={projectView({
          attention: "critical",
          leading_reason: reason,
          bindings: [bindingDetail({ attention: "critical", reasons: [reason] })]
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /signal matrix/i }));

    const panel = container.querySelector(".mon-binding-panel");
    expect(panel).not.toBeNull();
    expect(panel).not.toHaveAttribute("hidden");
    const reasonList = within(panel as HTMLElement).getByRole("list", { name: "Attention reasons" });
    expect(within(reasonList).getByText("runtime_probe_failed")).toBeInTheDocument();
    expect(within(reasonList).getByText(/Required runtime probe failed twice\./)).toBeInTheDocument();
    expect(within(reasonList).getByText(/runtime · observed/)).toBeInTheDocument();
    const evidenceTime = within(reasonList).getByText("05:59");
    expect(evidenceTime).toHaveAttribute("datetime", OBSERVED);
  });

  it("keeps identical reasons on two bindings visible in each binding's evidence", async () => {
    // Two bindings legitimately share the same reason code/summary/timestamp;
    // neither may lose its binding-level evidence to deduplication.
    const user = userEvent.setup();
    const reason = {
      code: "runtime_probe_failed",
      dimension: "runtime",
      severity: "critical",
      summary: "Required runtime probe failed twice.",
      observed_at: OBSERVED
    } as const;
    const { container } = render(
      <ProjectMonitoringDetail
        view={projectView({
          attention: "critical",
          leading_reason: reason,
          bindings: [
            bindingDetail({
              binding_id: "railway-production-api",
              attention: "critical",
              reasons: [reason]
            }),
            bindingDetail({
              binding_id: "railway-eu-worker",
              attention: "critical",
              reasons: [reason]
            })
          ]
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /railway-production-api/ }));
    await user.click(screen.getByRole("button", { name: /railway-eu-worker/ }));

    const panels = container.querySelectorAll(".mon-binding-panel:not([hidden])");
    expect(panels).toHaveLength(2);
    for (const panel of panels) {
      const reasonList = within(panel as HTMLElement).getByRole("list", { name: "Attention reasons" });
      expect(within(reasonList).getByText("runtime_probe_failed")).toBeInTheDocument();
      expect(within(reasonList).getByText(/Required runtime probe failed twice\./)).toBeInTheDocument();
      const evidenceTime = within(reasonList).getByText("05:59");
      expect(evidenceTime).toHaveAttribute("datetime", OBSERVED);
    }
  });

  it("renders recent normalized evidence with a bounded interpretation that never claims root cause", () => {
    // Events are derived from representative store output (diffTransitions),
    // not hand-shaped literals: a deployment reaching `succeeded` emits a
    // signal_state event whose `new` is the state token; deployment_identity
    // `new` is the `deployment_id/revision` identity token instead.
    const previous = monitoringSnapshot();
    const next = monitoringSnapshot({
      cycle_id: "cycle-2026-09-11-06",
      attempted_at: NOW,
      collector: { state: "success", attempted_at: NOW },
      deployment: {
        state: "succeeded",
        deployment_id: "dep-123",
        revision: "c41ea1",
        observed_at: "2026-09-11T05:46:00Z"
      },
      runtime: {
        state: "unhealthy",
        observed_at: "2026-09-11T05:55:00Z",
        source: "probe",
        consecutive_failures: 2,
        detail: "HTTP 503"
      },
      attention: "critical",
      reasons: [
        {
          code: "runtime_probe_failed",
          dimension: "runtime",
          severity: "critical",
          summary: "Required runtime probe failed twice.",
          observed_at: "2026-09-11T05:55:00Z"
        }
      ]
    });
    const events = diffTransitions(previous, next, "2026-09-11T05:55:10Z").map(toRecentEvent);
    render(<ProjectMonitoringDetail view={projectView({ recent_evidence: events })} />);

    expect(screen.getByRole("region", { name: "Recent evidence" })).toBeInTheDocument();
    expect(screen.getByText(/unhealthy/)).toBeInTheDocument();
    const interpretation = screen.getByText(/correlation/i);
    expect(interpretation.textContent).toMatch(/9 minutes after the active deployment/);
    expect(interpretation.textContent).toMatch(/does not claim root cause/i);
  });

  it("correlates a runtime failure with the latest preceding succeeded deployment on the same binding only", () => {
    const events: MonitoringRecentEvent[] = [
      // A later succeeded deployment must not be picked: it is not preceding.
      {
        type: "signal_state",
        binding_id: "railway-production-api",
        dimension: "deployment",
        key: "deployment",
        previous: "building",
        new: "succeeded",
        observed_at: "2026-09-11T06:05:00Z",
        recorded_at: "2026-09-11T06:05:10Z"
      },
      {
        type: "signal_state",
        binding_id: "railway-production-api",
        dimension: "runtime",
        key: "runtime",
        previous: "healthy",
        new: "unhealthy",
        observed_at: "2026-09-11T05:55:00Z",
        recorded_at: "2026-09-11T05:55:10Z"
      },
      // A different binding's succeeded deployment must not be picked.
      {
        type: "signal_state",
        binding_id: "railway-eu-worker",
        dimension: "deployment",
        key: "deployment",
        previous: "building",
        new: "succeeded",
        observed_at: "2026-09-11T05:50:00Z",
        recorded_at: "2026-09-11T05:50:10Z"
      },
      // The latest preceding succeeded deployment on the same binding wins.
      {
        type: "signal_state",
        binding_id: "railway-production-api",
        dimension: "deployment",
        key: "deployment",
        previous: "building",
        new: "succeeded",
        observed_at: "2026-09-11T05:40:00Z",
        recorded_at: "2026-09-11T05:40:10Z"
      }
    ];
    render(<ProjectMonitoringDetail view={projectView({ recent_evidence: events })} />);

    const interpretation = screen.getByText(/correlation/i);
    expect(interpretation.textContent).toMatch(/15 minutes after the active deployment/);
  });

  it("never treats a deployment_identity token as a succeeded state transition", () => {
    const events: MonitoringRecentEvent[] = [
      {
        type: "signal_state",
        binding_id: "railway-production-api",
        dimension: "runtime",
        key: "runtime",
        previous: "healthy",
        new: "unhealthy",
        observed_at: "2026-09-11T05:55:00Z",
        recorded_at: "2026-09-11T05:55:10Z"
      },
      {
        type: "deployment_identity",
        binding_id: "railway-production-api",
        dimension: "deployment",
        key: "deployment.identity",
        previous: "dep-122/a1b2c3",
        new: "dep-123/c41ea1",
        observed_at: "2026-09-11T05:46:00Z",
        recorded_at: "2026-09-11T05:46:10Z"
      }
    ];
    render(<ProjectMonitoringDetail view={projectView({ recent_evidence: events })} />);

    const interpretation = screen.getByText(/correlation/i);
    expect(interpretation.textContent).not.toMatch(/minutes after/);
  });

  it("distinguishes same-provider same-kind bindings by binding_id in the row, toggle and expanded heading", async () => {
    const user = userEvent.setup();
    render(
      <ProjectMonitoringDetail
        view={projectView({
          bindings: [
            bindingDetail({ binding_id: "railway-production-api" }),
            bindingDetail({ binding_id: "railway-eu-worker" })
          ]
        })}
      />
    );

    const table = screen.getByRole("table", { name: /provider bindings/i });
    expect(within(table).getByText(/railway-production-api/)).toBeInTheDocument();
    expect(within(table).getByText(/railway-eu-worker/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /railway-eu-worker/ }));
    expect(screen.getByRole("heading", { level: 3, name: /railway-eu-worker/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: /railway-production-api/ })).not.toBeInTheDocument();
  });

  it("keeps monitoring links, buttons and the refresh control at least 44px tall on coarse pointers", () => {
    // Coarse pointers are a media feature, not a viewport width: 768/1024px
    // touch devices never enter the ≤720px overrides, so the contract is a
    // dedicated @media (pointer: coarse) block in globals.css.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const marker = "@media (pointer: coarse)";
    const start = css.indexOf(marker);
    expect(start, "globals.css must define a @media (pointer: coarse) block").toBeGreaterThan(-1);
    let depth = 0;
    let end = css.length;
    for (let i = css.indexOf("{", start); i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const block = css.slice(start, end);
    expect(block).toContain(".mon-open");
    expect(block).toContain(".mon-refresh__button");
    expect(block).toContain(".mon-breadcrumb a");
    expect(block).toMatch(/min-height:\s*44px/);
  });

  it("renders awaiting_first_collection and cache_unavailable states without throwing", () => {
    const { unmount } = render(
      <ProjectMonitoringDetail
        view={projectView({
          status: "awaiting_first_collection",
          attention: null,
          collected_at: null,
          cycle_id: null,
          bindings: [
            bindingDetail({
              pending: true,
              attempted_at: null,
              collector: null,
              deployment: null,
              runtime: null,
              freshness: null,
              attention: null
            })
          ]
        })}
      />
    );
    expect(screen.getByText(/awaiting first collection/i)).toBeInTheDocument();
    unmount();

    render(
      <ProjectMonitoringDetail
        view={projectView({
          status: "cache_unavailable",
          project: null,
          bindings: [],
          issue: "snapshot_invalid"
        })}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/snapshot_invalid/);
  });

  it("never renders secret-shaped values or raw provider payloads", () => {
    const { container } = render(
      <ProjectMonitoringDetail
        view={projectView({
          bindings: [
            bindingDetail({
              reasons: [
                {
                  code: "collector_authentication_failed",
                  dimension: "collector",
                  severity: "unknown",
                  summary: "Credential reference 'railway-primary' was rejected.",
                  observed_at: NOW
                }
              ]
            })
          ]
        })}
      />
    );

    const html = container.innerHTML;
    expect(html).toContain("railway-primary");
    expect(html).not.toContain("shh-canary-token-value");
    expect(html).not.toMatch(/bearer\s+[a-z0-9]/i);
    expect(html).not.toContain("raw_response");
  });

  it("exposes accessible structure: named tables, heading hierarchy and status as text", () => {
    render(<ProjectMonitoringDetail view={projectView()} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("TalentVault");
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("table", { name: /provider bindings/i })).toBeInTheDocument();
    expect(screen.getAllByText("Healthy").length).toBeGreaterThan(0);
  });
});

describe("MonitoringRefreshControl", () => {
  function ack(partial: Partial<MonitoringRefreshAck>): ActionResult<MonitoringRefreshAck> {
    return {
      status: "success",
      data: { refresh: "queued", serving: null, ...partial },
      message: "ok"
    };
  }

  it("renders a control with an accessible name and a polite live region", () => {
    render(<MonitoringRefreshControl project="talentvault" />);

    expect(screen.getByRole("button", { name: /refresh monitoring/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("announces a queued refresh while continuing to serve the cached snapshot", async () => {
    const user = userEvent.setup();
    vi.mocked(requestMonitoringRefresh).mockResolvedValue(
      ack({ refresh: "queued", serving: { cycle_id: "cycle-1", collected_at: NOW } })
    );
    render(<MonitoringRefreshControl project="talentvault" />);

    await user.click(screen.getByRole("button", { name: /refresh monitoring/i }));

    expect(requestMonitoringRefresh).toHaveBeenCalledWith({ project: "talentvault", binding_id: undefined });
    expect(await screen.findByText(/refresh queued/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/cached projection/i);
  });

  it("announces when a collection is already running", async () => {
    const user = userEvent.setup();
    vi.mocked(requestMonitoringRefresh).mockResolvedValue(ack({ refresh: "collecting" }));
    render(<MonitoringRefreshControl project="talentvault" />);

    await user.click(screen.getByRole("button", { name: /refresh monitoring/i }));

    expect(await screen.findByText(/already running/i)).toBeInTheDocument();
  });

  it("announces backoff with the retry delay and never holds the UI", async () => {
    const user = userEvent.setup();
    vi.mocked(requestMonitoringRefresh).mockResolvedValue(
      ack({ refresh: "backing_off", retry_after_seconds: 45 })
    );
    render(<MonitoringRefreshControl project="talentvault" bindingId="railway-production-api" />);

    const button = screen.getByRole("button", { name: /refresh monitoring/i });
    await user.click(button);

    const status = screen.getByRole("status");
    await screen.findByText(/backing off/i);
    expect(status).toHaveTextContent(/45 seconds/);
    expect(button).not.toBeDisabled();
    expect(requestMonitoringRefresh).toHaveBeenCalledWith({
      project: "talentvault",
      binding_id: "railway-production-api"
    });
  });

  it("announces refresh errors without exposing internals", async () => {
    const user = userEvent.setup();
    vi.mocked(requestMonitoringRefresh).mockResolvedValue({
      status: "error",
      code: "MONITORING_DISABLED",
      message: "Monitoring is disabled on this Control Host"
    });
    render(<MonitoringRefreshControl project="talentvault" />);

    await user.click(screen.getByRole("button", { name: /refresh monitoring/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/monitoring is disabled/i);
  });
});
