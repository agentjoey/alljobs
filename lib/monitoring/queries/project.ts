import "server-only";

import * as fs from "node:fs";
import type {
  AttentionLevel,
  AttentionReason,
  CollectorSignal,
  DeploymentSignal,
  ExpectedRuntime,
  FreshnessSignal,
  MonitoringBinding,
  MonitoringProvider,
  MonitoringSnapshot,
  PlatformIncidentSignal,
  RequiredSignal,
  RuntimeSignal,
  UsageMeasure
} from "../domain/types";
import { transitionEventSchema, type TransitionEvent } from "../store/events";
import { eventsFile, PROJECT_SLUG_PATTERN } from "../store/paths";
import { readCurrentProjection, type StoreIssue } from "../store/store";
import { resolveMonitoringQueryContext, type MonitoringQueryContext } from "./landing";

export type { MonitoringQueryContext } from "./landing";

// Project-detail projection reader (design §10, §11.2; plan Task 7). Serves a
// single Project from the local validated projection plus a bounded window of
// normalized transition events. No provider calls, no bulk history: at most
// two monthly event files are read and at most MONITORING_RECENT_EVIDENCE_LIMIT
// entries are returned. Credential references and probe host references stay
// in server config and never enter the view model.

export const MONITORING_RECENT_EVIDENCE_LIMIT = 20;

export type MonitoringProjectStatus =
  | "ready"
  | "disabled"
  | "not_found"
  | "awaiting_first_collection"
  | "cache_unavailable";

export interface MonitoringBindingDetail {
  binding_id: string;
  provider: MonitoringProvider;
  resource_kind: string;
  expected_runtime: ExpectedRuntime;
  required_signals: RequiredSignal[];
  console_url: string;
  pending: boolean;
  attempted_at: string | null;
  collector: CollectorSignal | null;
  deployment: DeploymentSignal | null;
  runtime: RuntimeSignal | null;
  usage: UsageMeasure[];
  platform_incident: PlatformIncidentSignal | null;
  freshness: FreshnessSignal | null;
  attention: AttentionLevel | null;
  reasons: AttentionReason[];
}

export interface MonitoringRecentEvent {
  type: TransitionEvent["type"];
  binding_id: string;
  dimension: TransitionEvent["dimension"];
  key: string;
  previous: string | null;
  new: string;
  observed_at: string;
  recorded_at: string;
}

export interface MonitoringProjectView {
  status: MonitoringProjectStatus;
  project: { slug: string; name: string } | null;
  attention: AttentionLevel | null;
  leading_reason: AttentionReason | null;
  collected_at: string | null;
  cycle_id: string | null;
  bindings: MonitoringBindingDetail[];
  recent_evidence: MonitoringRecentEvent[];
  issue?: StoreIssue["code"];
}

const ATTENTION_RANK: Record<AttentionLevel, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  watch: 3,
  healthy: 4
};

function baseView(status: MonitoringProjectStatus): MonitoringProjectView {
  return {
    status,
    project: null,
    attention: null,
    leading_reason: null,
    collected_at: null,
    cycle_id: null,
    bindings: [],
    recent_evidence: []
  };
}

function pendingBinding(binding: MonitoringBinding): MonitoringBindingDetail {
  return {
    binding_id: binding.id,
    provider: binding.provider,
    resource_kind: binding.resource_kind,
    expected_runtime: binding.expected_runtime,
    required_signals: binding.required_signals,
    console_url: binding.console_url,
    pending: true,
    attempted_at: null,
    collector: null,
    deployment: null,
    runtime: null,
    usage: [],
    platform_incident: null,
    freshness: null,
    attention: null,
    reasons: []
  };
}

function bindingDetail(binding: MonitoringBinding, snapshot: MonitoringSnapshot | undefined): MonitoringBindingDetail {
  if (!snapshot) return pendingBinding(binding);
  return {
    binding_id: binding.id,
    provider: binding.provider,
    resource_kind: binding.resource_kind,
    expected_runtime: binding.expected_runtime,
    required_signals: binding.required_signals,
    console_url: binding.console_url,
    pending: false,
    attempted_at: snapshot.attempted_at,
    collector: snapshot.collector,
    deployment: snapshot.deployment,
    runtime: snapshot.runtime,
    usage: snapshot.usage,
    platform_incident: snapshot.platform_incident,
    freshness: snapshot.freshness,
    attention: snapshot.attention,
    reasons: snapshot.reasons
  };
}

function monthName(isoTimestamp: string): string {
  return new Date(Date.parse(isoTimestamp)).toISOString().slice(0, 7);
}

function previousMonthName(month: string): string {
  const date = new Date(Date.parse(`${month}-01T00:00:00Z`));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

/**
 * Reads the newest transition events for one Project, bounded to the current
 * and previous UTC month files and MONITORING_RECENT_EVIDENCE_LIMIT entries.
 * Malformed lines are skipped; they can never fail the query.
 */
function readRecentEvents(root: string, slug: string, nowIso: string): MonitoringRecentEvent[] {
  const current = monthName(nowIso);
  const events: TransitionEvent[] = [];
  for (const month of [current, previousMonthName(current)]) {
    if (events.length >= MONITORING_RECENT_EVIDENCE_LIMIT) break;
    const file = eventsFile(root, month);
    if (!fs.existsSync(file)) continue;
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      if (!line) continue;
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        continue;
      }
      const parsed = transitionEventSchema.safeParse(json);
      if (!parsed.success || parsed.data.project !== slug) continue;
      events.push(parsed.data);
    }
  }
  events.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  return events.slice(0, MONITORING_RECENT_EVIDENCE_LIMIT).map((event) => ({
    type: event.type,
    binding_id: event.binding_id,
    dimension: event.dimension,
    key: event.key,
    previous: event.previous,
    new: event.new,
    observed_at: event.observed_at,
    recorded_at: event.recorded_at
  }));
}

/**
 * Reads the single-Project projection. Only snapshots and events whose
 * identity matches the requested slug are returned — one Project's data can
 * never appear in another Project's view.
 */
export async function getMonitoringProject(
  slug: string,
  context?: MonitoringQueryContext
): Promise<MonitoringProjectView> {
  const ctx = context ?? (await resolveMonitoringQueryContext());
  if (!ctx.enabled) return baseView("disabled");
  if (!PROJECT_SLUG_PATTERN.test(slug)) return baseView("not_found");

  const registryEntry = ctx.projects.find((project) => project.slug === slug && !project.archived);
  const bindings = registryEntry?.monitoring?.bindings ?? [];
  if (!registryEntry || bindings.length === 0) return baseView("not_found");
  const projectInfo = { slug: registryEntry.slug, name: registryEntry.name };

  const projection = readCurrentProjection(ctx.root);
  if (!projection.ok) {
    if (projection.issue.code === "index_missing") {
      return {
        ...baseView("awaiting_first_collection"),
        project: projectInfo,
        bindings: bindings.map(pendingBinding)
      };
    }
    return { ...baseView("cache_unavailable"), issue: projection.issue.code };
  }

  const { index, snapshots } = projection.value;
  const snapshotsByBinding = new Map<string, MonitoringSnapshot>();
  for (const snapshot of snapshots) {
    if (snapshot.project !== slug) continue;
    snapshotsByBinding.set(snapshot.binding_id, snapshot);
  }

  if (snapshotsByBinding.size === 0) {
    return {
      ...baseView("awaiting_first_collection"),
      project: projectInfo,
      bindings: bindings.map(pendingBinding)
    };
  }

  const worst = [...snapshotsByBinding.values()].reduce((current, snapshot) =>
    ATTENTION_RANK[snapshot.attention] < ATTENTION_RANK[current.attention] ? snapshot : current
  );

  return {
    status: "ready",
    project: projectInfo,
    attention: worst.attention,
    leading_reason: worst.reasons[0] ?? null,
    collected_at: index.collected_at,
    cycle_id: index.cycle_id,
    bindings: bindings.map((binding) => bindingDetail(binding, snapshotsByBinding.get(binding.id))),
    recent_evidence: readRecentEvents(ctx.root, slug, ctx.now())
  };
}
