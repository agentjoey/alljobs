import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { z } from "zod";
import {
  attentionLevelSchema,
  monitoringProviderSchema,
  monitoringSnapshotSchema
} from "../domain/schemas";
import type { AttentionLevel, MonitoringSnapshot } from "../domain/types";
import {
  assertCycleId,
  CYCLE_ID_PATTERN,
  generationFile,
  monitoringPaths,
  PROJECT_SLUG_PATTERN
} from "./paths";

// Atomic current projection (design §10.1). A cycle writes one complete
// immutable generation under current/generations/<cycle-id>/ via temporary
// sibling files and atomic renames; current/index.json is written last, also
// atomically, and is the visibility boundary for the whole cycle. A torn or
// corrupt new cycle therefore can never erase the prior readable generation.
// Only the active and immediately previous generations are retained for safe
// pointer replacement and recovery.

export class MonitoringStoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MonitoringStoreError";
    this.code = code;
  }
}

export interface StoreIssue {
  code:
    | "index_missing"
    | "index_unreadable"
    | "index_unparseable"
    | "index_invalid"
    | "snapshot_missing"
    | "snapshot_unparseable"
    | "snapshot_invalid"
    | "snapshot_mismatch"
    | "unexpected_entry"
    | "unsafe_path"
    | "write_failed";
  message: string;
}

export type StoreReadResult<T> = { ok: true; value: T } | { ok: false; issue: StoreIssue };

function fail<T>(code: StoreIssue["code"], message: string): StoreReadResult<T> {
  return { ok: false, issue: { code, message } };
}

const isoTimestamp = z.iso.datetime({ offset: true });

const generationRefSchema = z
  .string()
  .max(400)
  .regex(
    /^generations\/[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9-]{1,64}\/[a-z0-9][a-z0-9-]{0,63}\.json$/,
    "generation references must stay inside current/generations/<cycle>/<project>/<binding>.json"
  );

export const monitoringIndexBindingSchema = z
  .object({
    binding_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    provider: monitoringProviderSchema,
    attention: attentionLevelSchema,
    generation: generationRefSchema
  })
  .strict();

export const monitoringIndexProjectSchema = z
  .object({
    project: z.string().regex(PROJECT_SLUG_PATTERN),
    attention: attentionLevelSchema,
    bindings: z.array(monitoringIndexBindingSchema).min(1).max(16)
  })
  .strict();

export const monitoringIndexSchema = z
  .object({
    schema_version: z.literal(1),
    cycle_id: z.string().regex(CYCLE_ID_PATTERN),
    status: z.enum(["complete", "partially_complete"]),
    collected_at: isoTimestamp,
    previous_cycle_id: z.string().regex(CYCLE_ID_PATTERN).nullable(),
    projects: z.array(monitoringIndexProjectSchema).max(256)
  })
  .strict();

export type MonitoringIndex = z.infer<typeof monitoringIndexSchema>;
export type MonitoringIndexProject = z.infer<typeof monitoringIndexProjectSchema>;
export type MonitoringIndexBinding = z.infer<typeof monitoringIndexBindingSchema>;

// Mirrors the attention precedence rank from the evaluator (design §8);
// duplicated here so the store never imports evaluation logic.
const SEVERITY_RANK: Record<AttentionLevel, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  watch: 3,
  healthy: 4
};

function worstAttention(levels: readonly AttentionLevel[]): AttentionLevel {
  return levels.reduce((worst, level) => (SEVERITY_RANK[level] < SEVERITY_RANK[worst] ? level : worst), "healthy");
}

/** Writes JSON through a temporary sibling file and an atomic rename. */
function writeJsonAtomic(file: string, value: unknown): void {
  const temp = `${file}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(temp, file);
}

/**
 * Publishes one immutable generation and switches the index last. Snapshots
 * must already be evaluated (attention/reasons/freshness set); the store only
 * persists normalized metadata. Partial cycles are explicit: any non-success
 * collector state marks the index `partially_complete`.
 */
export function publishCycle(
  root: string,
  input: { cycle_id: string; collected_at: string; snapshots: MonitoringSnapshot[] }
): MonitoringIndex {
  const paths = monitoringPaths(root);
  const cycleId = assertCycleId(input.cycle_id);
  const collectedAt = isoTimestamp.parse(input.collected_at);
  const snapshots = input.snapshots.map((snapshot) => monitoringSnapshotSchema.parse(snapshot));

  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    if (snapshot.cycle_id !== cycleId) {
      throw new MonitoringStoreError(
        "cycle_mismatch",
        `snapshot for ${snapshot.project}/${snapshot.binding_id} belongs to cycle '${snapshot.cycle_id}', not '${cycleId}'`
      );
    }
    const key = `${snapshot.project}/${snapshot.binding_id}`;
    if (seen.has(key)) {
      throw new MonitoringStoreError("duplicate_binding", `duplicate snapshot for ${key} in cycle '${cycleId}'`);
    }
    seen.add(key);
  }

  // Generation files first: each write is temp-sibling + atomic rename.
  for (const snapshot of snapshots) {
    const file = generationFile(paths.root, cycleId, snapshot.project, snapshot.binding_id);
    fs.mkdirSync(dirname(file), { recursive: true });
    try {
      writeJsonAtomic(file, snapshot);
    } catch (error) {
      throw new MonitoringStoreError(
        "generation_write_failed",
        `failed to write generation for ${snapshot.project}/${snapshot.binding_id}: ${(error as Error).message}`
      );
    }
  }

  const byProject = new Map<string, MonitoringSnapshot[]>();
  for (const snapshot of snapshots) {
    const list = byProject.get(snapshot.project) ?? [];
    list.push(snapshot);
    byProject.set(snapshot.project, list);
  }

  const previous = readCurrentIndex(paths.root);
  const index: MonitoringIndex = monitoringIndexSchema.parse({
    schema_version: 1,
    cycle_id: cycleId,
    status: snapshots.every((snapshot) => snapshot.collector.state === "success")
      ? "complete"
      : "partially_complete",
    collected_at: collectedAt,
    previous_cycle_id: previous.ok ? previous.value.cycle_id : null,
    projects: [...byProject.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([project, projectSnapshots]) => ({
        project,
        attention: worstAttention(projectSnapshots.map((snapshot) => snapshot.attention)),
        bindings: projectSnapshots
          .slice()
          .sort((a, b) => a.binding_id.localeCompare(b.binding_id))
          .map((snapshot) => ({
            binding_id: snapshot.binding_id,
            provider: snapshot.provider,
            attention: snapshot.attention,
            generation: `generations/${cycleId}/${project}/${snapshot.binding_id}.json`
          }))
      }))
  });

  // The index switch is the visibility boundary: it happens last, atomically.
  fs.mkdirSync(paths.currentDir, { recursive: true });
  try {
    writeJsonAtomic(paths.indexFile, index);
  } catch (error) {
    throw new MonitoringStoreError("index_write_failed", `failed to publish index: ${(error as Error).message}`);
  }
  return index;
}

/** Reads and strictly validates the current index; corrupt content is rejected. */
export function readCurrentIndex(root: string): StoreReadResult<MonitoringIndex> {
  const paths = monitoringPaths(root);
  if (!fs.existsSync(paths.indexFile)) {
    return fail("index_missing", "no monitoring index has been published yet");
  }
  let raw: string;
  try {
    raw = fs.readFileSync(paths.indexFile, "utf8");
  } catch (error) {
    return fail("index_unreadable", `cannot read monitoring index: ${(error as Error).message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("index_unparseable", "monitoring index is not valid JSON");
  }
  const parsed = monitoringIndexSchema.safeParse(json);
  if (!parsed.success) {
    return fail("index_invalid", `monitoring index failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }
  return { ok: true, value: parsed.data };
}

/**
 * Reads the index first, then every referenced snapshot, validating identity
 * along the way. Missing or invalid referenced snapshots reject the whole
 * projection rather than serving partial truth.
 */
export function readCurrentProjection(
  root: string
): StoreReadResult<{ index: MonitoringIndex; snapshots: MonitoringSnapshot[] }> {
  const indexResult = readCurrentIndex(root);
  if (!indexResult.ok) return indexResult;
  const index = indexResult.value;

  const snapshots: MonitoringSnapshot[] = [];
  for (const project of index.projects) {
    for (const binding of project.bindings) {
      const parts = binding.generation.split("/");
      if (parts[1] !== index.cycle_id || parts[2] !== project.project || parts[3] !== `${binding.binding_id}.json`) {
        return fail(
          "index_invalid",
          `generation reference '${binding.generation}' does not match its index identity`
        );
      }
      const file = generationFile(root, index.cycle_id, project.project, binding.binding_id);
      if (!fs.existsSync(file)) {
        return fail("snapshot_missing", `referenced snapshot is missing: ${binding.generation}`);
      }
      let json: unknown;
      try {
        json = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        return fail("snapshot_unparseable", `referenced snapshot is not valid JSON: ${binding.generation}`);
      }
      const parsed = monitoringSnapshotSchema.safeParse(json);
      if (!parsed.success) {
        return fail("snapshot_invalid", `referenced snapshot failed validation: ${binding.generation}`);
      }
      if (
        parsed.data.cycle_id !== index.cycle_id ||
        parsed.data.project !== project.project ||
        parsed.data.binding_id !== binding.binding_id
      ) {
        return fail("snapshot_mismatch", `referenced snapshot identity does not match: ${binding.generation}`);
      }
      snapshots.push(parsed.data);
    }
  }
  return { ok: true, value: { index, snapshots } };
}

/**
 * Builds the failed-cycle snapshot for a binding whose collection attempt
 * failed: the last trustworthy signal values are retained verbatim while the
 * cycle identity, attempt timestamp, collector evidence, and freshly evaluated
 * freshness/attention/reasons come from the caller (design §9).
 */
export function buildRetainedSnapshot(
  previous: MonitoringSnapshot,
  attempt: {
    cycle_id: string;
    attempted_at: string;
    collector: MonitoringSnapshot["collector"];
    freshness: MonitoringSnapshot["freshness"];
    attention: MonitoringSnapshot["attention"];
    reasons: MonitoringSnapshot["reasons"];
  }
): MonitoringSnapshot {
  const prior = monitoringSnapshotSchema.parse(previous);
  return monitoringSnapshotSchema.parse({
    ...prior,
    cycle_id: attempt.cycle_id,
    attempted_at: attempt.attempted_at,
    collector: attempt.collector,
    freshness: attempt.freshness,
    attention: attempt.attention,
    reasons: attempt.reasons
  });
}

/**
 * Retains only the active and immediately previous generation directories.
 * Cleanup runs only behind a valid index (the visibility boundary); corrupt
 * indexes, unexpected names, and symlinks produce issues and are never
 * deleted. Never accepts an arbitrary root — see resolveMonitoringRoot.
 */
export function cleanupGenerations(root: string): { removed: string[]; issues: StoreIssue[] } {
  const paths = monitoringPaths(root);
  const index = readCurrentIndex(paths.root);
  if (!index.ok) {
    return {
      removed: [],
      issues: [
        {
          code: index.issue.code,
          message: `cleanup refused: the visibility boundary is not readable (${index.issue.message})`
        }
      ]
    };
  }
  const keep = new Set(
    [index.value.cycle_id, index.value.previous_cycle_id].filter((cycle): cycle is string => cycle !== null)
  );

  const removed: string[] = [];
  const issues: StoreIssue[] = [];
  if (!fs.existsSync(paths.generationsDir)) return { removed, issues };
  const realGenerationsDir = fs.realpathSync(paths.generationsDir);

  for (const name of fs.readdirSync(paths.generationsDir)) {
    const full = join(paths.generationsDir, name);
    if (!CYCLE_ID_PATTERN.test(name)) {
      issues.push({ code: "unexpected_entry", message: `unexpected entry under current/generations: ${name}` });
      continue;
    }
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(full);
    } catch (error) {
      issues.push({ code: "unsafe_path", message: `cannot inspect generation '${name}': ${(error as Error).message}` });
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      issues.push({ code: "unsafe_path", message: `generation '${name}' is not a plain directory; left untouched` });
      continue;
    }
    if (resolve(fs.realpathSync(full)) !== resolve(realGenerationsDir + sep + name)) {
      issues.push({ code: "unsafe_path", message: `generation '${name}' resolves outside the state root` });
      continue;
    }
    if (keep.has(name)) continue;
    try {
      fs.rmSync(full, { recursive: true });
      removed.push(name);
    } catch (error) {
      issues.push({ code: "write_failed", message: `failed to remove generation '${name}': ${(error as Error).message}` });
    }
  }
  removed.sort();
  return { removed, issues };
}
