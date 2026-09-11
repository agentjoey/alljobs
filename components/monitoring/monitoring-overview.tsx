import Link from "next/link";
import type { AttentionLevel, MonitoringProvider } from "@/lib/monitoring/domain/types";
import type {
  MonitoringFreshnessState,
  MonitoringLandingView,
  MonitoringLedgerRow,
  MonitoringQueueItem
} from "@/lib/monitoring/queries/landing";

// R5 Application Monitoring — landing workspace (design §11.1, plan Task 8).
// Server component: renders only the validated cached projection; it never
// calls a provider. Status is always text-first — color is only a secondary
// accent on an explicit label, so the state matrix reads without color.

export const MONITORING_PROVIDER_LABELS: Record<MonitoringProvider, string> = {
  railway: "Railway",
  fly: "Fly.io",
  neon: "Neon",
  supabase: "Supabase",
  vercel: "Vercel",
  cloudflare: "Cloudflare",
  github: "GitHub"
};

const ATTENTION_LABELS: Record<AttentionLevel, string> = {
  critical: "Critical",
  warning: "Warning",
  unknown: "Unknown",
  watch: "Watch",
  healthy: "Healthy"
};

const FRESHNESS_LABELS: Record<MonitoringFreshnessState, string> = {
  current: "Current",
  delayed: "Delayed",
  expired: "Expired",
  never_collected: "Never collected"
};

export function attentionLabel(level: AttentionLevel): string {
  return ATTENTION_LABELS[level];
}

export function freshnessLabel(state: MonitoringFreshnessState): string {
  return FRESHNESS_LABELS[state];
}

export function AttentionStatus({ level }: { level: AttentionLevel }) {
  return <span className={`mon-status mon-status--${level}`}>{ATTENTION_LABELS[level]}</span>;
}

/** Compact UTC rendering: "2026-09-11 05:59 UTC". Falls back to the raw value. */
export function formatTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Clock-only UTC rendering: "05:59". */
export function formatClock(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toISOString().slice(11, 16);
}

function bindingSummary(providers: readonly MonitoringProvider[]): string {
  const counts = new Map<MonitoringProvider, number>();
  for (const provider of providers) counts.set(provider, (counts.get(provider) ?? 0) + 1);
  return [...counts].map(([provider, count]) => `${MONITORING_PROVIDER_LABELS[provider]} ${count}`).join(" · ");
}

function ProvenanceStrip({ view }: { view: MonitoringLandingView }) {
  return (
    <div className="mon-provenance" aria-label="Cached projection provenance">
      <span>/monitoring · cached projection</span>
      <span>
        {view.collected_at ? (
          <>
            collected <time dateTime={view.collected_at}>{formatTimestamp(view.collected_at)}</time>
          </>
        ) : (
          "no collection yet"
        )}
        {view.cycle_id ? <> · cycle {view.cycle_id}</> : null}
        {view.cycle_status ? (
          <> · {view.cycle_status === "complete" ? "Complete" : "Partially complete"}</>
        ) : null}
      </span>
    </div>
  );
}

function Summary({ view }: { view: MonitoringLandingView }) {
  const { summary } = view;
  return (
    <div className="mon-summary" role="group" aria-label="Monitoring summary">
      <div className="metric-card">
        <div className="metric-label">Projects</div>
        <div className="metric-value">{summary.projects}</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">Bindings</div>
        <div className="metric-value">{summary.bindings}</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">Needs attention</div>
        <div className={`metric-value${summary.needs_attention > 0 ? " mon-summary__alert" : ""}`}>
          {summary.needs_attention}
        </div>
      </div>
      <div className="metric-card">
        <div className="metric-label">Freshness</div>
        <div className="metric-value">
          {summary.freshness ? freshnessLabel(summary.freshness) : "—"}
        </div>
      </div>
    </div>
  );
}

function AttentionQueue({ queue }: { queue: MonitoringQueueItem[] }) {
  return (
    <section aria-labelledby="mon-attention-title">
      <div className="mon-section-head">
        <h2 id="mon-attention-title">Needs attention</h2>
        <span className="mon-section-note">Only actionable or unavailable signals</span>
      </div>
      {queue.length === 0 ? (
        <p className="mon-empty">Nothing needs attention — every collected binding is healthy.</p>
      ) : (
        <ul className="mon-attention">
          {queue.map((item) => (
            <li key={`${item.project}/${item.binding_id}`} className="mon-attention__row">
              <AttentionStatus level={item.attention} />
              <strong>{item.project_name}</strong>
              <span>
                {MONITORING_PROVIDER_LABELS[item.provider]} · {item.binding_id}
              </span>
              <span>
                {item.reason?.summary ?? "This signal cannot be evaluated right now"} · observed{" "}
                <time dateTime={item.observed_at}>{formatClock(item.observed_at)}</time>
              </span>
              <Link className="mon-open" href={`/monitoring/${item.project}`}>
                Open ›
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectLedger({ ledger }: { ledger: MonitoringLedgerRow[] }) {
  return (
    <section aria-labelledby="mon-ledger-title">
      <div className="mon-section-head">
        <h2 id="mon-ledger-title">All projects</h2>
        <span className="mon-section-note">
          {ledger.length} projects · sorted by attention, then name
        </span>
      </div>
      {ledger.length === 0 ? (
        <p className="mon-empty">
          No monitored projects yet — declare bindings in the Project registry to begin.
        </p>
      ) : (
        <div className="mon-table-wrap">
          <table className="ledger-table" aria-label="All monitored projects">
            <thead>
              <tr>
                <th>Project</th>
                <th>State</th>
                <th>Provider bindings</th>
                <th>Leading reason</th>
                <th>Freshness</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.project}>
                  <td data-label="Project">
                    <strong>{row.name}</strong>
                  </td>
                  <td data-label="State">
                    {row.attention ? (
                      <AttentionStatus level={row.attention} />
                    ) : (
                      <span className="mon-status mon-status--pending">Not yet collected</span>
                    )}
                  </td>
                  <td data-label="Provider bindings">{bindingSummary(row.providers) || "—"}</td>
                  <td data-label="Leading reason">
                    {row.leading_reason?.summary ??
                      (row.attention === "healthy" ? "No active reasons" : "—")}
                  </td>
                  <td data-label="Freshness">
                    {row.freshness ? freshnessLabel(row.freshness) : "—"}
                  </td>
                  <td data-label="Action">
                    <Link className="mon-open" href={`/monitoring/${row.project}`}>
                      Open ›
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MonitoringHeader() {
  return (
    <header className="view-header">
      <div>
        <span className="mon-kicker">Project operations</span>
        <h1 className="view-title">Application monitoring</h1>
        <p className="view-subtitle">
          先处理跨项目异常，再按项目核对服务状态、用量与数据新鲜度。
        </p>
      </div>
    </header>
  );
}

export function MonitoringOverview({ view }: { view: MonitoringLandingView }) {
  if (view.status === "disabled") {
    return (
      <div className="mon-view">
        <MonitoringHeader />
        <p className="mon-notice">
          Monitoring is disabled on this Control Host. Enable it in the Control Host configuration
          to start bounded, read-only collection.
        </p>
      </div>
    );
  }

  if (view.status === "cache_unavailable") {
    return (
      <div className="mon-view">
        <MonitoringHeader />
        <p role="alert" className="mon-notice mon-notice--error">
          Cached monitoring projection is unavailable ({view.issue ?? "unknown issue"}). The last
          good snapshot is not shown because it cannot be trusted; the next successful collection
          cycle replaces it.
        </p>
      </div>
    );
  }

  return (
    <div className="mon-view">
      <ProvenanceStrip view={view} />
      <MonitoringHeader />
      {view.status === "awaiting_first_collection" && (
        <p className="mon-notice">
          Awaiting first collection — the registered Projects below cannot report healthy until the
          first bounded collection cycle completes.
        </p>
      )}
      <Summary view={view} />
      <AttentionQueue queue={view.queue} />
      <ProjectLedger ledger={view.ledger} />
    </div>
  );
}
