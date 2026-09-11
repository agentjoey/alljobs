import { lookup as dnsLookup } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { createMonitoringAdapterRegistry, type MonitoringAdapterRegistry } from "../lib/monitoring/adapters";
import type { DnsLookup, FetchLike } from "../lib/monitoring/adapters/contracts";
import { ProviderBackoff } from "../lib/monitoring/collector/backoff";
import { MonitoringCollector, type BindingCycleStatus } from "../lib/monitoring/collector/collect";
import { loadControlHostConfig, type ControlHostResolvedPaths } from "../lib/planning/config";
import type { ProjectRegistryEntry } from "../lib/planning/domain/types";
import { NativePlanningStore } from "../lib/planning/native/store";

// One-shot monitoring refresh worker (design §5.1, §14; plan Task 7). Runs a
// single bounded collection cycle over the registered Project bindings through
// the fixed production adapter registry and publishes the atomic projection.
// Disabled by default; every external seam (fetch, DNS, clock, environment) is
// injectable so tests never touch the network or real credentials.

export interface MonitoringRefreshOptions {
  paths: ControlHostResolvedPaths;
  /** Registry reader; defaults to the native Planning store. */
  listProjects?: () => Promise<ProjectRegistryEntry[]>;
  /** Adapter override; defaults to the fixed production registry. Tests inject the fixture registry. */
  adapters?: MonitoringAdapterRegistry;
  /** Backoff override; defaults to the process-wide tracker shared across cycles. */
  backoff?: ProviderBackoff;
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
  lookup?: DnsLookup;
  now?: () => string;
  log?: (line: string) => void;
}

export interface MonitoringRefreshSummary {
  status: "disabled" | "no_targets" | "complete" | "partially_complete";
  cycle_id: string | null;
  outcomes: { project: string; binding_id: string; status: BindingCycleStatus }[];
}

const serverFetch: FetchLike = (url, init) => fetch(url, init);
const serverLookup: DnsLookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

// Process-wide backoff tracker: the planning-refresh loop calls this worker
// every tick, and provider backoff ladders plus per-binding minimum intervals
// must hold across those cycles. Constructing a fresh tracker per call would
// silently reset the ladder on every tick, so the default lives here for the
// lifetime of the process; tests inject their own via options.backoff.
let sharedBackoff: ProviderBackoff | null = null;
function sharedMonitoringBackoff(minIntervalSeconds: number): ProviderBackoff {
  if (!sharedBackoff) {
    sharedBackoff = new ProviderBackoff({ policy: { minIntervalSeconds } });
  }
  return sharedBackoff;
}

/** Runs exactly one collection cycle; safe to call when monitoring is off. */
export async function runMonitoringRefreshOnce(
  options: MonitoringRefreshOptions
): Promise<MonitoringRefreshSummary> {
  const log = options.log ?? ((line: string) => console.log(line));
  const monitoring = options.paths.config.monitoring;
  if (!monitoring || monitoring.enabled !== true) {
    log("[monitoring-refresh] Monitoring is disabled; skipping");
    return { status: "disabled", cycle_id: null, outcomes: [] };
  }
  const root = options.paths.monitoringStateDir;
  if (!root) {
    throw new Error("monitoringStateDir is not resolved in the Control Host paths");
  }

  const listProjects = options.listProjects ?? (() => new NativePlanningStore().listProjects());
  const projects = await listProjects();
  const targets = projects
    .filter((project) => !project.archived)
    .flatMap((project) =>
      (project.monitoring?.bindings ?? []).map((binding) => ({ project: project.slug, binding }))
    );
  if (targets.length === 0) {
    log("[monitoring-refresh] No monitoring bindings registered; skipping");
    return { status: "no_targets", cycle_id: null, outcomes: [] };
  }

  const collector = new MonitoringCollector({
    root,
    targets,
    adapters: options.adapters ?? createMonitoringAdapterRegistry(),
    monitoring: {
      concurrency: monitoring.concurrency,
      refreshIntervalSeconds: monitoring.refreshIntervalSeconds,
      credentials: monitoring.credentials,
      probeAllowedHosts: monitoring.probeAllowedHosts
    },
    env: options.env ?? process.env,
    fetch: options.fetch ?? serverFetch,
    lookup: options.lookup ?? serverLookup,
    now: options.now ?? (() => new Date().toISOString()),
    backoff: options.backoff ?? sharedMonitoringBackoff(monitoring.refreshIntervalSeconds)
  });

  const result = await collector.collect();
  if (!("outcomes" in result)) {
    throw new Error("a monitoring collection is already in flight in this process");
  }
  for (const outcome of result.outcomes) {
    log(`  - ${outcome.project}/${outcome.binding_id}: ${outcome.status} (${outcome.collector.state})`);
  }
  return {
    status: result.status,
    cycle_id: result.cycle_id,
    outcomes: result.outcomes.map((outcome) => ({
      project: outcome.project,
      binding_id: outcome.binding_id,
      status: outcome.status
    }))
  };
}

async function main() {
  // `--once` is the supported invocation; the script is one-shot by design and
  // scheduled repetition belongs to the planning-refresh loop or launchd.
  const args = process.argv.slice(2);
  if (!args.includes("--once")) {
    console.log("[monitoring-refresh] Running a single cycle (pass --once to silence this note)");
  }

  let paths: ControlHostResolvedPaths;
  try {
    paths = loadControlHostConfig();
  } catch (err: any) {
    console.error(`[monitoring-refresh] Configuration error: ${err.message}`);
    process.exit(1);
  }

  const summary = await runMonitoringRefreshOnce({ paths });
  console.log(
    `[monitoring-refresh] Cycle ${summary.cycle_id ?? "n/a"}: ${summary.status} (${summary.outcomes.length} bindings)`
  );
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main().catch((err) => {
    console.error(`[monitoring-refresh] Fatal: ${err.message}`);
    process.exit(1);
  });
}
