import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { monitoringProviderSchema, signalDimensionSchema } from "../domain/schemas";
import type { MonitoringSnapshot, UsageMeasure } from "../domain/types";
import { assertMonthName, CYCLE_ID_PATTERN, eventsFile, monitoringPaths } from "./paths";

// Transition events (design §9 and §10.2). Only material changes are appended:
// attention, signal state, deployment identity, permission state, and quota
// band. Repeated identical failures update the current snapshot's attempt
// metadata instead — the diff is empty, so no duplicate event is written.
// Events carry normalized metadata only: never raw responses, logs, request
// bodies, headers, credentials, environment values, or source content.

const isoTimestamp = z.iso.datetime({ offset: true });
const stateToken = z.string().min(1).max(160);

export const transitionEventSchema = z
  .object({
    schema_version: z.literal(1),
    type: z.enum(["attention", "signal_state", "deployment_identity", "permission_state", "quota_band"]),
    project: z.string().regex(/^[a-z0-9-]{1,64}$/),
    binding_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    provider: monitoringProviderSchema,
    dimension: signalDimensionSchema,
    /** Series key: the dimension name, or 'metric|unit|period_start|period_end|billing_alignment' for quota bands. */
    key: stateToken,
    previous: stateToken.nullable(),
    new: stateToken,
    reason_code: z
      .string()
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/)
      .optional(),
    deployment_id: z.string().min(1).max(128).optional(),
    revision: z.string().min(1).max(128).optional(),
    observed_at: isoTimestamp,
    recorded_at: isoTimestamp,
    provenance: z
      .object({
        cycle_id: z.string().regex(CYCLE_ID_PATTERN),
        adapter_version: z.string().min(1).max(32)
      })
      .strict()
  })
  .strict();

export type TransitionEvent = z.infer<typeof transitionEventSchema>;

const PERMISSION_STATES = new Set(["authentication_failed", "permission_denied"]);

export type QuotaBand = "below_75" | "watch_75_90" | "near_90_100" | "exhausted_100";

/**
 * Deterministic quota band for a measure with a known allowance, using the
 * same 75/90/100 boundaries as the attention evaluator. Returns null when no
 * allowance (and therefore no band) exists. Bands are never computed across
 * unlike units or billing alignments — those are separate series keys.
 */
export function quotaBand(measure: UsageMeasure): QuotaBand | null {
  if (measure.allowance === undefined || measure.value === undefined) return null;
  if (!Number.isFinite(measure.value) || !Number.isFinite(measure.allowance)) return null;
  if (measure.allowance === 0) return measure.value > 0 ? "exhausted_100" : "below_75";
  const percent = (measure.value * 100) / measure.allowance;
  if (percent >= 100) return "exhausted_100";
  if (percent >= 90) return "near_90_100";
  if (percent >= 75) return "watch_75_90";
  return "below_75";
}

/** Quota-band series identity: unlike units and alignments are never combined. */
function measureSeriesKey(measure: UsageMeasure): string {
  return [measure.metric, measure.unit, measure.period_start, measure.period_end, measure.billing_alignment].join("|");
}

function incidentToken(incident: MonitoringSnapshot["platform_incident"]): string {
  return incident ? `${incident.incident_id}:${incident.status}` : "none";
}

function deploymentIdentityToken(deployment: MonitoringSnapshot["deployment"]): string {
  if (!deployment) return "absent";
  return `${deployment.deployment_id ?? "-"}/${deployment.revision ?? "-"}`;
}

/**
 * Diffs two consecutive snapshots of the same binding into material transition
 * events. A first collection (previous === null) emits nothing: there is no
 * prior state to transition from. Output order is deterministic: attention,
 * signal states (deployment, runtime, platform_incident, collector),
 * deployment identity, permission state, then quota bands in measure order.
 */
export function diffTransitions(
  previous: MonitoringSnapshot | null,
  next: MonitoringSnapshot,
  recordedAt: string
): TransitionEvent[] {
  if (!previous) return [];
  isoTimestamp.parse(recordedAt);
  const events: TransitionEvent[] = [];
  const push = (
    event: Omit<TransitionEvent, "schema_version" | "project" | "binding_id" | "provider" | "recorded_at" | "provenance">
  ): void => {
    events.push(
      transitionEventSchema.parse({
        schema_version: 1,
        project: next.project,
        binding_id: next.binding_id,
        provider: next.provider,
        recorded_at: recordedAt,
        provenance: { cycle_id: next.cycle_id, adapter_version: next.adapter.version },
        ...event
      })
    );
  };

  // 1. Attention aggregate.
  if (previous.attention !== next.attention) {
    const leading = next.reasons[0] ?? previous.reasons[0];
    push({
      type: "attention",
      // Aggregate transitions are anchored to the leading reason's dimension;
      // 'collector' marks a collection-level change when no reason exists.
      dimension: leading?.dimension ?? "collector",
      key: "attention",
      previous: previous.attention,
      new: next.attention,
      reason_code: leading?.code,
      observed_at: next.attempted_at
    });
  }

  // 2. Signal states.
  const signalState = (
    dimension: "deployment" | "runtime" | "platform_incident",
    previousToken: string,
    nextToken: string,
    observedAt: string
  ): void => {
    if (previousToken !== nextToken) {
      push({ type: "signal_state", dimension, key: dimension, previous: previousToken, new: nextToken, observed_at: observedAt });
    }
  };
  signalState(
    "deployment",
    previous.deployment?.state ?? "absent",
    next.deployment?.state ?? "absent",
    next.deployment?.observed_at ?? next.attempted_at
  );
  signalState(
    "runtime",
    previous.runtime?.state ?? "absent",
    next.runtime?.state ?? "absent",
    next.runtime?.observed_at ?? next.attempted_at
  );
  signalState(
    "platform_incident",
    incidentToken(previous.platform_incident),
    incidentToken(next.platform_incident),
    next.platform_incident?.provider_reported_at ?? next.attempted_at
  );

  const previousPermission = PERMISSION_STATES.has(previous.collector.state) ? previous.collector.state : "ok";
  const nextPermission = PERMISSION_STATES.has(next.collector.state) ? next.collector.state : "ok";
  if (previous.collector.state !== next.collector.state && previousPermission === "ok" && nextPermission === "ok") {
    push({
      type: "signal_state",
      dimension: "collector",
      key: "collector.state",
      previous: previous.collector.state,
      new: next.collector.state,
      observed_at: next.attempted_at
    });
  }

  // 3. Deployment identity.
  if (deploymentIdentityToken(previous.deployment) !== deploymentIdentityToken(next.deployment)) {
    push({
      type: "deployment_identity",
      dimension: "deployment",
      key: "deployment.identity",
      previous: deploymentIdentityToken(previous.deployment),
      new: deploymentIdentityToken(next.deployment),
      deployment_id: next.deployment?.deployment_id,
      revision: next.deployment?.revision,
      observed_at: next.deployment?.observed_at ?? next.attempted_at
    });
  }

  // 4. Permission state (authentication/permission transitions only).
  if (previousPermission !== nextPermission) {
    push({
      type: "permission_state",
      dimension: "collector",
      key: "collector.permission",
      previous: previousPermission,
      new: nextPermission,
      reason_code: next.reasons.find((reason) => reason.dimension === "collector")?.code,
      observed_at: next.attempted_at
    });
  }

  // 5. Quota bands, keyed per series so unlike measures never share a band.
  const previousBands = new Map<string, QuotaBand>();
  for (const measure of previous.usage) {
    const band = quotaBand(measure);
    if (band !== null) previousBands.set(measureSeriesKey(measure), band);
  }
  for (const measure of next.usage) {
    const band = quotaBand(measure);
    if (band === null) continue;
    const key = measureSeriesKey(measure);
    const previousBand = previousBands.get(key) ?? null;
    if (previousBand !== band) {
      push({
        type: "quota_band",
        dimension: "usage",
        key,
        previous: previousBand,
        new: band,
        observed_at: measure.provider_reported_at
      });
    }
  }

  return events;
}

/** Writes lines through a temporary sibling file and an atomic rename. */
function writeLinesAtomic(file: string, lines: string[]): void {
  const temp = `${file}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  fs.writeFileSync(temp, lines.join("\n") + "\n");
  fs.renameSync(temp, file);
}

/**
 * Appends events to the monthly JSONL file for each event's recorded month.
 * The rewrite is atomic (temp sibling + rename); the single worker/lock
 * boundary serializes concurrent appenders.
 */
export function appendTransitionEvents(root: string, events: TransitionEvent[]): { files: string[] } {
  const paths = monitoringPaths(root);
  const parsed = events.map((event) => transitionEventSchema.parse(event));

  const byMonth = new Map<string, string[]>();
  for (const event of parsed) {
    const month = assertMonthName(event.recorded_at.slice(0, 7));
    const lines = byMonth.get(month) ?? [];
    lines.push(JSON.stringify(event));
    byMonth.set(month, lines);
  }

  const files: string[] = [];
  for (const [month, lines] of [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const file = eventsFile(paths.root, month);
    fs.mkdirSync(dirname(file), { recursive: true });
    const existing = fs.existsSync(file)
      ? fs.readFileSync(file, "utf8").split("\n").filter((line) => line.length > 0)
      : [];
    writeLinesAtomic(file, [...existing, ...lines]);
    files.push(file);
  }
  return { files };
}
