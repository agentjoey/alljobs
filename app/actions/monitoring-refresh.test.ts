import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureAdapterRegistry } from "@/lib/monitoring/adapters";
import { createRecordingTransport } from "@/lib/monitoring/adapters/conformance";
import type { CollectionDeps } from "@/lib/monitoring/collector/collect";
import { buildMonitoringBinding, buildMonitoringSnapshot, FIXTURE_NOW, FIXTURE_OBSERVED } from "@/lib/monitoring/domain/fixtures";
import type { MonitoringBinding } from "@/lib/monitoring/domain/types";
import type { ControlHostResolvedPaths } from "@/lib/planning/config";
import type { ProjectRegistryEntry } from "@/lib/planning/domain/types";
import { publishCycle, readCurrentProjection } from "@/lib/monitoring/store/store";

// Server Action contract tests (plan Task 7, design §5.2/§12.3). The action
// accepts only { project, binding_id? }, enforces same-origin POST behavior,
// keeps global single-flight and per-binding backoff, and revalidates the
// monitoring routes after queueing. Every dependency boundary — headers,
// cache revalidation, Control Host config, the registry, and the collector —
// is mocked or pointed at a temporary monitoring state root.

const CYCLE_A = "2026-09-11t06-00-00z";
const CANARY = "railway-action-canary-token-1a2b3c";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  headerValues: new Map<string, string>(),
  loadControlHostConfig: vi.fn(),
  getProject: vi.fn(),
  runCollectionCycle: vi.fn(),
  adapterRegistryOverride: null as import("@/lib/monitoring/adapters").MonitoringAdapterRegistry | null
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => mocks.headerValues.get(key.toLowerCase()) ?? null })
}));
vi.mock("@/lib/planning/config", () => ({ loadControlHostConfig: mocks.loadControlHostConfig }));
vi.mock("@/lib/planning/native/store", () => ({
  NativePlanningStore: class {
    getProject(slug: string) {
      return mocks.getProject(slug);
    }
  }
}));
vi.mock("@/lib/monitoring/collector/collect", () => ({ runCollectionCycle: mocks.runCollectionCycle }));
vi.mock("@/lib/monitoring/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/monitoring/adapters")>();
  return {
    ...actual,
    // Tests may substitute the fixture registry; the default stays the fixed
    // production set so the no-input-channel contract still holds.
    createMonitoringAdapterRegistry: () =>
      mocks.adapterRegistryOverride ?? actual.createMonitoringAdapterRegistry()
  };
});

const homes: string[] = [];

function tempHome(): { home: string; root: string } {
  const home = fs.mkdtempSync(join(tmpdir(), "alljobs-monitoring-action-"));
  homes.push(home);
  return { home, root: join(home, "state", "monitoring") };
}

function makePaths(root: string, monitoringEnabled = true): ControlHostResolvedPaths {
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
        credentials: { "railway-primary": { provider: "railway", tokenEnv: "RAILWAY_TEST_TOKEN" } },
        probeAllowedHosts: {}
      }
    }
  };
}

function projectWithBindings(slug: string, bindings: MonitoringBinding[]): ProjectRegistryEntry {
  return {
    slug,
    name: "TalentVault",
    type: "code",
    work_modes: ["implementation"],
    execution_locations: [],
    archived: false,
    monitoring: { bindings }
  };
}

function sameOriginHeaders(): void {
  mocks.headerValues.set("origin", "http://127.0.0.1:3456");
  mocks.headerValues.set("host", "127.0.0.1:3456");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function importAction() {
  return import("./monitoring-refresh");
}

/**
 * Faithful stand-in for the real cycle contract (collect.ts): per target it
 * checks the injected backoff and records the attempt only when allowed. If
 * the action spent the attempt itself before queueing, the first cycle
 * reports skipped_min_interval here — exactly what the real collector does.
 */
function faithfulCycleMock() {
  mocks.runCollectionCycle.mockImplementation(async (deps: CollectionDeps) => {
    const outcomes = deps.targets.map((target) => {
      const key = `${target.project}/${target.binding.id}`;
      const check = deps.backoff!.check(target.binding.provider, key);
      if (check.allowed) {
        deps.backoff!.recordAttempt(target.binding.provider, key);
        return { project: target.project, binding_id: target.binding.id, status: "collected" };
      }
      return {
        project: target.project,
        binding_id: target.binding.id,
        status: check.reason === "provider_backoff" ? "skipped_backoff" : "skipped_min_interval"
      };
    });
    return { cycle_id: "2026-09-11t07-00-00z", status: "complete", outcomes };
  });
}

beforeEach(() => {
  vi.resetModules();
  mocks.revalidatePath.mockReset();
  mocks.headerValues.clear();
  mocks.loadControlHostConfig.mockReset();
  mocks.getProject.mockReset();
  mocks.runCollectionCycle.mockReset();
  mocks.adapterRegistryOverride = null;
  sameOriginHeaders();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  while (homes.length > 0) {
    const home = homes.pop();
    if (home) fs.rmSync(home, { recursive: true, force: true });
  }
});

describe("requestMonitoringRefresh", () => {
  it.each([
    ["a path-like project slug", { project: "../escape" }],
    ["an arbitrary provider field", { project: "talentvault", provider: "fly" }],
    ["a provider URL field", { project: "talentvault", url: "https://evil.example/graphql" }],
    ["a credential field", { project: "talentvault", token: "secret-token-value" }],
    ["a malformed binding id", { project: "talentvault", binding_id: "BAD ID" }],
    ["a non-object payload", "talentvault"]
  ])("rejects %s without touching the collector", async (_label, input) => {
    const { requestMonitoringRefresh } = await importAction();
    const result = await requestMonitoringRefresh(input as never);

    expect(result.status).toBe("error");
    expect(result).toMatchObject({ code: "INVALID_INPUT" });
    expect(mocks.runCollectionCycle).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and origin-less requests before any authority is used", async () => {
    const { root } = tempHome();
    mocks.loadControlHostConfig.mockReturnValue(makePaths(root));
    mocks.getProject.mockResolvedValue(projectWithBindings("talentvault", [buildMonitoringBinding()]));
    const { requestMonitoringRefresh } = await importAction();

    mocks.headerValues.set("origin", "https://evil.example");
    const crossOrigin = await requestMonitoringRefresh({ project: "talentvault" });
    expect(crossOrigin).toMatchObject({ status: "error", code: "FORBIDDEN" });

    mocks.headerValues.delete("origin");
    const noOrigin = await requestMonitoringRefresh({ project: "talentvault" });
    expect(noOrigin).toMatchObject({ status: "error", code: "FORBIDDEN" });

    expect(mocks.runCollectionCycle).not.toHaveBeenCalled();
    expect(mocks.getProject).not.toHaveBeenCalled();
  });

  it("rejects refresh when monitoring is disabled", async () => {
    const { root } = tempHome();
    mocks.loadControlHostConfig.mockReturnValue(makePaths(root, false));
    const { requestMonitoringRefresh } = await importAction();

    const result = await requestMonitoringRefresh({ project: "talentvault" });

    expect(result).toMatchObject({ status: "error", code: "MONITORING_DISABLED" });
    expect(mocks.runCollectionCycle).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects unknown, archived, and unbound Projects without widening authority", async () => {
    const { root } = tempHome();
    mocks.loadControlHostConfig.mockReturnValue(makePaths(root));
    mocks.getProject.mockImplementation(async (slug: string) => {
      if (slug === "archived-proj") return { ...projectWithBindings("archived-proj", [buildMonitoringBinding()]), archived: true };
      if (slug === "plain-proj") return projectWithBindings("plain-proj", []);
      return null;
    });
    const { requestMonitoringRefresh } = await importAction();

    expect(await requestMonitoringRefresh({ project: "ghost-proj" })).toMatchObject({ status: "error", code: "NOT_FOUND" });
    expect(await requestMonitoringRefresh({ project: "archived-proj" })).toMatchObject({ status: "error", code: "NOT_FOUND" });
    expect(await requestMonitoringRefresh({ project: "plain-proj" })).toMatchObject({ status: "error", code: "NO_BINDINGS" });
    expect(mocks.runCollectionCycle).not.toHaveBeenCalled();
  });

  it("rejects a binding id that is not registered on the Project", async () => {
    const { root } = tempHome();
    mocks.loadControlHostConfig.mockReturnValue(makePaths(root));
    mocks.getProject.mockResolvedValue(projectWithBindings("talentvault", [buildMonitoringBinding()]));
    const { requestMonitoringRefresh } = await importAction();

    const result = await requestMonitoringRefresh({ project: "talentvault", binding_id: "not-registered" });

    expect(result).toMatchObject({ status: "error", code: "UNKNOWN_BINDING" });
    expect(mocks.runCollectionCycle).not.toHaveBeenCalled();
  });

  it("queues a bounded cycle for the registered selection and revalidates monitoring paths", async () => {
    const { root } = tempHome();
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [buildMonitoringSnapshot()] });
    mocks.loadControlHostConfig.mockReturnValue(makePaths(root));
    const bindings = [
      buildMonitoringBinding(),
      buildMonitoringBinding({ id: "railway-preview-api" })
    ];
    mocks.getProject.mockResolvedValue(projectWithBindings("talentvault", bindings));
    mocks.runCollectionCycle.mockResolvedValue({ cycle_id: "2026-09-11t07-00-00z", status: "complete", outcomes: [] });
    const { requestMonitoringRefresh } = await importAction();

    const result = await requestMonitoringRefresh({ project: "talentvault", binding_id: "railway-preview-api" });

    expect(result.status).toBe("success");
    expect(result).toMatchObject({
      data: {
        refresh: "queued",
        // The currently served snapshot identity travels with the ack; the
        // previous atomic projection stays visible throughout collection.
        serving: { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW }
      }
    });
    expect(mocks.runCollectionCycle).toHaveBeenCalledTimes(1);
    const deps = mocks.runCollectionCycle.mock.calls[0][0];
    expect(deps.targets).toEqual([{ project: "talentvault", binding: bindings[1] }]);
    // Adapter resolution is fixed server-side; no browser-selected provider.
    expect(Object.keys(deps.adapters).sort()).toEqual(["fly", "neon", "railway", "supabase"]);
    expect(deps.monitoring.credentials).toEqual(makePaths(root).config.monitoring?.credentials);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/monitoring");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/monitoring/talentvault");
  });

  it("reports collecting instead of fanning out while a cycle is in flight", async () => {
    const { root } = tempHome();
    mocks.loadControlHostConfig.mockReturnValue(makePaths(root));
    mocks.getProject.mockResolvedValue(projectWithBindings("talentvault", [buildMonitoringBinding()]));
    const cycle = deferred<{ cycle_id: string; status: string; outcomes: never[] }>();
    mocks.runCollectionCycle.mockReturnValue(cycle.promise);
    const { requestMonitoringRefresh } = await importAction();

    const first = await requestMonitoringRefresh({ project: "talentvault" });
    expect(first).toMatchObject({ status: "success", data: { refresh: "queued" } });

    const second = await requestMonitoringRefresh({ project: "talentvault" });
    expect(second).toMatchObject({ status: "success", data: { refresh: "collecting" } });
    expect(mocks.runCollectionCycle).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2); // only the queueing call revalidates

    cycle.resolve({ cycle_id: "2026-09-11t07-00-00z", status: "complete", outcomes: [] });
    await flush();
  });

  it("reports backing_off inside the minimum interval and never bypasses it", async () => {
    const { root } = tempHome();
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [buildMonitoringSnapshot()] });
    mocks.loadControlHostConfig.mockReturnValue(makePaths(root));
    mocks.getProject.mockResolvedValue(projectWithBindings("talentvault", [buildMonitoringBinding()]));
    faithfulCycleMock();
    const { requestMonitoringRefresh } = await importAction();

    const first = await requestMonitoringRefresh({ project: "talentvault" });
    expect(first).toMatchObject({ status: "success", data: { refresh: "queued" } });
    // Pin the real contract: the first click must collect. If the action had
    // spent the attempt marker itself, the faithful cycle would report
    // skipped_min_interval here — which is what the production bug did.
    const firstCycle = await mocks.runCollectionCycle.mock.results[0].value;
    expect(firstCycle.outcomes.map((outcome: { status: string }) => outcome.status)).toEqual(["collected"]);

    const second = await requestMonitoringRefresh({ project: "talentvault" });
    expect(second.status).toBe("success");
    expect(second).toMatchObject({ data: { refresh: "backing_off" } });
    const data = second.status === "success" ? second.data : null;
    expect(data?.retry_after_seconds).toBeGreaterThan(0);
    // The previous projection is still the served identity.
    expect(data?.serving).toEqual({ cycle_id: CYCLE_A, collected_at: FIXTURE_NOW });
    expect(mocks.runCollectionCycle).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("collects on the first manual refresh through the real collector, backoff, and fixture adapters", async () => {
    const { root } = tempHome();
    // Integration path: no collector mock — the action drives the real
    // runCollectionCycle with its real shared ProviderBackoff, the fixture
    // adapter registry, and a temporary state root. The fetch seam is the
    // global stub because the action binds the server fetch itself.
    const { runCollectionCycle: realRunCollectionCycle } = await vi.importActual<
      typeof import("@/lib/monitoring/collector/collect")
    >("@/lib/monitoring/collector/collect");
    const transport = createRecordingTransport(() => ({
      status: 200,
      body: JSON.stringify({
        deployment: { state: "succeeded", deployment_id: "dep-1", observed_at: FIXTURE_OBSERVED }
      })
    }));
    vi.stubGlobal("fetch", transport.fetch);
    vi.stubEnv("RAILWAY_TEST_TOKEN", CANARY);
    mocks.adapterRegistryOverride = createFixtureAdapterRegistry(["railway"]);
    mocks.loadControlHostConfig.mockReturnValue(makePaths(root));
    mocks.getProject.mockResolvedValue(projectWithBindings("talentvault", [buildMonitoringBinding({ probe: undefined })]));
    mocks.runCollectionCycle.mockImplementation((deps: CollectionDeps) => realRunCollectionCycle(deps));
    const { requestMonitoringRefresh } = await importAction();

    const first = await requestMonitoringRefresh({ project: "talentvault" });
    expect(first).toMatchObject({ status: "success", data: { refresh: "queued" } });

    const cycle = await mocks.runCollectionCycle.mock.results[0].value;
    // The regression this pins: a first manual refresh must collect, not
    // skip itself with minimum_interval recorded by the action up front.
    expect(cycle.outcomes.map((outcome: { status: string }) => outcome.status)).toEqual(["collected"]);
    expect(cycle.outcomes[0].collector.state).toBe("success");
    const requestsAfterFirst = transport.requests.length;
    expect(requestsAfterFirst).toBeGreaterThan(0);
    for (const request of transport.requests) {
      expect(request.headers.authorization).toBe(`Bearer ${CANARY}`);
    }

    const projection = readCurrentProjection(root);
    expect(projection.ok).toBe(true);
    if (projection.ok) {
      expect(projection.value.snapshots.map((s) => `${s.project}/${s.binding_id}`)).toEqual([
        "talentvault/railway-production-api"
      ]);
    }

    // The attempt recorded by the real cycle still holds the minimum
    // interval: a second click inside the cadence backs off server-side
    // without any new provider call.
    const second = await requestMonitoringRefresh({ project: "talentvault" });
    expect(second).toMatchObject({ status: "success", data: { refresh: "backing_off" } });
    expect(transport.requests).toHaveLength(requestsAfterFirst);
    expect(mocks.runCollectionCycle).toHaveBeenCalledTimes(1);
  });

  it("normalizes unexpected failures into safe errors without internals", async () => {
    const { root } = tempHome();
    mocks.loadControlHostConfig.mockReturnValue(makePaths(root));
    mocks.getProject.mockRejectedValue(new Error("/private/control-host leak RAILWAY_TEST_TOKEN"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { requestMonitoringRefresh } = await importAction();

    const registryFailure = await requestMonitoringRefresh({ project: "talentvault" });
    expect(registryFailure.status).toBe("error");
    expect(JSON.stringify(registryFailure)).not.toContain("/private/control-host");
    expect(JSON.stringify(registryFailure)).not.toContain("RAILWAY_TEST_TOKEN");

    mocks.getProject.mockResolvedValue(projectWithBindings("talentvault", [buildMonitoringBinding()]));
    mocks.runCollectionCycle.mockImplementation(() => {
      throw new Error("spawn /private/control-host/worker failed");
    });
    const collectorFailure = await requestMonitoringRefresh({ project: "talentvault" });
    expect(collectorFailure.status).toBe("error");
    expect(collectorFailure).toMatchObject({ message: "The operation failed" });
    expect(JSON.stringify(collectorFailure)).not.toContain("/private/control-host");
    consoleSpy.mockRestore();
  });
});
