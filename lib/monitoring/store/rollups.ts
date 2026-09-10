import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { billingAlignmentSchema, monitoringProviderSchema } from "../domain/schemas";
import type { MonitoringSnapshot, UsageMeasure } from "../domain/types";
import {
  assertMonthName,
  assertYearName,
  dailyRollupFile,
  hourlyRollupFile,
  monitoringPaths
} from "./paths";

// Bounded min/max/last/count rollups (design §10.3). Only numeric, available
// measures roll up, and only within one series identity:
// metric + unit + period semantics + billing alignment. Unlike units are never
// converted, and exact billing-aligned series are never combined with
// operational-only series.

const isoTimestamp = z.iso.datetime({ offset: true });

export const rollupRecordSchema = z
  .object({
    schema_version: z.literal(1),
    granularity: z.enum(["hourly", "daily"]),
    /** 'YYYY-MM-DDTHH' for hourly, 'YYYY-MM-DD' for daily. */
    bucket: z.string().max(16),
    project: z.string().regex(/^[a-z0-9-]{1,64}$/),
    binding_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    provider: monitoringProviderSchema,
    metric: z.string().min(1).max(64),
    unit: z.string().min(1).max(32),
    billing_alignment: billingAlignmentSchema,
    period_start: isoTimestamp,
    period_end: isoTimestamp,
    min: z.number().finite(),
    max: z.number().finite(),
    last: z.number().finite(),
    count: z.number().int().positive(),
    last_observed_at: isoTimestamp
  })
  .strict()
  .superRefine((record, ctx) => {
    const pattern = record.granularity === "hourly" ? /^\d{4}-\d{2}-\d{2}T\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(record.bucket)) {
      ctx.addIssue({
        code: "custom",
        path: ["bucket"],
        message: `${record.granularity} buckets must match ${pattern}`
      });
    }
  });

export type RollupRecord = z.infer<typeof rollupRecordSchema>;
export type RollupGranularity = RollupRecord["granularity"];

export interface RollupSample {
  project: string;
  binding_id: string;
  provider: MonitoringSnapshot["provider"];
  measure: UsageMeasure;
  /** Observation time that assigns the sample to a bucket. */
  observed_at: string;
}

/** Maps a snapshot's usage measures to rollup samples keyed by provider_reported_at. */
export function samplesFromSnapshot(snapshot: MonitoringSnapshot): RollupSample[] {
  return snapshot.usage.map((measure) => ({
    project: snapshot.project,
    binding_id: snapshot.binding_id,
    provider: snapshot.provider,
    measure,
    observed_at: measure.provider_reported_at
  }));
}

/** Series identity: identical metric/unit/period semantics plus billing alignment. */
function seriesKey(
  granularity: RollupGranularity,
  bucket: string,
  sample: RollupSample
): string {
  const measure = sample.measure;
  return [
    granularity,
    bucket,
    sample.project,
    sample.binding_id,
    measure.metric,
    measure.unit,
    measure.billing_alignment,
    measure.period_start,
    measure.period_end
  ].join("|");
}

function bucketOf(granularity: RollupGranularity, observedAt: string): string {
  isoTimestamp.parse(observedAt);
  return granularity === "hourly" ? observedAt.slice(0, 13) : observedAt.slice(0, 10);
}

/**
 * Builds rollup records from samples. Only available measures with a finite
 * numeric value participate; unavailable measures never synthesize values.
 * `last` is the most recently observed value in the bucket (ties broken by
 * input order). Output is sorted by series identity for determinism.
 */
export function buildRollups(samples: RollupSample[], granularity: RollupGranularity): RollupRecord[] {
  const groups = new Map<string, { sample: RollupSample; bucket: string; points: { value: number; observed_at: string }[] }>();

  for (const sample of samples) {
    const measure = sample.measure;
    if (measure.availability !== "available" || measure.value === undefined || !Number.isFinite(measure.value)) {
      continue;
    }
    const bucket = bucketOf(granularity, sample.observed_at);
    const key = seriesKey(granularity, bucket, sample);
    const group = groups.get(key) ?? { sample, bucket, points: [] };
    group.points.push({ value: measure.value, observed_at: sample.observed_at });
    groups.set(key, group);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => {
      const values = group.points.map((point) => point.value);
      const last = group.points.reduce((latest, point) =>
        point.observed_at >= latest.observed_at ? point : latest
      );
      return rollupRecordSchema.parse({
        schema_version: 1,
        granularity,
        bucket: group.bucket,
        project: group.sample.project,
        binding_id: group.sample.binding_id,
        provider: group.sample.provider,
        metric: group.sample.measure.metric,
        unit: group.sample.measure.unit,
        billing_alignment: group.sample.measure.billing_alignment,
        period_start: group.sample.measure.period_start,
        period_end: group.sample.measure.period_end,
        min: Math.min(...values),
        max: Math.max(...values),
        last: last.value,
        count: values.length,
        last_observed_at: last.observed_at
      });
    });
}

/** Identity used to upsert a record within its rollup file. */
function recordIdentity(record: RollupRecord): string {
  return [
    record.granularity,
    record.bucket,
    record.project,
    record.binding_id,
    record.metric,
    record.unit,
    record.billing_alignment,
    record.period_start,
    record.period_end
  ].join("|");
}

/** Writes lines through a temporary sibling file and an atomic rename. */
function writeLinesAtomic(file: string, lines: string[]): void {
  const temp = `${file}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  fs.writeFileSync(temp, lines.join("\n") + "\n");
  fs.renameSync(temp, file);
}

/**
 * Writes rollup records to their bounded files: hourly records land in
 * rollups/hourly/<YYYY-MM of bucket>.jsonl, daily records in
 * rollups/daily/<YYYY of bucket>.jsonl. Existing records with the same series
 * identity are replaced (upsert), so re-writing a bucket never duplicates.
 * Unparseable pre-existing lines are preserved verbatim, never discarded.
 */
export function writeRollups(root: string, records: RollupRecord[]): { files: string[] } {
  const paths = monitoringPaths(root);
  const parsed = records.map((record) => rollupRecordSchema.parse(record));

  const byFile = new Map<string, RollupRecord[]>();
  for (const record of parsed) {
    const file =
      record.granularity === "hourly"
        ? hourlyRollupFile(paths.root, assertMonthName(record.bucket.slice(0, 7)))
        : dailyRollupFile(paths.root, assertYearName(record.bucket.slice(0, 4)));
    const list = byFile.get(file) ?? [];
    list.push(record);
    byFile.set(file, list);
  }

  const files: string[] = [];
  for (const [file, newRecords] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    fs.mkdirSync(dirname(file), { recursive: true });
    const replacementKeys = new Set(newRecords.map(recordIdentity));
    const keptRaw: string[] = [];
    const keptRecords: RollupRecord[] = [];
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (line.length === 0) continue;
        try {
          const record = rollupRecordSchema.parse(JSON.parse(line));
          if (!replacementKeys.has(recordIdentity(record))) keptRecords.push(record);
        } catch {
          keptRaw.push(line); // never discard unparseable data
        }
      }
    }
    const all = [...keptRecords, ...newRecords].sort((a, b) => recordIdentity(a).localeCompare(recordIdentity(b)));
    writeLinesAtomic(file, [...keptRaw, ...all.map((record) => JSON.stringify(record))]);
    files.push(file);
  }
  return { files };
}
