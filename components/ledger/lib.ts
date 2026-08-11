import type { AttentionItem, DerivedProject } from "../../lib/data/derive";
import type { LogEntry } from "../../lib/data/types";

/* 与 lib/data/derive.ts 相同的本地日历日约定（pages 侧只读派生，不改数据层） */
const DAY_MS = 86_400_000;

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayDiff(later: Date, earlier: Date): number {
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / DAY_MS);
}

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-08-15" → "08-15" */
export function formatMmDd(date: string): string {
  return date.slice(5);
}

export interface StampSpec {
  cls: "active" | "blocked" | "paused" | "done" | "due" | "stale";
  text: string;
}

/** 注意清单边距戳：卡住 N 天 / 停滞 N 天 / N 天到期（含今日到期、逾期 N 天） */
export function attentionStamp(item: AttentionItem, today: Date): StampSpec {
  const p = item.project;
  if (item.kind === "blocked") {
    return { cls: "blocked", text: p.blockedDays !== null ? `卡住 ${p.blockedDays} 天` : "卡住" };
  }
  if (item.kind === "stale") {
    if (p.lastEntry === null) return { cls: "stale", text: "从未记录" };
    return { cls: "stale", text: `停滞 ${dayDiff(today, parseDate(p.lastEntry.date))} 天` };
  }
  const days = dayDiff(parseDate(p.due!), today);
  if (days > 0) return { cls: "due", text: `${days} 天到期` };
  if (days === 0) return { cls: "due", text: "今日到期" };
  return { cls: "due", text: `逾期 ${-days} 天` };
}

/** 注意清单「为什么」一行：数据驱动，三段各有出处 */
export function attentionWhy(item: AttentionItem): string {
  const p = item.project;
  if (item.kind === "blocked") {
    return p.now ?? p.blocked_reason ?? "status=blocked";
  }
  if (item.kind === "stale") {
    const last = p.lastEntry ? `上次记录 ${formatMmDd(p.lastEntry.date)}` : "尚无记录";
    return p.next[0] ? `${last}；${p.next[0]} 未动` : last;
  }
  const head = `due ${formatMmDd(p.due!)}`;
  return p.next[0] ? `${head}：${p.next[0]}` : head;
}

/** 底账行边距戳：blocked 优先于停滞（与注意清单同序），其余直取状态 */
export function rowStamp(p: DerivedProject): StampSpec {
  if (p.status === "blocked") return { cls: "blocked", text: "BLOCKED" };
  if (p.stale) return { cls: "stale", text: "停滞" };
  if (p.status === "active") return { cls: "active", text: "ACTIVE" };
  if (p.status === "paused") return { cls: "paused", text: "PAUSED" };
  return { cls: "done", text: "DONE" };
}

export interface ProjectFilters {
  status?: string;
  type?: string;
  agent?: string;
}

export function filterProjects<T extends { status: string; type: string; agents: string[] }>(
  projects: T[],
  f: ProjectFilters,
): T[] {
  return projects.filter(
    (p) =>
      (!f.status || p.status === f.status) &&
      (!f.type || p.type === f.type) &&
      (!f.agent || p.agents.includes(f.agent)),
  );
}

/** chip 切换：已选则去除该参数，未选则设置；其余参数保留；无参数时回裸路径 */
export function toggleHref(
  path: string,
  current: Record<string, string | undefined>,
  key: string,
  value: string,
): string {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(current)) if (v !== undefined) next[k] = v;
  if (next[key] === value) delete next[key];
  else next[key] = value;
  const qs = new URLSearchParams(next).toString();
  return qs ? `${path}?${qs}` : path;
}

export interface DayGroup {
  date: string;
  entries: LogEntry[];
}

/** 日志页/详情活动流共用：日分组倒序，日内按时间倒序（检索逻辑：最新在上） */
export function groupByDay(entries: LogEntry[]): DayGroup[] {
  const byDate = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, list]) => ({
      date,
      entries: [...list].sort((a, b) => (a.time < b.time ? 1 : -1)),
    }));
}

export interface MonthFold {
  month: string;
  count: number;
}

/** 近 windowDays 天全量展开；更早的日组按月折叠为计数占位 */
export function foldOlderThan(
  groups: DayGroup[],
  today: Date,
  windowDays = 30,
): { recent: DayGroup[]; months: MonthFold[] } {
  const recent: DayGroup[] = [];
  const byMonth = new Map<string, number>();
  for (const g of groups) {
    if (dayDiff(today, parseDate(g.date)) < windowDays) {
      recent.push(g);
    } else {
      const month = g.date.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + g.entries.length);
    }
  }
  const months = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, count]) => ({ month, count }));
  return { recent, months };
}

/** 404 页「最接近的页」：最近有记录者优先，其余按 slug */
export function recentSlugs(projects: DerivedProject[], n = 3): string[] {
  return [...projects]
    .sort((a, b) => {
      const ka = a.lastEntry ? `${a.lastEntry.date}T${a.lastEntry.time}` : "";
      const kb = b.lastEntry ? `${b.lastEntry.date}T${b.lastEntry.time}` : "";
      return kb.localeCompare(ka) || a.slug.localeCompare(b.slug);
    })
    .slice(0, n)
    .map((p) => p.slug);
}

/** 近 days 天（含今天）内提及 slug 的日志条数（tally aria 文本用，不封顶） */
export function countInWindow(entries: LogEntry[], slug: string, today: Date, days = 14): number {
  return entries.filter((e) => {
    if (e.slug !== slug) return false;
    const diff = dayDiff(today, parseDate(e.date));
    return diff >= 0 && diff < days;
  }).length;
}

/** tally 胞元对应日期：最旧 → 今日 */
export function tallyDates(today: Date, n = 14): string[] {
  return Array.from({ length: n }, (_, i) =>
    toDateStr(new Date(startOfDay(today).getTime() - (n - 1 - i) * DAY_MS)),
  );
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

/** 底账行排序：优先级 → 安静组（paused/done）沉底 → 最近活动 → slug */
export function sortForIndex(projects: DerivedProject[]): DerivedProject[] {
  const quiet = (p: DerivedProject) => (p.status === "paused" || p.status === "done" ? 1 : 0);
  return [...projects].sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr) return pr;
    const q = quiet(a) - quiet(b);
    if (q) return q;
    const ka = a.lastEntry ? `${a.lastEntry.date}T${a.lastEntry.time}` : "";
    const kb = b.lastEntry ? `${b.lastEntry.date}T${b.lastEntry.time}` : "";
    return kb.localeCompare(ka) || a.slug.localeCompare(b.slug);
  });
}
