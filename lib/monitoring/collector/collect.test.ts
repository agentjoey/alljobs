import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMonitoringBinding, buildNeonBinding } from "../domain/fixtures";
import type { MonitoringBinding } from "../domain/types";
import { AdapterError, type FetchLike } from "../adapters/contracts";
import { createFixtureAdapter } from "../adapters/fixture";
import { readCurrentProjection } from "../store/store";
import { ProviderBackoff } from "./backoff";
import { MonitoringCollector, runCollectionCycle, type CollectionDeps } from "./collect";

// Collector orchestration (design §5.1/§9): bounded concurrency, global
// single-flight, per-provider backoff with Retry-After, minimum interval,
// one-adapter isolation, partial-cycle publication, and last-trustworthy
// carry-forward. Everything runs against temp ALLJOBS_HOME roots and
// injected fetch/DNS — no real network, no real Control Host state.

const TOKEN = "collect-test-token-abcdef";
const T1 = "2026-09-11T06:00:00Z";
const T2 = "2026-09-11T06:05:00Z";

const tempRoots: string[] = [];
function makeRoot(): string {
  const home = fs.mkdtempSync(join(tmpdir(), "alljobs-collect-"));
  tempRoots.push(home);
  return join(home, "state", "monitoring");
}
afterEach(() => {
  for (const home of tempRoots.splice(0)) {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

function evidenceBody(binding: MonitoringBinding, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    deployment:
      binding.provider === "railway"
        ? { state: "succeeded", deployment_id: `dep-${binding.id}`, observed_at: "2026-09-11T05:59:00Z" }
        : null,
    runtime: binding.provider === "neon" ? { state: "healthy", observed_at: "2026-09-11T05:59:00Z", source: "provider" } : null,
    usage: [],
    platform_incident: null,
    ...overrides
  });
}

interface ScriptOptions {
  failBindings?: Record<string, AdapterError>;
  probeStatus?: number;
  gate?: Promise<unknown>;
  onFixtureCall?: () => void;
}

function scriptedFetch(options: ScriptOptions = {}): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    if (url.startsWith("https://app.example.com")) {
      return new Response(null, { status: options.probeStatus ?? 200 });
    }
    if (options.gate) await options.gate;
    options.onFixtureCall?.();
    const bindingId = url.split("/").pop() ?? "";
    const failure = options.failBindings?.[bindingId];
    if (failure) throw failure;
    return new Response(evidenceBody({ id: bindingId, provider: url.includes("neon") ? "neon" : "railway" } as MonitoringBinding), {
      status: 200
    });
  };
  return { fetchImpl, urls };
}

function makeDeps(root: string, overrides: Partial<CollectionDeps> = {}): CollectionDeps {
  const { fetchImpl } = scriptedFetch();
  return {
    root,
    targets: [{ project: "talentvault", binding: buildMonitoringBinding() }],
    adapters: {
      railway: createFixtureAdapter({ provider: "railway" }),
      neon: createFixtureAdapter({ provider: "neon" })
    },
    monitoring: {
      concurrency: 2,
      refreshIntervalSeconds: 300,
      credentials: { "railway-primary": { provider: "railway", tokenEnv: "RAILWAY_TEST_TOKEN" } },
      probeAllowedHosts: { "talentvault-production": "https://app.example.com" }
    },
    env: { RAILWAY_TEST_TOKEN: TOKEN },
    fetch: fetchImpl,
    lookup: async () => ["203.0.113.10"],
    now: () => T1,
    random: () => 0.5,
    ...overrides
  };
}

describe("runCollectionCycle", () => {
  it("collects a healthy binding and publishes a complete cycle", async () => {
    const root = makeRoot();
    const result = await runCollectionCycle(makeDeps(root));

    expect(result.cycle_id).toBe("2026-09-11t06-00-00z");
    expect(result.status).toBe("complete");
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].status).toBe("collected");

    const projection = readCurrentProjection(root);
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    expect(projection.value.index.status).toBe("complete");
    const snapshot = projection.value.snapshots[0];
    expect(snapshot.attention).toBe("healthy");
    expect(snapshot.collector.state).toBe("success");
    expect(snapshot.deployment?.deployment_id).toBe("dep-railway-production-api");
    // The binding probe ran and supplied independent runtime evidence.
    expect(snapshot.runtime).toMatchObject({ state: "healthy", source: "probe", consecutive_failures: 0 });
    expect(JSON.stringify(snapshot)).not.toContain(TOKEN);
  });

  it("bounds concurrency across adapters", async () => {
    const root = makeRoot();
    let inFlight = 0;
    let maxInFlight = 0;
    const { fetchImpl } = scriptedFetch({
      onFixtureCall: () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
      }
    });
    // Wrap to add latency and decrement after the response is produced.
    const slowFetch: FetchLike = async (url, init) => {
      const response = await fetchImpl(url, init);
      if (url.startsWith("https://app.example.com")) return response;
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight -= 1;
      return response;
    };

    const targets = [
      { project: "talentvault", binding: buildMonitoringBinding() },
      { project: "talentvault", binding: buildMonitoringBinding({ id: "railway-secondary-api" }) },
      { project: "petcare", binding: buildNeonBinding() },
      { project: "petcare", binding: buildNeonBinding({ id: "neon-secondary-db" }) }
    ];
    const deps = makeDeps(root, {
      targets,
      fetch: slowFetch,
      monitoring: {
        concurrency: 2,
        refreshIntervalSeconds: 300,
        credentials: {
          "railway-primary": { provider: "railway", tokenEnv: "RAILWAY_TEST_TOKEN" },
          "neon-primary": { provider: "neon", tokenEnv: "NEON_TEST_TOKEN" }
        },
        probeAllowedHosts: { "talentvault-production": "https://app.example.com" }
      },
      env: { RAILWAY_TEST_TOKEN: TOKEN, NEON_TEST_TOKEN: "neon-token" }
    });
    const result = await runCollectionCycle(deps);
    expect(result.status).toBe("complete");
    expect(result.outcomes).toHaveLength(4);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("enforces global single-flight through MonitoringCollector", async () => {
    const root = makeRoot();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { fetchImpl } = scriptedFetch({ gate });
    const collector = new MonitoringCollector(makeDeps(root, { fetch: fetchImpl }));

    const first = collector.collect();
    const second = await collector.collect();
    expect(second).toEqual({ status: "collecting" });

    release();
    const result = await first;
    expect("cycle_id" in result && result.status).toBe("complete");

    // After completion a new cycle may start again (min interval aside).
    const third = await collector.collect();
    expect(third).not.toEqual({ status: "collecting" });
  });

  it("isolates one adapter failure and publishes a partial cycle with carried values", async () => {
    const root = makeRoot();
    // Cycle 1: everything succeeds.
    const deps1 = makeDeps(root, {
      targets: [
        { project: "talentvault", binding: buildMonitoringBinding() },
        { project: "petcare", binding: buildNeonBinding() }
      ],
      monitoring: {
        concurrency: 2,
        refreshIntervalSeconds: 300,
        credentials: {
          "railway-primary": { provider: "railway", tokenEnv: "RAILWAY_TEST_TOKEN" },
          "neon-primary": { provider: "neon", tokenEnv: "NEON_TEST_TOKEN" }
        },
        probeAllowedHosts: { "talentvault-production": "https://app.example.com" }
      },
      env: { RAILWAY_TEST_TOKEN: TOKEN, NEON_TEST_TOKEN: "neon-token" }
    });
    const first = await runCollectionCycle(deps1);
    expect(first.status).toBe("complete");

    // Cycle 2: the railway adapter times out; neon must be unaffected.
    const { fetchImpl } = scriptedFetch({
      failBindings: { "railway-production-api": new AdapterError("timeout", "fixture timeout") }
    });
    const second = await runCollectionCycle(
      makeDeps(root, {
        targets: deps1.targets,
        monitoring: deps1.monitoring,
        env: deps1.env,
        fetch: fetchImpl,
        now: () => T2,
        backoff: new ProviderBackoff({ now: () => Date.parse(T2), random: () => 0.5 })
      })
    );

    expect(second.status).toBe("partially_complete");
    const byBinding = new Map(second.outcomes.map((outcome) => [outcome.binding_id, outcome]));
    expect(byBinding.get("railway-production-api")?.status).toBe("failed");
    expect(byBinding.get("neon-production-db")?.status).toBe("collected");

    const failed = byBinding.get("railway-production-api")?.snapshot;
    expect(failed?.collector.state).toBe("timeout");
    expect(failed?.attempted_at).toBe(T2);
    // Last trustworthy deployment value carried forward unchanged.
    expect(failed?.deployment?.deployment_id).toBe("dep-railway-production-api");
    expect(failed?.deployment?.observed_at).toBe("2026-09-11T05:59:00Z");
    // Freshness marks the retained value delayed, not current.
    expect(failed?.freshness.signals.find((signal) => signal.signal === "deployment")?.state).toBe("delayed");
    expect(failed?.attention).toBe("watch");
    expect(failed?.reasons.map((reason) => reason.code)).toContain("collection_delayed");

    const neon = byBinding.get("neon-production-db")?.snapshot;
    expect(neon?.collector.state).toBe("success");
    expect(neon?.attention).toBe("healthy");

    // The published index reflects the partial cycle and stays readable.
    const projection = readCurrentProjection(root);
    expect(projection.ok && projection.value.index.status).toBe("partially_complete");
  });

  it("backs off a rate-limited provider and honors Retry-After on the next cycle", async () => {
    const root = makeRoot();
    let current = Date.parse(T1);
    const backoff = new ProviderBackoff({
      now: () => current,
      random: () => 1,
      policy: { baseDelaySeconds: 60, maxDelaySeconds: 3600, minIntervalSeconds: 0 }
    });

    // Cycle 1: provider says 429 with Retry-After: 900.
    const { fetchImpl: failing } = scriptedFetch({
      failBindings: {
        "railway-production-api": new AdapterError("rate_limited", "fixture 429", { retryAfterSeconds: 900 })
      }
    });
    const first = await runCollectionCycle(
      makeDeps(root, { fetch: failing, backoff, monitoring: { ...makeDeps(root).monitoring, refreshIntervalSeconds: 0 } })
    );
    expect(first.outcomes[0].status).toBe("failed");
    expect(first.outcomes[0].snapshot.collector).toMatchObject({ state: "rate_limited", retry_after_seconds: 900 });

    // Cycle 2 ten seconds later: the provider is inside its Retry-After
    // window, so the binding is skipped and the previous failure evidence is
    // carried forward without any new provider request.
    current += 10_000;
    const { fetchImpl: healthy, urls } = scriptedFetch();
    const second = await runCollectionCycle(
      makeDeps(root, {
        fetch: healthy,
        backoff,
        now: () => new Date(current).toISOString(),
        monitoring: { ...makeDeps(root).monitoring, refreshIntervalSeconds: 0 }
      })
    );
    expect(second.outcomes[0].status).toBe("skipped_backoff");
    expect(urls.some((url) => url.includes("fixture-collector.invalid"))).toBe(false);
    expect(second.outcomes[0].snapshot.collector.state).toBe("rate_limited");
    expect(second.outcomes[0].snapshot.attention).not.toBe("healthy");
  });

  it("does not let a manual cycle bypass the minimum interval", async () => {
    const root = makeRoot();
    let current = Date.parse(T1);
    const backoff = new ProviderBackoff({
      now: () => current,
      random: () => 0.5,
      policy: { minIntervalSeconds: 300 }
    });
    const first = await runCollectionCycle(makeDeps(root, { backoff }));
    expect(first.outcomes[0].status).toBe("collected");

    // A "manual refresh" ten seconds later must not re-collect.
    current += 10_000;
    const { fetchImpl, urls } = scriptedFetch();
    const second = await runCollectionCycle(
      makeDeps(root, { fetch: fetchImpl, backoff, now: () => new Date(current).toISOString() })
    );
    expect(second.outcomes[0].status).toBe("skipped_min_interval");
    expect(urls.some((url) => url.includes("fixture-collector.invalid"))).toBe(false);
    // The carried snapshot keeps the previous collector truth and stays healthy.
    expect(second.outcomes[0].snapshot.collector.state).toBe("success");
    expect(second.outcomes[0].snapshot.attention).toBe("healthy");
    expect(second.status).toBe("complete");
  });

  it("marks first-collection failures unknown without inventing signal values", async () => {
    const root = makeRoot();
    const { fetchImpl } = scriptedFetch({
      failBindings: { "railway-production-api": new AdapterError("timeout", "fixture timeout") }
    });
    const result = await runCollectionCycle(makeDeps(root, { fetch: fetchImpl }));
    const snapshot = result.outcomes[0].snapshot;
    expect(snapshot.collector.state).toBe("timeout");
    expect(snapshot.deployment).toBeNull();
    expect(snapshot.runtime).toBeNull();
    expect(snapshot.attention).toBe("unknown");
    expect(snapshot.freshness.signals.find((signal) => signal.signal === "deployment")?.state).toBe("never_collected");
  });

  it("marks extension providers unsupported without contacting anything", async () => {
    const root = makeRoot();
    const binding = buildMonitoringBinding({
      id: "vercel-app",
      provider: "vercel",
      resource_kind: "project",
      resource_id: "my-app",
      required_signals: [],
      credential_ref: "railway-primary",
      console_url: "https://vercel.com/example",
      probe: undefined
    });
    const { fetchImpl, urls } = scriptedFetch();
    const result = await runCollectionCycle(
      makeDeps(root, { targets: [{ project: "talentvault", binding }], fetch: fetchImpl })
    );
    expect(result.outcomes[0].status).toBe("unsupported");
    expect(result.outcomes[0].snapshot.collector.state).toBe("unsupported_capability");
    expect(urls).toHaveLength(0);
  });

  it("maps credential failures to authentication_failed without leaking secrets", async () => {
    const root = makeRoot();
    const result = await runCollectionCycle(makeDeps(root, { env: {} }));
    const outcome = result.outcomes[0];
    expect(outcome.status).toBe("failed");
    expect(outcome.snapshot.collector.state).toBe("authentication_failed");
    expect(outcome.snapshot.collector.detail).toContain("credential_env_missing");
    expect(outcome.snapshot.attention).toBe("unknown");
    const serialized = JSON.stringify(outcome.snapshot);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain("RAILWAY_TEST_TOKEN");
  });

  it("tracks consecutive probe failures toward confirmed critical", async () => {
    const root = makeRoot();
    let current = Date.parse(T1);
    const backoff = new ProviderBackoff({
      now: () => current,
      random: () => 0.5,
      policy: { minIntervalSeconds: 0 }
    });

    // Cycle 1: probe returns 503 (unexpected) — transient failure.
    const { fetchImpl: f1 } = scriptedFetch({ probeStatus: 503 });
    const first = await runCollectionCycle(
      makeDeps(root, {
        fetch: f1,
        backoff,
        targets: [
          {
            project: "talentvault",
            binding: buildMonitoringBinding({ required_signals: ["deployment", "runtime"] })
          }
        ]
      })
    );
    expect(first.outcomes[0].snapshot.runtime).toMatchObject({ state: "unhealthy", source: "probe", consecutive_failures: 1 });
    expect(first.outcomes[0].snapshot.attention).toBe("warning");

    // Cycle 2: probe still failing — confirmed unhealthy drives critical.
    current += 60_000;
    const { fetchImpl: f2 } = scriptedFetch({ probeStatus: 503 });
    const second = await runCollectionCycle(
      makeDeps(root, {
        fetch: f2,
        backoff,
        now: () => new Date(current).toISOString(),
        targets: [
          {
            project: "talentvault",
            binding: buildMonitoringBinding({ required_signals: ["deployment", "runtime"] })
          }
        ]
      })
    );
    expect(second.outcomes[0].snapshot.runtime?.consecutive_failures).toBe(2);
    expect(second.outcomes[0].snapshot.attention).toBe("critical");
    expect(second.outcomes[0].snapshot.reasons.map((reason) => reason.code)).toContain("runtime_unhealthy_confirmed");
  });
});
