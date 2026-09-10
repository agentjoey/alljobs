import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCollectorSignal,
  buildMonitoringSnapshot,
  FIXTURE_NOW
} from "../domain/fixtures";
import type { MonitoringSnapshot } from "../domain/types";
import { generationFile } from "./paths";
import {
  buildRetainedSnapshot,
  cleanupGenerations,
  publishCycle,
  readCurrentIndex,
  readCurrentProjection
} from "./store";

// Tests run in temporary ALLJOBS_HOME roots; nothing here touches the real
// Control Host state. The monitoring state root is always
// <home>/state/monitoring, matching the approved cache tree.

const CYCLE_A = "2026-09-11t06-00-00z";
const CYCLE_B = "2026-09-11t07-00-00z";
const CYCLE_C = "2026-09-11t08-00-00z";

// Records every atomic-rename target so the index-last publication order is
// observable. node:fs is a non-configurable ESM namespace here, so the wrap
// goes through vi.mock instead of vi.spyOn.
const renameLog = vi.hoisted(() => ({ targets: [] as string[] }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync(from: unknown, to: unknown) {
      renameLog.targets.push(String(to));
      return actual.renameSync(from as never, to as never);
    }
  };
});

const homes: string[] = [];

function tempHome(): { home: string; root: string } {
  const home = fs.mkdtempSync(join(tmpdir(), "alljobs-monitoring-store-"));
  homes.push(home);
  return { home, root: join(home, "state", "monitoring") };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (homes.length > 0) {
    const home = homes.pop();
    if (home) fs.rmSync(home, { recursive: true, force: true });
  }
});

function snapshotForCycle(cycleId: string, overrides: Record<string, unknown> = {}): MonitoringSnapshot {
  return buildMonitoringSnapshot({ cycle_id: cycleId, ...overrides });
}

const FORBIDDEN_KEY = /token|secret|authorization|header|raw|body|content|environment|env|log/i;

export function assertNoForbiddenKeys(value: unknown, path = "$"): void {
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

describe("publishCycle / readCurrentProjection", () => {
  it("writes a complete immutable generation and reads it back through the index", () => {
    const { root } = tempHome();
    const first = snapshotForCycle(CYCLE_A);
    const second = snapshotForCycle(CYCLE_A, {
      project: "petcare-app",
      binding_id: "neon-production-db",
      provider: "neon"
    });

    const index = publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [first, second] });

    expect(index.schema_version).toBe(1);
    expect(index.cycle_id).toBe(CYCLE_A);
    expect(index.status).toBe("complete");
    expect(index.previous_cycle_id).toBeNull();
    expect(index.projects.map((p) => p.project)).toEqual(["petcare-app", "talentvault"]);

    const generationPath = generationFile(root, CYCLE_A, "talentvault", "railway-production-api");
    expect(fs.existsSync(generationPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(generationPath, "utf8"))).toEqual(first);

    const projection = readCurrentProjection(root);
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    expect(projection.value.index.cycle_id).toBe(CYCLE_A);
    expect(projection.value.snapshots).toHaveLength(2);
    expect(projection.value.snapshots).toContainEqual(first);
  });

  it("publishes every generation file before the atomic index switch and leaves no temp files", () => {
    const { root } = tempHome();
    renameLog.targets.length = 0;

    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_A)] });

    // The index rename is the visibility boundary: it must be the last rename.
    expect(renameLog.targets.length).toBeGreaterThanOrEqual(2);
    expect(renameLog.targets[renameLog.targets.length - 1]).toBe(join(root, "current", "index.json"));
    expect(renameLog.targets.slice(0, -1).every((target) => target.includes("generations"))).toBe(true);
    for (const file of walkFiles(root)) {
      expect(file).not.toMatch(/\.tmp-/);
    }
  });

  it("marks a cycle with any failed collector as partially_complete", () => {
    const { root } = tempHome();
    const failed = snapshotForCycle(CYCLE_A, {
      project: "petcare-app",
      binding_id: "neon-production-db",
      provider: "neon",
      collector: buildCollectorSignal({ state: "timeout" }),
      attention: "unknown"
    });
    const index = publishCycle(root, {
      cycle_id: CYCLE_A,
      collected_at: FIXTURE_NOW,
      snapshots: [snapshotForCycle(CYCLE_A), failed]
    });
    expect(index.status).toBe("partially_complete");
  });

  it("derives project attention as the highest-precedence binding attention", () => {
    const { root } = tempHome();
    const healthy = snapshotForCycle(CYCLE_A);
    const critical = snapshotForCycle(CYCLE_A, {
      project: "petcare-app",
      binding_id: "neon-production-db",
      provider: "neon",
      attention: "critical"
    });
    const index = publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [healthy, critical] });
    expect(index.projects.find((p) => p.project === "petcare-app")?.attention).toBe("critical");
    expect(index.projects.find((p) => p.project === "talentvault")?.attention).toBe("healthy");
  });

  it("a torn new cycle cannot erase the prior readable generation", () => {
    const { root } = tempHome();
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_A)] });

    // Simulate a torn next cycle: the generation directory cannot even be
    // created (a stray file sits where the directory belongs), so the write
    // fails partway. The previous generation must remain fully readable.
    fs.mkdirSync(join(root, "current", "generations"), { recursive: true });
    fs.writeFileSync(join(root, "current", "generations", CYCLE_B), "torn");
    expect(() =>
      publishCycle(root, { cycle_id: CYCLE_B, collected_at: "2026-09-11T07:00:00Z", snapshots: [snapshotForCycle(CYCLE_B)] })
    ).toThrow();

    const projection = readCurrentProjection(root);
    expect(projection.ok).toBe(true);
    if (projection.ok) expect(projection.value.index.cycle_id).toBe(CYCLE_A);
  });

  it("rejects a corrupt or unparseable index without touching prior data", () => {
    const { root } = tempHome();
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_A)] });
    const indexFile = join(root, "current", "index.json");

    fs.writeFileSync(indexFile, "{ not json");
    let result = readCurrentIndex(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("index_unparseable");

    fs.writeFileSync(indexFile, JSON.stringify({ schema_version: 2, cycle_id: CYCLE_A }));
    result = readCurrentIndex(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("index_invalid");

    const missing = tempHome();
    const missingResult = readCurrentIndex(missing.root);
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok) expect(missingResult.issue.code).toBe("index_missing");
  });

  it("rejects an index whose referenced snapshot is missing", () => {
    const { root } = tempHome();
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_A)] });
    fs.rmSync(generationFile(root, CYCLE_A, "talentvault", "railway-production-api"));

    const projection = readCurrentProjection(root);
    expect(projection.ok).toBe(false);
    if (!projection.ok) expect(projection.issue.code).toBe("snapshot_missing");
  });

  it("rejects duplicate bindings and snapshots from another cycle", () => {
    const { root } = tempHome();
    expect(() =>
      publishCycle(root, {
        cycle_id: CYCLE_A,
        collected_at: FIXTURE_NOW,
        snapshots: [snapshotForCycle(CYCLE_A), snapshotForCycle(CYCLE_A)]
      })
    ).toThrow(/duplicate/i);
    expect(() =>
      publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_B)] })
    ).toThrow(/cycle/i);
  });
});

describe("last-trustworthy-value preservation", () => {
  it("carries previous signal values into a failed cycle's snapshot", () => {
    const { root } = tempHome();
    const previous = snapshotForCycle(CYCLE_A);
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [previous] });

    const retained = buildRetainedSnapshot(previous, {
      cycle_id: CYCLE_B,
      attempted_at: "2026-09-11T07:00:00Z",
      collector: buildCollectorSignal({ state: "timeout", attempted_at: "2026-09-11T07:00:00Z" }),
      freshness: previous.freshness,
      attention: "unknown",
      reasons: [
        {
          code: "collection_delayed",
          dimension: "freshness",
          severity: "watch",
          summary: "Collection timed out; showing the last trustworthy value.",
          observed_at: "2026-09-11T07:00:00Z"
        }
      ]
    });
    publishCycle(root, { cycle_id: CYCLE_B, collected_at: "2026-09-11T07:00:00Z", snapshots: [retained] });

    const projection = readCurrentProjection(root);
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    const current = projection.value.snapshots[0];
    expect(current.cycle_id).toBe(CYCLE_B);
    expect(current.collector.state).toBe("timeout");
    expect(projection.value.index.previous_cycle_id).toBe(CYCLE_A);
    // Retained last trustworthy signals:
    expect(current.deployment).toEqual(previous.deployment);
    expect(current.runtime).toEqual(previous.runtime);
    expect(current.usage).toEqual(previous.usage);
    expect(current.platform_incident).toEqual(previous.platform_incident);
  });
});

describe("cleanupGenerations", () => {
  it("keeps only the active and previous generations after the index boundary", () => {
    const { root } = tempHome();
    for (const cycle of [CYCLE_A, CYCLE_B, CYCLE_C]) {
      publishCycle(root, { cycle_id: cycle, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(cycle)] });
    }
    const result = cleanupGenerations(root);
    expect(result.issues).toEqual([]);
    expect(result.removed).toEqual([CYCLE_A]);
    expect(fs.readdirSync(join(root, "current", "generations")).sort()).toEqual([CYCLE_B, CYCLE_C]);
  });

  it("refuses to delete anything when the index is corrupt (visibility boundary)", () => {
    const { root } = tempHome();
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_A)] });
    publishCycle(root, { cycle_id: CYCLE_B, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_B)] });
    fs.writeFileSync(join(root, "current", "index.json"), "garbage");

    const result = cleanupGenerations(root);
    expect(result.removed).toEqual([]);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(fs.readdirSync(join(root, "current", "generations")).sort()).toEqual([CYCLE_A, CYCLE_B]);
  });

  it("skips unexpected names and symlinks instead of deleting them", () => {
    const { root, home } = tempHome();
    publishCycle(root, { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_A)] });
    publishCycle(root, { cycle_id: CYCLE_B, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_B)] });
    const generationsDir = join(root, "current", "generations");

    fs.mkdirSync(join(generationsDir, "not a cycle"));
    const outside = join(home, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(join(outside, "keep.txt"), "do not delete");
    fs.symlinkSync(outside, join(generationsDir, CYCLE_C));

    const result = cleanupGenerations(root);
    expect(result.removed).toEqual([]);
    expect(result.issues.map((i) => i.code).sort()).toEqual(["unexpected_entry", "unsafe_path"]);
    expect(fs.existsSync(join(outside, "keep.txt"))).toBe(true);
    expect(fs.lstatSync(join(generationsDir, CYCLE_C)).isSymbolicLink()).toBe(true);
  });
});

describe("path safety", () => {
  it("rejects arbitrary roots, unresolved variables, and tilde paths", () => {
    const { home, root } = tempHome();
    const input = { cycle_id: CYCLE_A, collected_at: FIXTURE_NOW, snapshots: [snapshotForCycle(CYCLE_A)] };
    expect(() => publishCycle("/", input)).toThrow();
    expect(() => publishCycle(home, input)).toThrow(); // not <home>/state/monitoring
    expect(() => publishCycle("~/state/monitoring", input)).toThrow();
    expect(() => publishCycle("$ALLJOBS_HOME/state/monitoring", input)).toThrow();
    expect(() => publishCycle("relative/state/monitoring", input)).toThrow();
    expect(() => readCurrentIndex("/")).toThrow();
    expect(() => cleanupGenerations("/")).toThrow();
    expect(() => generationFile(root, "../escape", "talentvault", "railway-production-api")).toThrow();
    expect(() => generationFile(root, CYCLE_A, "..", "railway-production-api")).toThrow();
    expect(() => generationFile(root, CYCLE_A, "talentvault", "../x")).toThrow();
  });
});

describe("serialized artifacts", () => {
  it("contain normalized metadata only (recursive forbidden-key scan)", () => {
    const { root } = tempHome();
    publishCycle(root, {
      cycle_id: CYCLE_A,
      collected_at: FIXTURE_NOW,
      snapshots: [
        snapshotForCycle(CYCLE_A),
        snapshotForCycle(CYCLE_A, { project: "petcare-app", binding_id: "neon-production-db", provider: "neon" })
      ]
    });
    const files = walkFiles(root);
    expect(files.length).toBeGreaterThanOrEqual(3); // index + 2 generation files
    for (const file of files) {
      assertNoForbiddenKeys(JSON.parse(fs.readFileSync(file, "utf8")), file);
    }
  });
});
