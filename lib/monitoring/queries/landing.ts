import "server-only";

import { loadControlHostConfig } from "../../planning/config";
import type { ProjectRegistryEntry } from "../../planning/domain/types";
import { NativePlanningStore } from "../../planning/native/store";
import type {
  AttentionLevel,
  AttentionReason,
  MonitoringBinding,
  MonitoringProvider,
  MonitoringSnapshot,
  SignalFreshness
} from "../domain/types";
import { readCurrentProjection, type StoreIssue } from "../store/store";

// Landing projection reader (design §10.1, §11.1; plan Task 7). Server-only and
// local-only: it reads the atomically published index first and then the exact
// referenced snapshots, performing zero provider calls. Nothing here is cached
// by Next — the monitoring routes render with force-dynamic, so every request
// re-reads the current pointer (no-store semantics).

export interface MonitoringQueryContext {
  /** Resolved <ALLJOBS_HOME>/state/monitoring root. */
  root: string;
  enabled: boolean;
  /** Project registry entries; supplies names and binding configuration. */
  projects: readonly ProjectRegistryEntry[];
  now: () => string;
}

export type MonitoringViewStatus =
  | "ready"
  | "disabled"
  | "awaiting_first_collection"
  | "cache_unavailable";

export type MonitoringFreshnessState = SignalFreshness["state"];

export interface MonitoringQueueItem {
  project: string;
  project_name: string;
  binding_id: string;
  provider: MonitoringProvider;
  attention: Exclude<AttentionLevel, "healthy">;
  reason: AttentionReason | null;
  observed_at: string;
}

export interface MonitoringLedgerRow {
  project: string;
  name: string;
  /** null when the Project is registered for monitoring but never collected. */
  attention: AttentionLevel | null;
  leading_reason: AttentionReason | null;
  freshness: MonitoringFreshnessState | null;
  binding_count: number;
  providers: MonitoringProvider[];
}

export interface MonitoringLandingView {
  status: MonitoringViewStatus;
  collected_at: string | null;
  cycle_id: string | null;
  cycle_status: "complete" | "partially_complete" | null;
  summary: {
    projects: number;
    bindings: number;
    needs_attention: number;
    freshness: MonitoringFreshnessState | null;
  };
  queue: MonitoringQueueItem[];
  ledger: MonitoringLedgerRow[];
  issue?: StoreIssue["code"];
}

// Mirrors the attention precedence rank (design §8); duplicated so the query
// layer never imports evaluation logic.
const ATTENTION_RANK: Record<AttentionLevel, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  watch: 3,
  healthy: 4
};

const FRESHNESS_RANK: Record<MonitoringFreshnessState, number> = {
  expired: 0,
  never_collected: 1,
  delayed: 2,
  current: 3
};

function worstFreshness(snapshots: readonly MonitoringSnapshot[]): MonitoringFreshnessState | null {
  let worst: MonitoringFreshnessState | null = null;
  for (const snapshot of snapshots) {
    for (const signal of snapshot.freshness.signals) {
      if (worst === null || FRESHNESS_RANK[signal.state] < FRESHNESS_RANK[worst]) {
        worst = signal.state;
      }
    }
  }
  return worst;
}

function baseView(status: MonitoringViewStatus): MonitoringLandingView {
  return {
    status,
    collected_at: null,
    cycle_id: null,
    cycle_status: null,
    summary: { projects: 0, bindings: 0, needs_attention: 0, freshness: null },
    queue: [],
    ledger: []
  };
}

function monitoredProjects(projects: readonly ProjectRegistryEntry[]) {
  return projects.filter(
    (project) => !project.archived && (project.monitoring?.bindings.length ?? 0) > 0
  ) as Array<ProjectRegistryEntry & { monitoring: { bindings: MonitoringBinding[] } }>;
}

function pendingReason(nowIso: string): AttentionReason {
  return {
    code: "first_collection_pending",
    dimension: "collector",
    severity: "unknown",
    summary: "This Project is registered for monitoring but has not been collected yet.",
    observed_at: nowIso
  };
}

function pendingRow(
  project: ProjectRegistryEntry & { monitoring: { bindings: MonitoringBinding[] } }
): MonitoringLedgerRow {
  return {
    project: project.slug,
    name: project.name,
    attention: null,
    leading_reason: null,
    freshness: null,
    binding_count: project.monitoring.bindings.length,
    providers: [...new Set(project.monitoring.bindings.map((binding) => binding.provider))]
  };
}

function pendingQueueItem(
  project: ProjectRegistryEntry & { monitoring: { bindings: MonitoringBinding[] } },
  nowIso: string
): MonitoringQueueItem {
  const first = project.monitoring.bindings[0];
  return {
    project: project.slug,
    project_name: project.name,
    binding_id: first.id,
    provider: first.provider,
    attention: "unknown",
    reason: pendingReason(nowIso),
    observed_at: nowIso
  };
}

/** Default server context: Control Host config plus the native registry. */
export async function resolveMonitoringQueryContext(): Promise<MonitoringQueryContext> {
  const paths = loadControlHostConfig();
  const store = new NativePlanningStore();
  return {
    root: paths.monitoringStateDir!,
    enabled: paths.config.monitoring?.enabled === true,
    projects: await store.listProjects(),
    now: () => new Date().toISOString()
  };
}

/**
 * Reads the landing projection. The attention queue and the complete Project
 * ledger derive from the same snapshot set of a single index-first read, so
 * the queue can never disagree with the ledger.
 */
export async function getMonitoringLanding(
  context?: MonitoringQueryContext
): Promise<MonitoringLandingView> {
  const ctx = context ?? (await resolveMonitoringQueryContext());
  if (!ctx.enabled) return baseView("disabled");

  const monitored = monitoredProjects(ctx.projects);
  const projection = readCurrentProjection(ctx.root);

  if (!projection.ok) {
    if (projection.issue.code === "index_missing") {
      if (monitored.length === 0) return baseView("ready");
      const view = baseView("awaiting_first_collection");
      view.ledger = monitored.map(pendingRow).sort(compareLedgerRows);
      view.queue = monitored.map((project) => pendingQueueItem(project, ctx.now())).sort(compareQueueItems);
      view.summary = summarize(view.ledger, view.queue);
      return view;
    }
    // Corrupt current cache: degrade safely instead of throwing; the next
    // successful cycle replaces the pointer and the view recovers.
    return { ...baseView("cache_unavailable"), issue: projection.issue.code };
  }

  const { index, snapshots } = projection.value;
  const nameByProject = new Map(monitored.map((project) => [project.slug, project.name]));
  const snapshotsByProject = new Map<string, MonitoringSnapshot[]>();
  for (const snapshot of snapshots) {
    const list = snapshotsByProject.get(snapshot.project) ?? [];
    list.push(snapshot);
    snapshotsByProject.set(snapshot.project, list);
  }

  const ledger: MonitoringLedgerRow[] = [];
  const queue: MonitoringQueueItem[] = [];

  for (const indexProject of index.projects) {
    const projectSnapshots = snapshotsByProject.get(indexProject.project) ?? [];
    const worst = projectSnapshots.reduce<MonitoringSnapshot | null>(
      (current, snapshot) =>
        current === null || ATTENTION_RANK[snapshot.attention] < ATTENTION_RANK[current.attention] ? snapshot : current,
      null
    );
    ledger.push({
      project: indexProject.project,
      name: nameByProject.get(indexProject.project) ?? indexProject.project,
      attention: worst?.attention ?? indexProject.attention,
      leading_reason: worst?.reasons[0] ?? null,
      freshness: worstFreshness(projectSnapshots),
      binding_count: indexProject.bindings.length,
      providers: indexProject.bindings.map((binding) => binding.provider)
    });
    for (const snapshot of projectSnapshots) {
      if (snapshot.attention === "healthy") continue;
      queue.push({
        project: snapshot.project,
        project_name: nameByProject.get(snapshot.project) ?? snapshot.project,
        binding_id: snapshot.binding_id,
        provider: snapshot.provider,
        attention: snapshot.attention,
        reason: snapshot.reasons[0] ?? null,
        observed_at: snapshot.attempted_at
      });
    }
  }

  // Registered but not yet collected Projects appear as pending rows; they
  // are not judgable, so they enter the queue as unknown — never healthy.
  for (const project of monitored) {
    if (snapshotsByProject.has(project.slug)) continue;
    ledger.push(pendingRow(project));
    queue.push(pendingQueueItem(project, ctx.now()));
  }

  ledger.sort(compareLedgerRows);
  queue.sort(compareQueueItems);

  return {
    status: "ready",
    collected_at: index.collected_at,
    cycle_id: index.cycle_id,
    cycle_status: index.status,
    summary: summarize(ledger, queue),
    queue,
    ledger
  };
}

function ledgerRank(row: MonitoringLedgerRow): number {
  return row.attention === null ? ATTENTION_RANK.unknown : ATTENTION_RANK[row.attention];
}

function compareLedgerRows(a: MonitoringLedgerRow, b: MonitoringLedgerRow): number {
  return (
    ledgerRank(a) - ledgerRank(b) ||
    a.name.localeCompare(b.name) ||
    a.project.localeCompare(b.project)
  );
}

function compareQueueItems(a: MonitoringQueueItem, b: MonitoringQueueItem): number {
  return (
    ATTENTION_RANK[a.attention] - ATTENTION_RANK[b.attention] ||
    a.project_name.localeCompare(b.project_name) ||
    a.binding_id.localeCompare(b.binding_id)
  );
}

function summarize(
  ledger: readonly MonitoringLedgerRow[],
  queue: readonly MonitoringQueueItem[]
): MonitoringLandingView["summary"] {
  let freshness: MonitoringFreshnessState | null = null;
  let bindings = 0;
  for (const row of ledger) {
    bindings += row.binding_count;
    if (row.freshness !== null && (freshness === null || FRESHNESS_RANK[row.freshness] < FRESHNESS_RANK[freshness])) {
      freshness = row.freshness;
    }
  }
  return { projects: ledger.length, bindings, needs_attention: queue.length, freshness };
}
