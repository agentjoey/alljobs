import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFixtureAdapterRegistry,
  createMonitoringAdapterRegistry,
  FIXTURE_ADAPTER_REGISTRY_PROVIDERS
} from "../lib/monitoring/adapters";
import { createRecordingTransport } from "../lib/monitoring/adapters/conformance";
import { FIXTURE_ADAPTER_HOST } from "../lib/monitoring/adapters/fixture";
import {
  buildMonitoringBinding,
  buildNeonBinding,
  FIXTURE_NOW,
  FIXTURE_OBSERVED
} from "../lib/monitoring/domain/fixtures";
import type { MonitoringBinding } from "../lib/monitoring/domain/types";
import type { ControlHostResolvedPaths } from "../lib/planning/config";
import type { ProjectRegistryEntry } from "../lib/planning/domain/types";
import { readCurrentIndex, readCurrentProjection } from "../lib/monitoring/store/store";
import { runMonitoringRefreshOnce } from "./monitoring-refresh";
import { runMonitoringRefreshSafely } from "./planning-refresh";

// Worker orchestration tests (plan Task 7, design §5.1/§14). All provider
// traffic is answered through the injected fetch seam by fixture adapters; the
// canary token proves credentials reach the adapter but never the cache.

const CANARY = "railway-test-token-canary-9f8e7d";

const homes: string[] = [];

function tempHome(): { home: string; root: string } {
  const home = fs.mkdtempSync(join(tmpdir(), "alljobs-monitoring-script-"));
  homes.push(home);
  return { home, root: join(home, "state", "monitoring") };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  while (homes.length > 0) {
    const home = homes.pop();
    if (home) fs.rmSync(home, { recursive: true, force: true });
  }
});

function makePaths(root: string, monitoringEnabled: boolean): ControlHostResolvedPaths {
  const homeDir = join(root, "..", "..");
  return {
    homeDir,
    configPath: join(homeDir, "config.json"),
    mirrorsDir: join(homeDir, "mirrors"),
    logsDir: join(homeDir, "logs"),
    cacheDir: join(homeDir, "cache"),
    stateDir: join(homeDir, "state"),
    monitoringStateDir: root,
    config: {
      trustedCodeRoots: [homeDir],
      refreshIntervalSeconds: 300,
      monitoring: {
        enabled: monitoringEnabled,
        refreshIntervalSeconds: 300,
        concurrency: 2,
        credentials: {
          "railway-primary": { provider: "railway", tokenEnv: "RAILWAY_TEST_TOKEN" },
          "neon-primary": { provider: "neon", tokenEnv: "NEON_TEST_TOKEN" }
        },
        probeAllowedHosts: {}
      }
    }
  };
}

function projectWithBindings(slug: string, bindings: MonitoringBinding[]): ProjectRegistryEntry {
  return {
    slug,
    name: slug,
    type: "code",
    work_modes: ["implementation"],
    execution_locations: [],
    archived: false,
    monitoring: { bindings }
  };
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

describe("runMonitoringRefreshOnce", () => {
  it("skips cleanly when monitoring is disabled", async () => {
    const { root } = tempHome();
    const transport = createRecordingTransport(() => ({ status: 500 }));
    const log = vi.fn();

    const summary = await runMonitoringRefreshOnce({
      paths: makePaths(root, false),
      listProjects: async () => [projectWithBindings("talentvault", [buildMonitoringBinding()])],
      fetch: transport.fetch,
      log
    });

    expect(summary).toEqual({ status: "disabled", cycle_id: null, outcomes: [] });
    expect(transport.requests).toEqual([]);
    expect(fs.existsSync(root)).toBe(false);
  });

  it("reports no_targets when no registered Project declares bindings", async () => {
    const { root } = tempHome();
    const transport = createRecordingTransport(() => ({ status: 500 }));

    const summary = await runMonitoringRefreshOnce({
      paths: makePaths(root, true),
      listProjects: async () => [projectWithBindings("plain-proj", [])],
      fetch: transport.fetch,
      log: () => {}
    });

    expect(summary.status).toBe("no_targets");
    expect(transport.requests).toEqual([]);
  });

  it("runs one bounded cycle through injected fixture adapters and publishes the projection", async () => {
    const { root } = tempHome();
    const transport = createRecordingTransport(() => ({
      status: 200,
      body: JSON.stringify({
        deployment: { state: "succeeded", deployment_id: "dep-1", observed_at: FIXTURE_OBSERVED }
      })
    }));

    const summary = await runMonitoringRefreshOnce({
      paths: makePaths(root, true),
      listProjects: async () => [
        projectWithBindings("talentvault", [buildMonitoringBinding({ probe: undefined })]),
        projectWithBindings("petcare-app", [buildNeonBinding()])
      ],
      adapters: createFixtureAdapterRegistry(["railway", "neon"]),
      env: { RAILWAY_TEST_TOKEN: CANARY, NEON_TEST_TOKEN: "neon-canary-token" },
      fetch: transport.fetch,
      now: () => FIXTURE_NOW,
      log: () => {}
    });

    expect(summary.status).toBe("complete");
    expect(summary.cycle_id).toBe("2026-09-11t06-00-00z");
    expect(summary.outcomes).toEqual([
      { project: "talentvault", binding_id: "railway-production-api", status: "collected" },
      { project: "petcare-app", binding_id: "neon-production-db", status: "collected" }
    ]);

    // Only the fixed fixture host was contacted; the canary proves credential
    // resolution reached the adapter through the opaque handle.
    expect(transport.requests.length).toBeGreaterThan(0);
    for (const request of transport.requests) {
      expect(new URL(request.url).hostname).toBe(FIXTURE_ADAPTER_HOST);
    }
    expect(transport.requests.some((request) => request.headers.authorization === `Bearer ${CANARY}`)).toBe(true);

    // The published projection is schema-valid and carries no token material.
    const projection = readCurrentProjection(root);
    expect(projection.ok).toBe(true);
    if (projection.ok) {
      expect(projection.value.snapshots.map((s) => `${s.project}/${s.binding_id}`).sort()).toEqual([
        "petcare-app/neon-production-db",
        "talentvault/railway-production-api"
      ]);
    }
    for (const file of walkFiles(root)) {
      expect(fs.readFileSync(file, "utf8"), file).not.toContain(CANARY);
    }
  });

  it("isolates adapter failure into a partial cycle without throwing", async () => {
    const { root } = tempHome();
    const transport = createRecordingTransport((request) =>
      request.url.includes("railway-production-api") ? { status: 500 } : { status: 200, body: "{}" }
    );

    const summary = await runMonitoringRefreshOnce({
      paths: makePaths(root, true),
      listProjects: async () => [
        projectWithBindings("talentvault", [buildMonitoringBinding({ probe: undefined })]),
        projectWithBindings("petcare-app", [buildNeonBinding()])
      ],
      adapters: createFixtureAdapterRegistry(["railway", "neon"]),
      env: { RAILWAY_TEST_TOKEN: CANARY, NEON_TEST_TOKEN: "neon-canary-token" },
      fetch: transport.fetch,
      now: () => FIXTURE_NOW,
      log: () => {}
    });

    expect(summary.status).toBe("partially_complete");
    const failed = summary.outcomes.find((outcome) => outcome.project === "talentvault");
    const healthy = summary.outcomes.find((outcome) => outcome.project === "petcare-app");
    expect(failed?.status).toBe("failed");
    expect(healthy?.status).toBe("collected");

    const index = readCurrentIndex(root);
    expect(index.ok).toBe(true);
    if (index.ok) expect(index.value.status).toBe("partially_complete");
  });
});

describe("adapter registries", () => {
  it("production resolution is a fixed set with no input channel", () => {
    const registry = createMonitoringAdapterRegistry();
    expect(Object.keys(registry).sort()).toEqual(["fly", "neon", "railway", "supabase"]);
    expect(createMonitoringAdapterRegistry.length).toBe(0);
    expect(registry.railway?.provider).toBe("railway");
  });

  it("fixture registry refuses to construct outside NODE_ENV=test", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createFixtureAdapterRegistry()).toThrow(/NODE_ENV/);
    vi.unstubAllEnvs();

    const registry = createFixtureAdapterRegistry();
    expect(Object.keys(registry).sort()).toEqual([...FIXTURE_ADAPTER_REGISTRY_PROVIDERS].sort());
  });
});

describe("planning-refresh integration", () => {
  it("does not invoke monitoring at all when disabled", async () => {
    const { root } = tempHome();
    const run = vi.fn().mockResolvedValue({ status: "complete" });

    await runMonitoringRefreshSafely(makePaths(root, false), run);

    expect(run).not.toHaveBeenCalled();
  });

  it("catches monitoring failures so Git planning refresh can never fail", async () => {
    const { root } = tempHome();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn().mockRejectedValue(new Error("collector exploded with /private/path"));

    await expect(runMonitoringRefreshSafely(makePaths(root, true), run)).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[monitoring-refresh]"),
      expect.anything()
    );
  });

  it("reports a successful monitoring cycle on the planning worker log", async () => {
    const { root } = tempHome();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const run = vi.fn().mockResolvedValue({ status: "complete", cycle_id: "2026-09-11t06-00-00z", outcomes: [] });

    await expect(runMonitoringRefreshSafely(makePaths(root, true), run)).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[monitoring-refresh]"));
  });
});
