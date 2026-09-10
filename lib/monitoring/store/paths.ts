import { isAbsolute, join, resolve, sep } from "node:path";

// Explicit resolved paths for the approved monitoring cache tree (design §10):
//
//   <ALLJOBS_HOME>/state/monitoring/
//     current/index.json
//     current/generations/<cycle-id>/<project>/<binding-id>.json
//     events/YYYY-MM.jsonl
//     rollups/hourly/YYYY-MM.jsonl
//     rollups/daily/YYYY.jsonl
//     locks/collector.lock
//
// Every name component is validated against a closed pattern before it is
// joined, and the root must be the already-resolved
// '<ALLJOBS_HOME>/state/monitoring' directory: no arbitrary roots, no globs,
// no unresolved environment variables, no '~', never '/'.

export const CYCLE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const PROJECT_SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;
export const BINDING_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MONTH_NAME_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const YEAR_NAME_PATTERN = /^\d{4}$/;

export class MonitoringPathError extends Error {
  readonly code = "invalid_monitoring_path" as const;
  constructor(message: string) {
    super(message);
    this.name = "MonitoringPathError";
  }
}

/**
 * Resolves and validates the monitoring state root. The root must be absolute,
 * fully resolved (no '~', no '$VAR', no glob characters), and anchored at the
 * fixed 'state/monitoring' tail so cleanup can never be pointed at an
 * arbitrary directory such as '/' or a home directory.
 */
export function resolveMonitoringRoot(root: string): string {
  if (typeof root !== "string" || root.length === 0) {
    throw new MonitoringPathError("monitoring state root is required");
  }
  if (root.includes("~")) {
    throw new MonitoringPathError("monitoring state root must be fully resolved (no '~')");
  }
  if (/[$`*?[\]{}!]/.test(root)) {
    throw new MonitoringPathError("monitoring state root must not contain variables or glob characters");
  }
  if (!isAbsolute(root)) {
    throw new MonitoringPathError("monitoring state root must be an absolute, resolved path");
  }
  const resolved = resolve(root);
  const segments = resolved.split(sep).filter((part) => part.length > 0);
  if (
    segments.length < 2 ||
    segments[segments.length - 1] !== "monitoring" ||
    segments[segments.length - 2] !== "state"
  ) {
    throw new MonitoringPathError(
      "monitoring state root must be the resolved '<ALLJOBS_HOME>/state/monitoring' directory"
    );
  }
  return resolved;
}

function assertName(value: string, pattern: RegExp, kind: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new MonitoringPathError(`invalid ${kind} name: ${JSON.stringify(value)}`);
  }
  return value;
}

export const assertCycleId = (value: string): string => assertName(value, CYCLE_ID_PATTERN, "cycle");
export const assertProjectSlug = (value: string): string => assertName(value, PROJECT_SLUG_PATTERN, "project");
export const assertBindingId = (value: string): string => assertName(value, BINDING_ID_PATTERN, "binding");
export const assertMonthName = (value: string): string => assertName(value, MONTH_NAME_PATTERN, "month");
export const assertYearName = (value: string): string => assertName(value, YEAR_NAME_PATTERN, "year");

/** Joins validated name components under an already-resolved root. */
function joinUnder(resolvedRoot: string, ...segments: string[]): string {
  const joined = resolve(join(resolvedRoot, ...segments));
  if (!joined.startsWith(resolvedRoot + sep)) {
    throw new MonitoringPathError("resolved path escapes the monitoring state root");
  }
  return joined;
}

export interface MonitoringPaths {
  root: string;
  currentDir: string;
  indexFile: string;
  generationsDir: string;
  eventsDir: string;
  hourlyDir: string;
  dailyDir: string;
  locksDir: string;
  collectorLockFile: string;
}

export function monitoringPaths(root: string): MonitoringPaths {
  const resolved = resolveMonitoringRoot(root);
  return {
    root: resolved,
    currentDir: joinUnder(resolved, "current"),
    indexFile: joinUnder(resolved, "current", "index.json"),
    generationsDir: joinUnder(resolved, "current", "generations"),
    eventsDir: joinUnder(resolved, "events"),
    hourlyDir: joinUnder(resolved, "rollups", "hourly"),
    dailyDir: joinUnder(resolved, "rollups", "daily"),
    locksDir: joinUnder(resolved, "locks"),
    collectorLockFile: joinUnder(resolved, "locks", "collector.lock")
  };
}

export function generationDir(root: string, cycleId: string): string {
  return joinUnder(monitoringPaths(root).generationsDir, assertCycleId(cycleId));
}

export function generationFile(root: string, cycleId: string, project: string, bindingId: string): string {
  return joinUnder(
    generationDir(root, cycleId),
    assertProjectSlug(project),
    `${assertBindingId(bindingId)}.json`
  );
}

export function eventsFile(root: string, month: string): string {
  return joinUnder(monitoringPaths(root).eventsDir, `${assertMonthName(month)}.jsonl`);
}

export function hourlyRollupFile(root: string, month: string): string {
  return joinUnder(monitoringPaths(root).hourlyDir, `${assertMonthName(month)}.jsonl`);
}

export function dailyRollupFile(root: string, year: string): string {
  return joinUnder(monitoringPaths(root).dailyDir, `${assertYearName(year)}.jsonl`);
}
