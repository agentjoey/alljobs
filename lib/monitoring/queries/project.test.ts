import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDeploymentSignal,
  buildMonitoringBinding,
  buildMonitoringSnapshot,
  buildNeonBinding,
  buildRuntimeSignal,
  buildUsageMeasure,
  FIXTURE_NOW,
  FIXTURE_OBSERVED
} from "../domain/fixtures";
import type { MonitoringBinding, MonitoringSnapshot } from "../domain/types";
import type { ProjectRegistryEntry } from "../../planning/domain/types";
import { appendTransitionEvents, transitionEventSchema, type TransitionEvent } from "../store/events";
import { monitoringPaths } from "../store/paths";
import { publishCycle } from "../store/store";
import {
  getMonitoringProject,
  MONITORING_RECENT_EVIDENCE_LIMIT,
  type MonitoringQueryContext
} from "./project";

// Project-detail query contract tests (plan Task 7, design §10/§11.2). The
// query reads only the local validated projection plus bounded transition
// events for the single requested Project; a throwing global fetch proves no
// provider fan-out happens while rendering.

const CYCLE_A = "2026-09-11t06-00-00z";

const homes: string[] = [];

function tempHome(): { home: string; root: string } {
  const home = fs.mkdtempSync(join(tmpdir(), "alljobs-monitoring-project-"));
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

function snapshot(overrides: Record<string, unknown> = {}): MonitoringSnapshot {
  return buildMonitoringSnapshot({ cycle_id: CYCLE_A, ...overrides });
}

function event(overrides: Record<string, unknown> = {}): TransitionEvent {
  return transitionEventSchema.parse({
    schema_version: 1,
    type: "signal_state",
    project: "talentvault",
    binding_id: "railway-production-api",
    provider: "railway",
    dimension: "runtime",
    key: "runtime",
    previous: "healthy",
    new: "unhealthy",
    observed_at: FIXTURE_OBSERVED,
    recorded_at: "2026-09-10T00:00:00Z",
    provenance: { cycle_id: CYCLE_A, adapter_version: "1.0.0" },
    ...overrides
  });
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

describe("getMonitoringProject", () => {
  it("returns the disabled view without reading the cache", async () => {
    const { root } = tempHome();
    const view = await getMonitoringProject(
      "talentvault",
      context(root, [registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()])], false)
    );
    expect(view).toEqual({
      status: "disabled",
      project: null,
      attention: null,
      leading_reason: null,
      collected_at: null,
      cycle_id: null,
      bindings: [],
      recent_evidence: []
    });
  });

  it.each([
    ["path traversal", "../escape"],
    ["uppercase slug", "TalentVault"],
    ["unknown project", "ghost-project"]
  ])("rejects %s as not_found without touching provider seams", async (_label, slug) => {
    const { root } = tempHome();
    const fetchSpy = vi.fn(() => Promise.reject(new Error("provider calls are forbidden during rendering")));
    vi.stubGlobal("fetch", fetchSpy);
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshot()] });

    const view = await getMonitoringProject(slug, context(root, [registryEntry("talentvault", "TalentVault")]));

    expect(view.status).toBe("not_found");
    expect(view.project).toBeNull();
    expect(view.bindings).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats archived and unmonitored Projects as not_found", async () => {
    const { root } = tempHome();
    const archived = { ...registryEntry("old-proj", "Old Project", [buildMonitoringBinding()]), archived: true };
    const unmonitored = registryEntry("plain-proj", "Plain Project");

    expect((await getMonitoringProject("old-proj", context(root, [archived, unmonitored]))).status).toBe("not_found");
    expect((await getMonitoringProject("plain-proj", context(root, [archived, unmonitored]))).status).toBe("not_found");
  });

  it("lists configured bindings as pending before the first collection", async () => {
    const { root } = tempHome();
    const view = await getMonitoringProject(
      "talentvault",
      context(root, [registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()])])
    );

    expect(view.status).toBe("awaiting_first_collection");
    expect(view.project).toEqual({ slug: "talentvault", name: "TalentVault" });
    expect(view.attention).toBeNull();
    expect(view.bindings).toEqual([
      expect.objectContaining({
        binding_id: "railway-production-api",
        provider: "railway",
        resource_kind: "service",
        expected_runtime: "always-on",
        required_signals: ["deployment"],
        console_url: "https://railway.com/project/example",
        pending: true,
        attempted_at: null,
        collector: null,
        attention: null
      })
    ]);
    // Binding config carries credential_ref and probe host_ref; the view never does.
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("credential_ref");
    expect(serialized).not.toContain("railway-primary");
    expect(serialized).not.toContain("host_ref");
    expect(serialized).not.toContain("talentvault-production");
  });

  it("serves only the requested Project with mixed evidence kept explicit", async () => {
    const { root } = tempHome();
    const fetchSpy = vi.fn(() => Promise.reject(new Error("provider calls are forbidden during rendering")));
    vi.stubGlobal("fetch", fetchSpy);
    publishCycle(root, {
      cycle_id: CYCLE_A,
      collected_at: FIXTURE_NOW,
      snapshots: [
        snapshot({
          project: "talentvault",
          binding_id: "railway-production-api",
          deployment: buildDeploymentSignal({ state: "succeeded" }),
          runtime: buildRuntimeSignal({ state: "unhealthy", consecutive_failures: 2 }),
          usage: [buildUsageMeasure()],
          attention: "critical",
          reasons: [
            {
              code: "runtime_probe_failed",
              dimension: "runtime",
              severity: "critical",
              summary: "The independent probe confirmed the service is unreachable.",
              observed_at: FIXTURE_OBSERVED
            }
          ]
        }),
        snapshot({
          project: "petcare-app",
          binding_id: "neon-production-db",
          provider: "neon",
          attention: "healthy",
          reasons: []
        })
      ]
    });

    const view = await getMonitoringProject(
      "talentvault",
      context(root, [
        registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()]),
        registryEntry("petcare-app", "Petcare App", [buildNeonBinding()])
      ])
    );

    expect(view.status).toBe("ready");
    expect(view.cycle_id).toBe(CYCLE_A);
    expect(view.attention).toBe("critical");
    expect(view.leading_reason?.code).toBe("runtime_probe_failed");
    expect(view.bindings).toHaveLength(1);
    const binding = view.bindings[0];
    expect(binding.binding_id).toBe("railway-production-api");
    // Mixed evidence stays separate: the failed runtime drives critical without
    // rewriting the successful deployment.
    expect(binding.deployment?.state).toBe("succeeded");
    expect(binding.runtime?.state).toBe("unhealthy");
    expect(binding.usage).toHaveLength(1);
    expect(binding.attention).toBe("critical");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("isolates the requested Project: no other Project's bindings or evidence appear", async () => {
    const { root } = tempHome();
    publishCycle(root, {
      cycle_id: CYCLE_A,
      collected_at: FIXTURE_NOW,
      snapshots: [
        snapshot({ project: "talentvault", binding_id: "railway-production-api" }),
        snapshot({ project: "petcare-app", binding_id: "neon-production-db", provider: "neon" })
      ]
    });
    appendTransitionEvents(root, [
      event({ recorded_at: "2026-09-10T01:00:00Z" }),
      event({ project: "petcare-app", binding_id: "neon-production-db", provider: "neon", recorded_at: "2026-09-10T02:00:00Z" })
    ]);

    const view = await getMonitoringProject(
      "talentvault",
      context(root, [
        registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()]),
        registryEntry("petcare-app", "Petcare App", [buildNeonBinding()])
      ])
    );

    expect(view.bindings.map((binding) => binding.binding_id)).toEqual(["railway-production-api"]);
    expect(view.recent_evidence).toHaveLength(1);
    expect(view.recent_evidence[0]?.binding_id).toBe("railway-production-api");
    expect(JSON.stringify(view)).not.toContain("neon-production-db");
  });

  it("bounds recent evidence to the newest entries and skips malformed lines", async () => {
    const { root } = tempHome();
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshot()] });

    const currentMonth = Array.from({ length: MONITORING_RECENT_EVIDENCE_LIMIT + 5 }, (_, index) =>
      event({ recorded_at: `2026-09-10T00:${String(index).padStart(2, "0")}:00Z` })
    );
    const previousMonth = [
      event({ recorded_at: "2026-08-31T23:00:00Z", previous: "unhealthy", new: "healthy" }),
      event({ recorded_at: "2026-08-30T23:00:00Z", previous: "unhealthy", new: "healthy" })
    ];
    appendTransitionEvents(root, [...currentMonth, ...previousMonth]);
    // A corrupt line in the events file must be skipped, not fail the query.
    fs.appendFileSync(monitoringPaths(root).eventsDir + "/2026-09.jsonl", "{ broken\n");

    const view = await getMonitoringProject(
      "talentvault",
      context(root, [registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()])])
    );

    expect(view.status).toBe("ready");
    expect(view.recent_evidence).toHaveLength(MONITORING_RECENT_EVIDENCE_LIMIT);
    const recorded = view.recent_evidence.map((entry) => entry.recorded_at);
    const sorted = [...recorded].sort((a, b) => b.localeCompare(a));
    expect(recorded).toEqual(sorted);
    // The bound is filled from the current month first; older months only top up.
    expect(recorded.every((timestamp) => timestamp.startsWith("2026-09"))).toBe(true);
    expect(view.recent_evidence[0]?.recorded_at).toBe("2026-09-10T00:24:00Z");
  });

  it("rejects a corrupt current cache as cache_unavailable", async () => {
    const { root } = tempHome();
    const paths = monitoringPaths(root);
    fs.mkdirSync(paths.currentDir, { recursive: true });
    fs.writeFileSync(paths.indexFile, "definitely not json", "utf8");

    const view = await getMonitoringProject(
      "talentvault",
      context(root, [registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()])])
    );

    expect(view.status).toBe("cache_unavailable");
    expect(view.issue).toBe("index_unparseable");
    expect(view.bindings).toEqual([]);
    expect(view.recent_evidence).toEqual([]);
  });

  it("returns bounded, secret-free view models", async () => {
    const { root } = tempHome();
    publishCycle(root, {
      cycle_id: CYCLE_A,
      collected_at: FIXTURE_NOW,
      snapshots: [snapshot({ usage: [buildUsageMeasure()] })]
    });
    appendTransitionEvents(root, [event({ recorded_at: "2026-09-10T01:00:00Z" })]);

    const view = await getMonitoringProject(
      "talentvault",
      context(root, [registryEntry("talentvault", "TalentVault", [buildMonitoringBinding()])])
    );

    assertNoForbiddenKeys(view);
    expect(view.recent_evidence.length).toBeLessThanOrEqual(MONITORING_RECENT_EVIDENCE_LIMIT);
    for (const entry of view.recent_evidence) {
      expect(Object.keys(entry).sort()).toEqual(
        ["binding_id", "dimension", "key", "new", "observed_at", "previous", "recorded_at", "type"].sort()
      );
    }
  });
});
