import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMonitoringSnapshot, buildUsageMeasure, FIXTURE_OBSERVED } from "../domain/fixtures";
import type { UsageMeasure } from "../domain/types";
import { buildRollups, rollupRecordSchema, samplesFromSnapshot, writeRollups, type RollupSample } from "./rollups";

// Rollups are bounded min/max/last/count statistics over numeric measures with
// identical metric/unit/period semantics. Billing alignment is part of the
// series identity: exact and operational-only series are never combined.

const homes: string[] = [];

function tempRoot(): string {
  const home = fs.mkdtempSync(join(tmpdir(), "alljobs-monitoring-rollups-"));
  homes.push(home);
  return join(home, "state", "monitoring");
}

afterEach(() => {
  while (homes.length > 0) {
    const home = homes.pop();
    if (home) fs.rmSync(home, { recursive: true, force: true });
  }
});

function sample(measureOverrides: Record<string, unknown> = {}, observedAt = FIXTURE_OBSERVED): RollupSample {
  return {
    project: "talentvault",
    binding_id: "railway-production-api",
    provider: "railway",
    measure: buildUsageMeasure(measureOverrides),
    observed_at: observedAt
  };
}

function measure(overrides: Record<string, unknown> = {}): UsageMeasure {
  return buildUsageMeasure(overrides);
}

describe("buildRollups", () => {
  it("computes hourly min/max/last/count over numeric measures in one bucket", () => {
    const records = buildRollups(
      [
        sample({ value: 10 }, "2026-09-11T05:59:00Z"),
        sample({ value: 30 }, "2026-09-11T05:10:00Z"),
        sample({ value: 20 }, "2026-09-11T05:40:00Z")
      ],
      "hourly"
    );
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.granularity).toBe("hourly");
    expect(record.bucket).toBe("2026-09-11T05");
    expect(record.min).toBe(10);
    expect(record.max).toBe(30);
    expect(record.count).toBe(3);
    // last is the most recently observed value, not the last in input order.
    expect(record.last).toBe(10);
    expect(record.last_observed_at).toBe("2026-09-11T05:59:00Z");
  });

  it("computes daily buckets", () => {
    const records = buildRollups(
      [sample({ value: 5 }, "2026-09-11T05:59:00Z"), sample({ value: 7 }, "2026-09-11T23:00:00Z")],
      "daily"
    );
    expect(records).toHaveLength(1);
    expect(records[0].bucket).toBe("2026-09-11");
    expect(records[0].min).toBe(5);
    expect(records[0].max).toBe(7);
    expect(records[0].count).toBe(2);
  });

  it("skips unavailable measures and never synthesizes values", () => {
    const records = buildRollups(
      [
        sample({ availability: "not_available", value: undefined, allowance: undefined }),
        sample({ value: 3 })
      ],
      "hourly"
    );
    expect(records).toHaveLength(1);
    expect(records[0].count).toBe(1);
    expect(records[0].last).toBe(3);
  });

  it("never combines unlike units, periods, or billing alignments", () => {
    const records = buildRollups(
      [
        sample({ value: 1 }),
        sample({ value: 2, metric: "memory_mb", unit: "mb" }),
        sample({ value: 4, period_start: "2026-08-01T00:00:00Z", period_end: "2026-09-01T00:00:00Z" }),
        sample({ value: 8, billing_alignment: "exact", cost: 0.08, currency: "USD" })
      ],
      "hourly"
    );
    expect(records).toHaveLength(4);
    const keys = records.map((r) => [r.metric, r.unit, r.billing_alignment, r.period_start]);
    expect(new Set(keys.map((k) => JSON.stringify(k))).size).toBe(4);
    // Each series keeps its own billing alignment verbatim.
    expect(records.find((r) => r.billing_alignment === "exact")?.count).toBe(1);
    expect(records.filter((r) => r.billing_alignment === "operational_only")).toHaveLength(3);
  });

  it("normalizes offset timestamps to UTC so one real hour is one bucket", () => {
    // '2026-09-11T23:30:00+08:00' is 15:30Z: the same real hour as 15:45Z.
    const records = buildRollups(
      [
        sample({ value: 10 }, "2026-09-11T23:30:00+08:00"),
        sample({ value: 20 }, "2026-09-11T15:45:00Z")
      ],
      "hourly"
    );
    expect(records).toHaveLength(1);
    expect(records[0].bucket).toBe("2026-09-11T15");
    expect(records[0].min).toBe(10);
    expect(records[0].max).toBe(20);
    expect(records[0].count).toBe(2);
  });

  it("normalizes offset timestamps to UTC so one real day is one bucket", () => {
    // '2026-09-12T07:30:00+08:00' is 2026-09-11T23:30Z: the same real day as 2026-09-11.
    const records = buildRollups(
      [sample({ value: 5 }, "2026-09-12T07:30:00+08:00"), sample({ value: 7 }, "2026-09-11T05:00:00Z")],
      "daily"
    );
    expect(records).toHaveLength(1);
    expect(records[0].bucket).toBe("2026-09-11");
    expect(records[0].count).toBe(2);
  });

  it("picks last by real time across mixed offsets, keeping the original observed_at", () => {
    // Both points fall in the real hour 13Z; string order would wrongly prefer
    // the '+02:00' literal, but 13:30Z is the truly latest observation.
    const records = buildRollups(
      [
        sample({ value: 10 }, "2026-09-11T13:20:00Z"),
        sample({ value: 99 }, "2026-09-11T15:30:00+02:00") // = 13:30Z
      ],
      "hourly"
    );
    expect(records).toHaveLength(1);
    expect(records[0].bucket).toBe("2026-09-11T13");
    expect(records[0].last).toBe(99);
    // last_observed_at keeps the provider's original timestamp verbatim.
    expect(records[0].last_observed_at).toBe("2026-09-11T15:30:00+02:00");
  });

  it("splits buckets at the hour boundary", () => {
    const records = buildRollups(
      [sample({ value: 1 }, "2026-09-11T05:59:59Z"), sample({ value: 2 }, "2026-09-11T06:00:00Z")],
      "hourly"
    );
    expect(records.map((r) => r.bucket)).toEqual(["2026-09-11T05", "2026-09-11T06"]);
  });
});

describe("samplesFromSnapshot", () => {
  it("maps snapshot usage measures to samples keyed by provider_reported_at", () => {
    const snapshot = buildMonitoringSnapshot({
      usage: [measure({ value: 1 }), measure({ metric: "network_bytes", unit: "bytes", value: 2048, allowance: undefined })]
    });
    const samples = samplesFromSnapshot(snapshot);
    expect(samples).toHaveLength(2);
    expect(samples[0].observed_at).toBe(snapshot.usage[0].provider_reported_at);
    expect(samples[0].project).toBe(snapshot.project);
    expect(samples[0].binding_id).toBe(snapshot.binding_id);
  });
});

describe("writeRollups", () => {
  it("writes hourly records to the bucket month file and daily records to the year file", () => {
    const root = tempRoot();
    const hourly = buildRollups([sample({ value: 10 }), sample({ value: 20 }, "2026-09-11T05:20:00Z")], "hourly");
    const daily = buildRollups([sample({ value: 10 }), sample({ value: 20 }, "2026-09-11T05:20:00Z")], "daily");
    const { files } = writeRollups(root, [...hourly, ...daily]);

    const hourlyFile = join(root, "rollups", "hourly", "2026-09.jsonl");
    const dailyFile = join(root, "rollups", "daily", "2026.jsonl");
    expect(files).toContain(hourlyFile);
    expect(files).toContain(dailyFile);

    const hourlyLines = fs.readFileSync(hourlyFile, "utf8").trim().split("\n");
    expect(hourlyLines).toHaveLength(1);
    const parsed = rollupRecordSchema.parse(JSON.parse(hourlyLines[0]));
    expect(parsed.granularity).toBe("hourly");
    expect(parsed.count).toBe(2);

    const dailyLines = fs.readFileSync(dailyFile, "utf8").trim().split("\n");
    expect(dailyLines).toHaveLength(1);
    expect(rollupRecordSchema.parse(JSON.parse(dailyLines[0])).granularity).toBe("daily");
  });

  it("upserts series identity on rewrite instead of duplicating records", () => {
    const root = tempRoot();
    const records = buildRollups([sample({ value: 10 })], "hourly");
    writeRollups(root, records);
    writeRollups(root, records);
    const file = join(root, "rollups", "hourly", "2026-09.jsonl");
    expect(fs.readFileSync(file, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("keeps unparseable pre-existing lines untouched", () => {
    const root = tempRoot();
    const dir = join(root, "rollups", "hourly");
    fs.mkdirSync(dir, { recursive: true });
    const file = join(dir, "2026-09.jsonl");
    fs.writeFileSync(file, "not json\n");
    writeRollups(root, buildRollups([sample({ value: 10 })], "hourly"));
    const content = fs.readFileSync(file, "utf8");
    expect(content).toContain("not json");
    expect(content.trim().split("\n")).toHaveLength(2);
  });

  it("contains normalized metadata only (recursive forbidden-key scan)", () => {
    const root = tempRoot();
    writeRollups(root, buildRollups([sample({ value: 10 })], "hourly"));
    const file = join(root, "rollups", "hourly", "2026-09.jsonl");
    for (const line of fs.readFileSync(file, "utf8").trim().split("\n")) {
      assertNoForbiddenKeysLocal(JSON.parse(line), file);
    }
  });

  it("rejects an unsafe root", () => {
    const records = buildRollups([sample({ value: 10 })], "hourly");
    expect(() => writeRollups("/", records)).toThrow();
    expect(() => writeRollups("$HOME/state/monitoring", records)).toThrow();
  });
});

const FORBIDDEN_KEY = /token|secret|authorization|header|raw|body|content|environment|env|log/i;

function assertNoForbiddenKeysLocal(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeysLocal(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      expect(key, `forbidden key at ${path}`).not.toMatch(FORBIDDEN_KEY);
      assertNoForbiddenKeysLocal(entry, `${path}.${key}`);
    }
  }
}
