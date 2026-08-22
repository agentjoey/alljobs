import type { LedgerData, LogEntry, TaskBucket } from "./types";

const DAY_MS = 86_400_000;

export interface DateCount {
  date: string;
  count: number;
}

export interface AgentCount {
  agent: string;
  count: number;
}

export interface ProjectCount {
  slug: string;
  count: number;
}

export interface TaskCounts {
  todo: number;
  doing: number;
  done: number;
}

export interface StatsResult {
  activeProjectsCount: number;
  blockedCount: number;
  pausedCount: number;
  doneCount: number;
  entriesLast30Days: DateCount[];
  entriesByAgent: AgentCount[];
  entriesByProject: ProjectCount[];
  currentStreak: number;
  longestStreak: number;
  taskCounts: TaskCounts;
  sessionCount: number;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayDiff(later: Date, earlier: Date): number {
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / DAY_MS);
}

function countBy<T extends string | number>(items: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const item of items) map.set(item, (map.get(item) ?? 0) + 1);
  return map;
}

function sortedCounts<T extends string | number>(map: Map<T, number>): { key: T; count: number }[] {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

function entriesLast30Days(entries: LogEntry[], today: Date): DateCount[] {
  const counts = countBy(entries.map((e) => e.date));
  const result: DateCount[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(startOfDay(today).getTime() - i * DAY_MS);
    const date = toDateStr(d);
    result.push({ date, count: counts.get(date) ?? 0 });
  }
  return result;
}

/** 以 today 为终点，连续有日志的天数 */
function currentStreak(entries: LogEntry[], today: Date): number {
  const dates = new Set(entries.map((e) => e.date));
  if (!dates.has(toDateStr(today))) return 0;
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date(startOfDay(today).getTime() - i * DAY_MS);
    if (dates.has(toDateStr(d))) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/** 历史最长连续有日志天数 */
function longestStreak(entries: LogEntry[]): number {
  if (entries.length === 0) return 0;
  const sorted = [...new Set(entries.map((e) => e.date))].sort();
  let max = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (dayDiff(parseDate(sorted[i]), parseDate(sorted[i - 1])) === 1) {
      current++;
      max = Math.max(max, current);
    } else {
      current = 1;
    }
  }
  return max;
}

function taskCounts(tasks: Map<string, TaskBucket>): TaskCounts {
  const counts: TaskCounts = { todo: 0, doing: 0, done: 0 };
  for (const bucket of tasks.values()) {
    for (const item of bucket.items) {
      counts[item.status]++;
    }
  }
  return counts;
}

/**
 * 从 LedgerData + tasks 派生统计指标。
 * 纯函数；today 默认取当前系统日期。
 */
export function deriveStats(
  ledger: LedgerData,
  tasks: Map<string, TaskBucket>,
  today: Date = new Date(),
): StatsResult {
  const { projects, entries } = ledger;

  return {
    activeProjectsCount: projects.filter((p) => p.status === "active").length,
    blockedCount: projects.filter((p) => p.status === "blocked").length,
    pausedCount: projects.filter((p) => p.status === "paused").length,
    doneCount: projects.filter((p) => p.status === "done").length,
    entriesLast30Days: entriesLast30Days(entries, today),
    entriesByAgent: sortedCounts(countBy(entries.map((e) => e.agent))).map(({ key, count }) => ({
      agent: key,
      count,
    })),
    entriesByProject: sortedCounts(countBy(entries.map((e) => e.slug))).map(({ key, count }) => ({
      slug: key,
      count,
    })),
    currentStreak: currentStreak(entries, today),
    longestStreak: longestStreak(entries),
    taskCounts: taskCounts(tasks),
    sessionCount: entries.filter((e) => e.kind === "session").length,
  };
}
