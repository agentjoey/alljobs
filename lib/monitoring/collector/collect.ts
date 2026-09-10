import { evaluateAttention, deriveFreshnessSignal } from "../domain/attention";
import { monitoringSnapshotSchema, type MonitoringProvider } from "../domain/schemas";
import type {
  CollectorSignal,
  MonitoringBinding,
  MonitoringSnapshot,
  RequiredSignal,
  RuntimeSignal,
  SignalFreshness
} from "../domain/types";
import { publishCycle, readCurrentProjection, type MonitoringIndex } from "../store/store";
import { isAdapterError, type DnsLookup, type FetchLike, type MonitoringAdapter } from "../adapters/contracts";
import { ProviderBackoff } from "./backoff";
import { CredentialError, resolveMonitoringCredential } from "./credentials";
import { executeProbe, ProbeRejectedError } from "./probe";

// Collection orchestration (design §5.1, §9): one non-overlapping cycle,
// bounded concurrency, per-provider backoff with Retry-After, per-binding
// minimum interval, per-binding failure isolation, probe-derived runtime
// evidence, and partial-cycle publication with last-trustworthy carry-forward.
// Everything external — clock, randomness, DNS, fetch, environment — is
// injected; this module never touches process.env or the network directly.

/** Fallback max trustworthy age when an adapter does not declare one. */
const DEFAULT_MAX_AGE_SECONDS = 3600;

export interface CollectorTarget {
  project: string;
  binding: MonitoringBinding;
}

export interface CollectionMonitoringConfig {
  concurrency: number;
  refreshIntervalSeconds: number;
  credentials: Record<string, { provider: MonitoringProvider; tokenEnv: string }>;
  probeAllowedHosts: Record<string, string>;
}

export interface CollectionDeps {
  /** Resolved <ALLJOBS_HOME>/state/monitoring root. */
  root: string;
  targets: readonly CollectorTarget[];
  adapters: Readonly<Partial<Record<MonitoringProvider, MonitoringAdapter>>>;
  monitoring: CollectionMonitoringConfig;
  env: Record<string, string | undefined>;
  fetch: FetchLike;
  lookup: DnsLookup;
  /** Injected clock (ISO timestamp). */
  now: () => string;
  random?: () => number;
  /** Inject to persist backoff across cycles; otherwise one is created. */
  backoff?: ProviderBackoff;
}

export type BindingCycleStatus =
  | "collected"
  | "failed"
  | "skipped_backoff"
  | "skipped_min_interval"
  | "unsupported";

export interface BindingCycleOutcome {
  project: string;
  binding_id: string;
  status: BindingCycleStatus;
  collector: CollectorSignal;
  snapshot: MonitoringSnapshot;
}

export interface CollectionCycleResult {
  cycle_id: string;
  status: "complete" | "partially_complete";
  outcomes: BindingCycleOutcome[];
  index: MonitoringIndex;
}

function cycleIdFrom(nowIso: string): string {
  return nowIso.toLowerCase().replace(/:/g, "-").replace(/\.\d+/, "");
}

function previousConsecutiveProbeFailures(previous: MonitoringSnapshot | undefined): number {
  const runtime = previous?.runtime;
  if (runtime && runtime.source === "probe" && runtime.state === "unhealthy") {
    return runtime.consecutive_failures ?? 1;
  }
  return 0;
}

interface SignalSet {
  deployment: MonitoringSnapshot["deployment"];
  runtime: MonitoringSnapshot["runtime"];
  usage: MonitoringSnapshot["usage"];
  platform_incident: MonitoringSnapshot["platform_incident"];
}

function buildEvaluatedSnapshot(
  base: {
    cycle_id: string;
    project: string;
    binding: MonitoringBinding;
    adapter: MonitoringSnapshot["adapter"];
    attempted_at: string;
    collector: CollectorSignal;
    signals: SignalSet;
    adapterCapabilities: readonly RequiredSignal[];
    signalMaxAgeSeconds: Readonly<Partial<Record<RequiredSignal, number>>>;
  },
  nowIso: string
): MonitoringSnapshot {
  const { binding, signals } = base;
  const maxAge = (signal: RequiredSignal) => base.signalMaxAgeSeconds[signal] ?? DEFAULT_MAX_AGE_SECONDS;

  const freshnessEntries: Array<{ signal: SignalFreshness["signal"]; observed_at: string | null; max_age_seconds: number }> = [
    { signal: "deployment", observed_at: signals.deployment?.observed_at ?? null, max_age_seconds: maxAge("deployment") },
    { signal: "runtime", observed_at: signals.runtime?.observed_at ?? null, max_age_seconds: maxAge("runtime") },
    {
      signal: "usage",
      observed_at:
        signals.usage.length > 0
          ? signals.usage
              .map((measure) => measure.provider_reported_at)
              .sort()
              .at(-1)!
          : null,
      max_age_seconds: maxAge("usage")
    },
    {
      signal: "platform_incident",
      observed_at: signals.platform_incident?.provider_reported_at ?? null,
      max_age_seconds: maxAge("platform_incident")
    }
  ];
  const freshness = deriveFreshnessSignal(freshnessEntries, nowIso, base.collector);

  const evaluation = evaluateAttention({
    binding,
    collector: base.collector,
    deployment: signals.deployment,
    runtime: signals.runtime,
    usage: [...signals.usage],
    platform_incident: signals.platform_incident,
    freshness,
    adapter_capabilities: base.adapterCapabilities,
    now: nowIso
  });

  return monitoringSnapshotSchema.parse({
    schema_version: 1,
    cycle_id: base.cycle_id,
    project: base.project,
    binding_id: binding.id,
    provider: binding.provider,
    adapter: base.adapter,
    attempted_at: base.attempted_at,
    collector: base.collector,
    deployment: signals.deployment,
    runtime: signals.runtime,
    usage: signals.usage,
    platform_incident: signals.platform_incident,
    freshness,
    attention: evaluation.attention,
    reasons: evaluation.reasons
  });
}

/** Carries the previous snapshot's trustworthy signals into a new cycle. */
function carryForward(
  previous: MonitoringSnapshot | undefined,
  base: {
    cycle_id: string;
    project: string;
    binding: MonitoringBinding;
    adapter: MonitoringSnapshot["adapter"];
    attempted_at: string;
    collector: CollectorSignal;
    adapterCapabilities: readonly RequiredSignal[];
    signalMaxAgeSeconds: Readonly<Partial<Record<RequiredSignal, number>>>;
  },
  nowIso: string
): MonitoringSnapshot {
  const signals: SignalSet = previous
    ? {
        deployment: previous.deployment,
        runtime: previous.runtime,
        usage: previous.usage,
        platform_incident: previous.platform_incident
      }
    : { deployment: null, runtime: null, usage: [], platform_incident: null };
  return buildEvaluatedSnapshot({ ...base, signals }, nowIso);
}

async function collectOne(
  target: CollectorTarget,
  previous: MonitoringSnapshot | undefined,
  deps: CollectionDeps,
  backoff: ProviderBackoff,
  cycleId: string
): Promise<BindingCycleOutcome> {
  const { binding } = target;
  const bindingKey = `${target.project}/${binding.id}`;
  const nowIso = deps.now();

  const adapter = deps.adapters[binding.provider];
  const adapterCapabilities = adapter?.capabilities(binding);
  const adapterMeta: MonitoringSnapshot["adapter"] = adapter
    ? { version: adapter.version, capabilities: [...adapterCapabilities!.supportedSignals] }
    : { version: "none", capabilities: [] };
  const maxAges = adapterCapabilities?.signalMaxAgeSeconds ?? {};
  const supportedSignals = adapterCapabilities?.supportedSignals ?? [];

  const finish = (
    status: BindingCycleStatus,
    collector: CollectorSignal,
    snapshot: MonitoringSnapshot
  ): BindingCycleOutcome => ({
    project: target.project,
    binding_id: binding.id,
    status,
    collector,
    snapshot
  });

  // Extension providers parse but cannot collect in Phase 1.
  if (!adapter || !adapterCapabilities || !adapterCapabilities.implemented) {
    const collector: CollectorSignal = {
      state: "unsupported_capability",
      attempted_at: nowIso,
      detail: adapter ? `${binding.provider} adapter is not implemented in Phase 1` : `no adapter registered for ${binding.provider}`
    };
    const snapshot = carryForward(
      previous,
      { cycle_id: cycleId, project: target.project, binding, adapter: adapterMeta, attempted_at: nowIso, collector, adapterCapabilities: supportedSignals, signalMaxAgeSeconds: maxAges },
      nowIso
    );
    return finish("unsupported", collector, snapshot);
  }

  // Per-provider backoff and per-binding minimum interval: neither scheduled
  // nor manual cycles may bypass them.
  const check = backoff.check(binding.provider, bindingKey);
  if (!check.allowed) {
    // The previous collector truth (e.g. rate_limited) is carried verbatim;
    // only the cycle identity advances.
    const collector: CollectorSignal = previous
      ? previous.collector
      : { state: "rate_limited", attempted_at: nowIso, detail: check.reason, retry_after_seconds: check.retryAfterSeconds };
    const snapshot = previous
      ? carryForward(
          previous,
          { cycle_id: cycleId, project: target.project, binding, adapter: adapterMeta, attempted_at: previous.attempted_at, collector, adapterCapabilities: supportedSignals, signalMaxAgeSeconds: maxAges },
          nowIso
        )
      : carryForward(
          undefined,
          { cycle_id: cycleId, project: target.project, binding, adapter: adapterMeta, attempted_at: nowIso, collector, adapterCapabilities: supportedSignals, signalMaxAgeSeconds: maxAges },
          nowIso
        );
    return finish(check.reason === "provider_backoff" ? "skipped_backoff" : "skipped_min_interval", collector, snapshot);
  }
  backoff.recordAttempt(binding.provider, bindingKey);

  // Credential resolution failures map to authentication_failed immediately;
  // the detail carries the machine-readable code only, never a value.
  let credential;
  try {
    credential = resolveMonitoringCredential(binding.credential_ref, binding.provider, deps.monitoring.credentials, deps.env);
  } catch (error) {
    const code = error instanceof CredentialError ? error.code : "credential_ref_unknown";
    const collector: CollectorSignal = { state: "authentication_failed", attempted_at: nowIso, detail: code };
    const snapshot = carryForward(
      previous,
      { cycle_id: cycleId, project: target.project, binding, adapter: adapterMeta, attempted_at: nowIso, collector, adapterCapabilities: supportedSignals, signalMaxAgeSeconds: maxAges },
      nowIso
    );
    return finish("failed", collector, snapshot);
  }

  // Adapter collection with an outer abort deadline; failures stay isolated
  // to this binding and never throw out of the cycle.
  let signals: SignalSet;
  try {
    const result = await adapter.collect(
      { binding, credential, fetch: deps.fetch, now: nowIso },
      AbortSignal.timeout(60_000)
    );
    signals = {
      deployment: result.deployment,
      runtime: result.runtime,
      usage: [...result.usage],
      platform_incident: result.platform_incident
    };
  } catch (error) {
    let collector: CollectorSignal;
    if (isAdapterError(error)) {
      collector = { state: error.code, attempted_at: nowIso, detail: error.message.slice(0, 200) };
      if (error.retryAfterSeconds !== undefined) {
        collector.retry_after_seconds = error.retryAfterSeconds;
      }
      if (error.code === "rate_limited" || error.code === "timeout" || error.code === "malformed_response") {
        backoff.recordFailure(binding.provider, { retryAfterSeconds: error.retryAfterSeconds });
      }
    } else {
      // Unknown errors may carry sensitive internals; normalize to a fixed
      // message instead of echoing them.
      collector = { state: "malformed_response", attempted_at: nowIso, detail: "unexpected collector error" };
      backoff.recordFailure(binding.provider);
    }
    const snapshot = carryForward(
      previous,
      { cycle_id: cycleId, project: target.project, binding, adapter: adapterMeta, attempted_at: nowIso, collector, adapterCapabilities: supportedSignals, signalMaxAgeSeconds: maxAges },
      nowIso
    );
    return finish("failed", collector, snapshot);
  }

  // Independent probe: when configured, it is the runtime evidence of record.
  if (binding.probe) {
    try {
      const outcome = await executeProbe(binding.probe, deps.monitoring.probeAllowedHosts, {
        fetch: deps.fetch,
        lookup: deps.lookup,
        now: nowIso
      });
      const runtime: RuntimeSignal = outcome.expected
        ? { state: "healthy", observed_at: nowIso, source: "probe", consecutive_failures: 0 }
        : {
            state: "unhealthy",
            observed_at: nowIso,
            source: "probe",
            consecutive_failures: previousConsecutiveProbeFailures(previous) + 1,
            detail: `probe status ${outcome.status} is outside expected_status`
          };
      signals.runtime = runtime;
    } catch (error) {
      if (error instanceof ProbeRejectedError) {
        const evidenceFailure = error.code === "probe_timeout" || error.code === "probe_fetch_failed";
        signals.runtime = evidenceFailure
          ? {
              state: "unhealthy",
              observed_at: nowIso,
              source: "probe",
              consecutive_failures: previousConsecutiveProbeFailures(previous) + 1,
              detail: error.code
            }
          : { state: "unknown", observed_at: nowIso, source: "probe", detail: error.code };
      } else {
        signals.runtime = { state: "unknown", observed_at: nowIso, source: "probe", detail: "probe_unexpected_error" };
      }
    }
  }

  backoff.recordSuccess(binding.provider);
  const collector: CollectorSignal = { state: "success", attempted_at: nowIso };
  const snapshot = buildEvaluatedSnapshot(
    {
      cycle_id: cycleId,
      project: target.project,
      binding,
      adapter: adapterMeta,
      attempted_at: nowIso,
      collector,
      signals,
      adapterCapabilities: supportedSignals,
      signalMaxAgeSeconds: maxAges
    },
    nowIso
  );
  return finish("collected", collector, snapshot);
}

/**
 * Runs one collection cycle and publishes it atomically. A failing binding
 * never aborts the others; its outcome carries the retained last-trustworthy
 * signals, and the index records `partially_complete`.
 */
export async function runCollectionCycle(deps: CollectionDeps): Promise<CollectionCycleResult> {
  const cycleId = cycleIdFrom(deps.now());
  const backoff =
    deps.backoff ??
    new ProviderBackoff({
      now: () => Date.parse(deps.now()),
      random: deps.random,
      policy: { minIntervalSeconds: deps.monitoring.refreshIntervalSeconds }
    });

  // Read the previous generation once; it is the carry-forward source.
  const previousProjection = readCurrentProjection(deps.root);
  const previousByBinding = new Map<string, MonitoringSnapshot>();
  if (previousProjection.ok) {
    for (const snapshot of previousProjection.value.snapshots) {
      previousByBinding.set(`${snapshot.project}/${snapshot.binding_id}`, snapshot);
    }
  }

  // Bounded concurrency pool; per-binding failures resolve, never reject.
  const outcomes: BindingCycleOutcome[] = new Array(deps.targets.length);
  let next = 0;
  const lanes = Math.max(1, Math.min(deps.monitoring.concurrency, deps.targets.length || 1));
  async function worker() {
    while (next < deps.targets.length) {
      const index = next;
      next += 1;
      const target = deps.targets[index];
      outcomes[index] = await collectOne(target, previousByBinding.get(`${target.project}/${target.binding.id}`), deps, backoff, cycleId);
    }
  }
  await Promise.all(Array.from({ length: lanes }, () => worker()));

  const index = publishCycle(deps.root, {
    cycle_id: cycleId,
    collected_at: deps.now(),
    snapshots: outcomes.map((outcome) => outcome.snapshot)
  });

  return { cycle_id: cycleId, status: index.status, outcomes, index };
}

/**
 * Global single-flight boundary (design §5.2): while a cycle is running,
 * further collect() calls report `collecting` instead of fanning out again.
 * Owns a persistent backoff tracker so backoff and minimum intervals hold
 * across cycles of the same process.
 */
export class MonitoringCollector {
  private inFlight: Promise<CollectionCycleResult> | null = null;
  private readonly backoff: ProviderBackoff;

  constructor(private readonly deps: CollectionDeps) {
    this.backoff =
      deps.backoff ??
      new ProviderBackoff({
        now: () => Date.parse(deps.now()),
        random: deps.random,
        policy: { minIntervalSeconds: deps.monitoring.refreshIntervalSeconds }
      });
  }

  collect(): Promise<CollectionCycleResult | { status: "collecting" }> {
    if (this.inFlight) {
      return Promise.resolve({ status: "collecting" });
    }
    this.inFlight = runCollectionCycle({ ...this.deps, backoff: this.backoff }).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
}
