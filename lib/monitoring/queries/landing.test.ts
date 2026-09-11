import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFreshnessSignal,
  buildMonitoringBinding,
  buildMonitoringSnapshot,
  buildNeonBinding,
  buildSignalFreshness,
  FIXTURE_NOW,
  FIXTURE_OBSERVED
} from "../domain/fixtures";
import type { AttentionReason, MonitoringBinding, MonitoringSnapshot } from "../domain/types";
import type { ProjectRegistryEntry } from "../../planning/domain/types";
import { generationFile, monitoringPaths } from "../store/paths";
import { publishCycle } from "../store/store";
import { getMonitoringLanding, type MonitoringQueryContext } from "./landing";

// Landing query contract tests (plan Task 7, design §10.1/§11.1). The query is
// an index-first, local-only projection reader: every assertion here runs
// against temporary <home>/state/monitoring roots with a throwing global fetch
// installed, proving server rendering performs zero provider calls.

const CYCLE_A = "2026-09-11t06-00-00z";
const CYCLE_B = "2026-09-11t07-00-00z";

const homes: string[] = [];

function tempHome(): { home: string; root: string } {
  const home = fs.mkdtempSync(join(tmpdir(), "alljobs-monitoring-landing-"));
  homes.push(home);
  return { home, root: join(home, "state", "monitoring") };
}

afterEach(() => {
  vi.unstubAllGlobals();
  while (homes.length > 0) {
    const home = homes.pop();
    if (home) fs.rmSync(home, { recursive: true, force: true });
  }
});

function registryEntry(slug: string, name: string, bindings?: MonitoringBinding[]): ProjectRegistryEntry {
  return {
    slug,
    name,
    type: "code",
    work_modes: ["implementation"],
    execution_locations: [],
    archived: false,
    ...(bindings ? { monitoring: { bindings } } : {})
  };
}

function context(root: string, projects: ProjectRegistryEntry[], enabled = true): MonitoringQueryContext {
  return { root, enabled, projects, now: () => FIXTURE_NOW };
}

function reason(code: string, severity: AttentionReason["severity"], dimension: AttentionReason["dimension"] = "runtime"): AttentionReason {
  return { code, dimension, severity, summary: `reason ${code}`, observed_at: FIXTURE_OBSERVED };
}

function snapshotForCycle(cycleId: string, overrides: Record<string, unknown> = {}): MonitoringSnapshot {
  return buildMonitoringSnapshot({ cycle_id: cycleId, ...overrides });
}

const FORBIDDEN_KEY = /token|secret|authorization|header|raw|body|content|environment|env|log/i;

function assertNoForbiddenKeys(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      expect(key, `forbidden key at ${path}`).not.toMatch(FORBIDDEN_KEY);
      assertNoForbiddenKeys(entry, `${path}.${key}`);
    }
  }
}

describe("getMonitoringLanding", () => {
  it("returns the disabled view without touching the cache when monitoring is off", async () => {
    const { root } = tempHome();
    // Root intentionally never created: any filesystem read would throw.
    const view = await getMonitoringLanding(
      context(root, [registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()])], false)
    );

    expect(view).toEqual({
      status: "disabled",
      collected_at: null,
      cycle_id: null,
      cycle_status: null,
      summary: { projects: 0, bindings: 0, needs_attention: 0, freshness: null },
      queue: [],
      ledger: []
    });
  });

  it("serves an empty ready view when no Project declares bindings", async () => {
    const { root } = tempHome();
    const fetchSpy = vi.fn(() => Promise.reject(new Error("provider calls are forbidden during rendering")));
    vi.stubGlobal("fetch", fetchSpy);

    const view = await getMonitoringLanding(
      context(root, [
        registryEntry("talentvault", "TalentVault"),
        registryEntry("petcare-app", "Petcare App", [])
      ])
    );

    expect(view.status).toBe("ready");
    expect(view.summary).toEqual({ projects: 0, bindings: 0, needs_attention: 0, freshness: null });
    expect(view.queue).toEqual([]);
    expect(view.ledger).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports awaiting_first_collection with pending rows when bindings exist but no cycle ran", async () => {
    const { root } = tempHome();
    const view = await getMonitoringLanding(
      context(root, [registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()])])
    );

    expect(view.status).toBe("awaiting_first_collection");
    expect(view.collected_at).toBeNull();
    expect(view.summary).toMatchObject({ projects: 1, bindings: 1, needs_attention: 1 });
    expect(view.ledger).toEqual([
      expect.objectContaining({
        project: "talentvault",
        name: "TalentVault",
        attention: null,
        leading_reason: null,
        freshness: null,
        binding_count: 1
      })
    ]);
    // A pending Project is not judgable: it enters the queue as unknown, never healthy.
    expect(view.queue).toEqual([
      expect.objectContaining({
        project: "talentvault",
        binding_id: "railway-production-api",
        attention: "unknown",
        reason: expect.objectContaining({ code: "first_collection_pending", severity: "unknown" })
      })
    ]);
  });

  it("sorts the ledger by attention precedence and then Project name", async () => {
    const { root } = tempHome();
    publishCycle(root, {
      cycle_id: CYCLE_A,
      collected_at: FIXTURE_NOW,
      snapshots: [
        snapshotForCycle(CYCLE_A, { project: "zulu-proj", binding_id: "railway-production-api", attention: "healthy", reasons: [] }),
        snapshotForCycle(CYCLE_A, { project: "beta-proj", binding_id: "neon-production-db", provider: "neon", attention: "critical", reasons: [reason("runtime_probe_failed", "critical")] }),
        snapshotForCycle(CYCLE_A, { project: "alpha-proj", binding_id: "fly-production-app", provider: "fly", attention: "warning", reasons: [reason("deployment_failed", "warning", "deployment")] }),
        snapshotForCycle(CYCLE_A, { project: "delta-proj", binding_id: "supabase-production-db", provider: "supabase", attention: "unknown", reasons: [reason("authorization_expired", "unknown", "collector")] }),
        snapshotForCycle(CYCLE_A, { project: "charlie-proj", binding_id: "neon-analytics-db", provider: "neon", attention: "watch", reasons: [reason("allowance_watch", "watch", "usage")] })
      ]
    });

    const projects = [
      registryEntry("zulu-proj", "Alpha Namesake"),
      registryEntry("beta-proj", "Beta"),
      registryEntry("alpha-proj", "Alpha"),
      registryEntry("delta-proj", "Delta"),
      registryEntry("charlie-proj", "Charlie")
    ];
    const view = await getMonitoringLanding(context(root, projects));

    expect(view.status).toBe("ready");
    expect(view.cycle_id).toBe(CYCLE_A);
    expect(view.cycle_status).toBe("complete");
    expect(view.collected_at).toBe(FIXTURE_NOW);
    expect(view.ledger.map((row) => row.project)).toEqual([
      "beta-proj",
      "alpha-proj",
      "delta-proj",
      "charlie-proj",
      "zulu-proj"
    ]);
    expect(view.summary).toEqual({ projects: 5, bindings: 5, needs_attention: 4, freshness: "current" });
  });

  it("excludes healthy Projects from the queue while keeping them in the ledger", async () => {
    const { root } = tempHome();
    publishCycle(root, {
      cycle_id: CYCLE_A,
      collected_at: FIXTURE_NOW,
      snapshots: [
        snapshotForCycle(CYCLE_A, { project: "talentvault", binding_id: "railway-production-api", attention: "healthy", reasons: [] }),
        snapshotForCycle(CYCLE_A, { project: "petcare-app", binding_id: "neon-production-db", provider: "neon", attention: "watch", reasons: [reason("allowance_watch", "watch", "usage")] })
      ]
    });

    const view = await getMonitoringLanding(
      context(root, [registryEntry("talentvault", "TalentVault"), registryEntry("petcare-app", "Petcare App")])
    );

    expect(view.ledger).toHaveLength(2);
    expect(view.queue).toHaveLength(1);
    expect(view.queue[0]).toMatchObject({ project: "petcare-app", binding_id: "neon-production-db", attention: "watch" });
    // Queue and ledger derive from the same snapshots: identical attention and reason.
    const ledgerRow = view.ledger.find((row) => row.project === "petcare-app");
    expect(ledgerRow?.attention).toBe("watch");
    expect(ledgerRow?.leading_reason?.code).toBe("allowance_watch");
    expect(view.queue[0].reason?.code).toBe(ledgerRow?.leading_reason?.code);
  });

  it("derives the row freshness from the worst signal freshness of its snapshots", async () => {
    const { root } = tempHome();
    publishCycle(root, {
      cycle_id: CYCLE_A,
      collected_at: FIXTURE_NOW,
      snapshots: [
        snapshotForCycle(CYCLE_A, {
          project: "talentvault",
          binding_id: "railway-production-api",
          attention: "watch",
          reasons: [reason("collection_delayed", "watch", "freshness")],
          freshness: buildFreshnessSignal({
            signals: [
              buildSignalFreshness({ signal: "deployment", state: "current" }),
              buildSignalFreshness({ signal: "runtime", state: "delayed" })
            ]
          })
        })
      ]
    });

    const view = await getMonitoringLanding(context(root, [registryEntry("talentvault", "TalentVault")]));
    expect(view.ledger[0]?.freshness).toBe("delayed");
    expect(view.summary.freshness).toBe("delayed");
  });

  it("rejects an index whose schema is not supported", async () => {
    const { root } = tempHome();
    const paths = monitoringPaths(root);
    fs.mkdirSync(paths.currentDir, { recursive: true });
    fs.writeFileSync(paths.indexFile, JSON.stringify({ schema_version: 2, cycle_id: CYCLE_A, projects: [] }), "utf8");

    const view = await getMonitoringLanding(context(root, [registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()])]));

    expect(view.status).toBe("cache_unavailable");
    expect(view.issue).toBe("index_invalid");
    expect(view.queue).toEqual([]);
    expect(view.ledger).toEqual([]);
  });

  it("rejects the projection when a referenced snapshot is missing (index-first reads)", async () => {
    const { root } = tempHome();
    publishCycle(root, {
      cycle_id: CYCLE_A,
      collected_at: FIXTURE_NOW,
      snapshots: [snapshotForCycle(CYCLE_A)]
    });
    fs.rmSync(generationFile(root, CYCLE_A, "talentvault", "railway-production-api"));

    const view = await getMonitoringLanding(context(root, [registryEntry("talentvault", "TalentVault")]));

    expect(view.status).toBe("cache_unavailable");
    expect(view.issue).toBe("snapshot_missing");
  });

  it("recovers from a corrupt current index once a new cycle is published", async () => {
    const { root } = tempHome();
    const projects = [registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()])];
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_A)] });

    // A torn write corrupts the index; the query must degrade safely, not throw.
    fs.writeFileSync(monitoringPaths(root).indexFile, "{ not json", "utf8");
    const degraded = await getMonitoringLanding(context(root, projects));
    expect(degraded.status).toBe("cache_unavailable");
    expect(degraded.issue).toBe("index_unparseable");

    // The next successful cycle atomically replaces the pointer and the view recovers.
    publishCycle(root, { cycle_id: CYCLE_B, collected_at: "2026-09-11T07:00:00Z", snapshots: [snapshotForCycle(CYCLE_B)] });
    const recovered = await getMonitoringLanding(context(root, projects));
    expect(recovered.status).toBe("ready");
    expect(recovered.cycle_id).toBe(CYCLE_B);
    expect(recovered.ledger[0]?.attention).toBe("healthy");
  });

  it("never performs provider calls and never leaks secrets in the view model", async () => {
    const { root } = tempHome();
    const fetchSpy = vi.fn(() => Promise.reject(new Error("provider calls are forbidden during rendering")));
    vi.stubGlobal("fetch", fetchSpy);
    publishCycle(root, {
      cycle_id: CYCLE_A,
      collected_at: FIXTURE_NOW,
      snapshots: [
        snapshotForCycle(CYCLE_A),
        snapshotForCycle(CYCLE_A, { project: "petcare-app", binding_id: "neon-production-db", provider: "neon", attention: "critical", reasons: [reason("runtime_unhealthy", "critical")] })
      ]
    });

    const view = await getMonitoringLanding(
      context(root, [registryEntry("talentvault", "TalentVault"), registryEntry("petcare-app", "Petcare App")])
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(view.status).toBe("ready");
    assertNoForbiddenKeys(view);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("credential_ref");
    expect(serialized).not.toContain("railway-primary");
    expect(serialized).not.toContain("host_ref");
  });
});
