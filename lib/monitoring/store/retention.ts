import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  MonitoringPathError,
  monitoringPaths
} from "./paths";

// Retention (design §10.3): 90 days of hourly rollups, 13 months of daily
// rollups and transition events. Cleanup runs only under the resolved
// monitoring state root (see resolveMonitoringRoot — no arbitrary roots,
// globs, unresolved variables, '~', or '/'), touches only explicit validated
// filenames, and runs after a successful rollup. A retention error leaves
// data in place and returns a normalized issue; unparseable lines and
// unexpected or unsafe entries are kept and reported, never deleted.

export const HOURLY_RETENTION_DAYS = 90;
export const HISTORY_RETENTION_MONTHS = 13;

export interface RetentionIssue {
  code: "unexpected_entry" | "unsafe_path" | "read_failed" | "write_failed" | "unparseable_line";
  message: string;
  /** Path relative to the monitoring state root. */
  path: string;
}

export interface RetentionResult {
  removed_files: string[];
  pruned_files: string[];
  issues: RetentionIssue[];
}

const DAY_MS = 86_400_000;

// Full filenames, including the bounded extension — a month name alone never
// authorizes touching a file.
const HOURLY_FILE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])\.jsonl$/;
const DAILY_FILE_PATTERN = /^\d{4}\.jsonl$/;
const EVENTS_FILE_PATTERN = HOURLY_FILE_PATTERN;

function writeLinesAtomic(file: string, lines: string[]): void {
  const temp = `${file}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  fs.writeFileSync(temp, lines.join("\n") + "\n");
  fs.renameSync(temp, file);
}

function hourBucketMs(bucket: unknown): number {
  if (typeof bucket !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(bucket)) return Number.NaN;
  return Date.parse(`${bucket}:00:00Z`);
}

function dayBucketMs(bucket: unknown): number {
  if (typeof bucket !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bucket)) return Number.NaN;
  return Date.parse(`${bucket}T00:00:00Z`);
}

function recordedAtMs(line: Record<string, unknown>): number {
  return typeof line.recorded_at === "string" ? Date.parse(line.recorded_at) : Number.NaN;
}

/**
 * Prunes one bounded JSONL directory line-by-line. Lines whose extracted
 * timestamp is older than `cutoffMs` are dropped; the file is rewritten
 * atomically, or deleted once every line expired. Anything unexpected —
 * bad filenames, symlinks, non-files, unparseable lines — is left in place
 * and reported as an issue.
 */
function pruneDirectory(
  root: string,
  dir: string,
  namePattern: RegExp,
  cutoffMs: number,
  extractMs: (line: Record<string, unknown>) => number,
  result: RetentionResult
): void {
  if (!fs.existsSync(dir)) return;
  const realDir = fs.realpathSync(dir);

  for (const name of fs.readdirSync(dir)) {
    const full = join(dir, name);
    const relative = full.slice(root.length + 1);

    if (!namePattern.test(name)) {
      result.issues.push({ code: "unexpected_entry", message: `unexpected entry: ${relative}`, path: relative });
      continue;
    }
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(full);
    } catch (error) {
      result.issues.push({ code: "read_failed", message: `cannot inspect ${relative}: ${(error as Error).message}`, path: relative });
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      result.issues.push({ code: "unsafe_path", message: `${relative} is not a plain file; left untouched`, path: relative });
      continue;
    }
    if (resolve(fs.realpathSync(full)) !== resolve(realDir + sep + name)) {
      result.issues.push({ code: "unsafe_path", message: `${relative} resolves outside the state root`, path: relative });
      continue;
    }

    let lines: string[];
    try {
      lines = fs.readFileSync(full, "utf8").split("\n").filter((line) => line.length > 0);
    } catch (error) {
      result.issues.push({ code: "read_failed", message: `cannot read ${relative}: ${(error as Error).message}`, path: relative });
      continue;
    }

    const kept: string[] = [];
    let dropped = 0;
    for (const line of lines) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        kept.push(line);
        result.issues.push({ code: "unparseable_line", message: `kept unparseable line in ${relative}`, path: relative });
        continue;
      }
      const ms = extractMs(parsed);
      if (!Number.isFinite(ms)) {
        kept.push(line);
        result.issues.push({ code: "unparseable_line", message: `kept line without a timestamp in ${relative}`, path: relative });
        continue;
      }
      if (ms >= cutoffMs) kept.push(line);
      else dropped += 1;
    }

    if (dropped === 0) continue;
    try {
      if (kept.length === 0) {
        fs.rmSync(full);
        result.removed_files.push(full);
      } else {
        writeLinesAtomic(full, kept);
        result.pruned_files.push(full);
      }
    } catch (error) {
      // The atomic rewrite means the original file is still intact here.
      result.issues.push({ code: "write_failed", message: `retention failed for ${relative}: ${(error as Error).message}`, path: relative });
    }
  }
}

/**
 * Enforces the bounded retention policy. `now` is injected for
 * determinism. Returns what was removed, what was pruned, and every issue
 * encountered; failures never delete broad or unresolved paths.
 */
export function runRetention(root: string, now: string): RetentionResult {
  const paths = monitoringPaths(root);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    throw new MonitoringPathError(`retention requires a valid ISO timestamp for now, got ${JSON.stringify(now)}`);
  }

  const hourlyCutoffMs = nowMs - HOURLY_RETENTION_DAYS * DAY_MS;
  const at = new Date(nowMs);
  const historyCutoffMs = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth() - HISTORY_RETENTION_MONTHS,
    at.getUTCDate(),
    at.getUTCHours(),
    at.getUTCMinutes(),
    at.getUTCSeconds()
  );

  const result: RetentionResult = { removed_files: [], pruned_files: [], issues: [] };
  pruneDirectory(paths.root, paths.hourlyDir, HOURLY_FILE_PATTERN, hourlyCutoffMs, (line) => hourBucketMs(line.bucket), result);
  pruneDirectory(paths.root, paths.dailyDir, DAILY_FILE_PATTERN, historyCutoffMs, (line) => dayBucketMs(line.bucket), result);
  pruneDirectory(paths.root, paths.eventsDir, EVENTS_FILE_PATTERN, historyCutoffMs, recordedAtMs, result);
  return result;
}
