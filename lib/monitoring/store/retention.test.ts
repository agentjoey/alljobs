import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HOURLY_RETENTION_DAYS,
  HISTORY_RETENTION_MONTHS,
  runRetention
} from "./retention";

// Retention: 90 days of hourly rollups, 13 months of daily rollups and
// transition events. Cleanup touches only explicit validated filenames under
// the resolved monitoring state root, and any failure leaves data in place.

const NOW = "2026-09-11T06:00:00Z";

const homes: string[] = [];

function tempRoot(): { home: string; root: string } {
  const home = fs.mkdtempSync(join(tmpdir(), "alljobs-monitoring-retention-"));
  homes.push(home);
  return { home, root: join(home, "state", "monitoring") };
}

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop();
    if (home) {
      // Restore any permissions tightened by failure-injection tests.
      try {
        fs.chmodSync(join(home, "state", "monitoring", "rollups", "hourly"), 0o755);
      } catch {
        /* directory may not exist */
      }
      fs.rmSync(home, { recursive: true, force: true });
    }
  }
});

function hourlyLine(bucket: string): string {
  return JSON.stringify({
    schema_version: 1,
    granularity: "hourly",
    bucket,
    project: "talentvault",
    binding_id: "railway-production-api",
    provider: "railway",
    metric: "cpu_seconds",
    unit: "cpu_seconds",
    billing_alignment: "operational_only",
    period_start: "2026-09-01T00:00:00Z",
    period_end: "2026-10-01T00:00:00Z",
    min: 1,
    max: 2,
    last: 2,
    count: 2,
    last_observed_at: `${bucket}:00:00Z`
  });
}

function dailyLine(bucket: string): string {
  return JSON.stringify({ ...JSON.parse(hourlyLine("2026-09-11T05")), granularity: "daily", bucket });
}

function eventLine(recordedAt: string): string {
  return JSON.stringify({
    schema_version: 1,
    type: "attention",
    project: "talentvault",
    binding_id: "railway-production-api",
    provider: "railway",
    dimension: "freshness",
    key: "attention",
    previous: "healthy",
    new: "watch",
    observed_at: recordedAt,
    recorded_at: recordedAt,
    provenance: { cycle_id: "2026-09-11t06-00-00z", adapter_version: "1.0.0" }
  });
}

function writeLines(file: string, lines: string[]): void {
  fs.mkdirSync(join(file, ".."), { recursive: true });
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

describe("runRetention", () => {
  it("prunes hourly rollup lines older than 90 days and keeps the boundary", () => {
    const { root } = tempRoot();
    // Cutoff: NOW - 90 days = 2026-06-13T06:00:00Z.
    const file = join(root, "rollups", "hourly", "2026-09.jsonl");
    writeLines(file, [
      hourlyLine("2026-06-12T05"), // 91 days old: pruned
      hourlyLine("2026-06-13T06"), // exactly 90 days: kept
      hourlyLine("2026-09-11T05") // current: kept
    ]);
    const result = runRetention(root, NOW);
    expect(result.issues).toEqual([]);
    expect(result.pruned_files).toEqual([file]);
    const kept = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(kept).toHaveLength(2);
    expect(kept.join("\n")).not.toContain("2026-06-12");
    expect(kept.join("\n")).toContain("2026-06-13T06");
  });

  it("deletes an hourly file once every line has expired", () => {
    const { root } = tempRoot();
    const file = join(root, "rollups", "hourly", "2026-06.jsonl");
    writeLines(file, [hourlyLine("2026-06-01T00"), hourlyLine("2026-06-10T23")]);
    const result = runRetention(root, NOW);
    expect(result.removed_files).toEqual([file]);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("prunes daily rollups and events older than 13 months", () => {
    const { root } = tempRoot();
    // Cutoff: 2025-08-11T06:00:00Z.
    const dailyFile = join(root, "rollups", "daily", "2025.jsonl");
    writeLines(dailyFile, [dailyLine("2025-08-10"), dailyLine("2025-08-12")]);
    const eventsFile = join(root, "events", "2025-08.jsonl");
    writeLines(eventsFile, [eventLine("2025-08-01T00:00:00Z"), eventLine("2025-09-01T00:00:00Z")]);

    const result = runRetention(root, NOW);
    expect(result.issues).toEqual([]);
    expect(result.pruned_files.sort()).toEqual([dailyFile, eventsFile].sort());
    expect(fs.readFileSync(dailyFile, "utf8")).toContain("2025-08-12");
    expect(fs.readFileSync(dailyFile, "utf8")).not.toContain("2025-08-10");
    expect(fs.readFileSync(eventsFile, "utf8")).toContain("2025-09-01");
    expect(fs.readFileSync(eventsFile, "utf8")).not.toContain("2025-08-01");
  });

  it("leaves recent files untouched", () => {
    const { root } = tempRoot();
    const file = join(root, "events", "2026-09.jsonl");
    writeLines(file, [eventLine("2026-09-10T00:00:00Z")]);
    const before = fs.readFileSync(file, "utf8");
    const result = runRetention(root, NOW);
    expect(result.pruned_files).toEqual([]);
    expect(result.removed_files).toEqual([]);
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  it("reports unexpected filenames instead of deleting them", () => {
    const { root } = tempRoot();
    const dir = join(root, "rollups", "hourly");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(join(dir, "notes.txt"), "human note");
    fs.writeFileSync(join(dir, "2026-13.jsonl"), hourlyLine("2026-06-01T00") + "\n");

    const result = runRetention(root, NOW);
    expect(result.issues.map((i) => i.code)).toEqual(["unexpected_entry", "unexpected_entry"]);
    expect(fs.existsSync(join(dir, "notes.txt"))).toBe(true);
    expect(fs.existsSync(join(dir, "2026-13.jsonl"))).toBe(true);
  });

  it("never follows or deletes symlink escapes", () => {
    const { home, root } = tempRoot();
    const outside = join(home, "outside.jsonl");
    fs.writeFileSync(outside, eventLine("2020-01-01T00:00:00Z") + "\n");
    const dir = join(root, "events");
    fs.mkdirSync(dir, { recursive: true });
    fs.symlinkSync(outside, join(dir, "2020-01.jsonl"));

    const result = runRetention(root, NOW);
    expect(result.issues.map((i) => i.code)).toEqual(["unsafe_path"]);
    expect(fs.readFileSync(outside, "utf8")).toContain("2020-01-01");
    expect(fs.lstatSync(join(dir, "2020-01.jsonl")).isSymbolicLink()).toBe(true);
  });

  it("keeps unparseable lines and reports them instead of discarding data", () => {
    const { root } = tempRoot();
    const file = join(root, "events", "2026-09.jsonl");
    writeLines(file, [eventLine("2020-01-01T00:00:00Z"), "{ corrupt"]);
    const result = runRetention(root, NOW);
    expect(result.issues.map((i) => i.code)).toEqual(["unparseable_line"]);
    const kept = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(kept).toEqual(["{ corrupt"]);
  });

  it("a retention error leaves data intact and returns a normalized issue", () => {
    const { root } = tempRoot();
    const dir = join(root, "rollups", "hourly");
    const file = join(dir, "2026-06.jsonl");
    writeLines(file, [hourlyLine("2026-06-01T00")]);
    fs.chmodSync(dir, 0o555); // read-only directory: deletion must fail

    const result = runRetention(root, NOW);
    expect(result.issues.map((i) => i.code)).toEqual(["write_failed"]);
    expect(result.removed_files).toEqual([]);
    expect(fs.readFileSync(file, "utf8")).toContain("2026-06-01T00");
    fs.chmodSync(dir, 0o755);
  });

  it("rejects arbitrary roots, unresolved variables, globs, and tilde paths", () => {
    const { home } = tempRoot();
    expect(() => runRetention("/", NOW)).toThrow();
    expect(() => runRetention(home, NOW)).toThrow(); // not <home>/state/monitoring
    expect(() => runRetention("~/.alljobs/state/monitoring", NOW)).toThrow();
    expect(() => runRetention("$ALLJOBS_HOME/state/monitoring", NOW)).toThrow();
    expect(() => runRetention(join(home, "state", "monitoring", "*"), NOW)).toThrow();
  });

  it("exposes the retention policy constants", () => {
    expect(HOURLY_RETENTION_DAYS).toBe(90);
    expect(HISTORY_RETENTION_MONTHS).toBe(13);
  });
});
