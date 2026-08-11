import type { LogEntry, Project } from "./types";

const DAY_MS = 86_400_000;
const STALE_DAYS = 7;
const DUE_SOON_DAYS = 5;
const ACTIVITY_WINDOW = 14;
const ACTIVITY_CAP = 4;

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** later 与 earlier 相差的日历天数（later - earlier） */
function dayDiff(later: Date, earlier: Date): number {
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / DAY_MS);
}

function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface DerivedProject extends Project {
  /** 提及该 slug 的最新日志行（日期+时间最大者）；无则 null（UI 显示 —） */
  lastEntry: LogEntry | null;
  /** active 且（无记录或 lastEntry ≥7 天前） */
  stale: boolean;
  /** due 存在且距今 ≤5 天（含当天；已过期不算） */
  dueSoon: boolean;
  /** blocked_since 存在时距今天数，否则 null */
  blockedDays: number | null;
  /** 近 14 日每日条数（最旧 → 今日），单日封顶 4 */
  activity14: number[];
}

export function deriveProjects(
  projects: Project[],
  entries: LogEntry[],
  today: Date = new Date(),
): DerivedProject[] {
  return projects.map((p) => {
    const mine = entries.filter((e) => e.slug === p.slug);
    const lastEntry =
      mine.length === 0
        ? null
        : mine.reduce((a, b) => (`${a.date}T${a.time}` >= `${b.date}T${b.time}` ? a : b));
    const stale =
      p.status === "active" &&
      (lastEntry === null || dayDiff(today, parseDate(lastEntry.date)) >= STALE_DAYS);
    const daysToDue = p.due !== undefined ? dayDiff(parseDate(p.due), today) : null;
    const dueSoon = daysToDue !== null && daysToDue >= 0 && daysToDue <= DUE_SOON_DAYS;
    const blockedDays = p.blocked_since ? dayDiff(today, parseDate(p.blocked_since)) : null;

    const countByDate = new Map<string, number>();
    for (const e of mine) countByDate.set(e.date, (countByDate.get(e.date) ?? 0) + 1);
    const activity14 = Array.from({ length: ACTIVITY_WINDOW }, (_, i) => {
      const d = new Date(startOfDay(today).getTime() - (ACTIVITY_WINDOW - 1 - i) * DAY_MS);
      return Math.min(countByDate.get(toDateStr(d)) ?? 0, ACTIVITY_CAP);
    });

    return { ...p, lastEntry, stale, dueSoon, blockedDays, activity14 };
  });
}

export type AttentionKind = "blocked" | "stale" | "dueSoon";

export interface AttentionItem {
  project: DerivedProject;
  kind: AttentionKind;
}

const KIND_RANK: Record<AttentionKind, number> = { blocked: 0, stale: 1, dueSoon: 2 };

/** 注意清单 = blocked ∪ stale ∪ dueSoon（按此优先级去重排序） */
export function attentionList(derived: DerivedProject[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const project of derived) {
    const kind: AttentionKind | null = project.status === "blocked"
      ? "blocked"
      : project.stale
        ? "stale"
        : project.dueSoon
          ? "dueSoon"
          : null;
    if (kind) items.push({ project, kind });
  }
  const urgency = (i: AttentionItem): number => {
    if (i.kind === "blocked") return -(i.project.blockedDays ?? -1);
    if (i.kind === "stale") return i.project.lastEntry === null ? Number.POSITIVE_INFINITY : 0;
    return 0;
  };
  return items.sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      urgency(b) - urgency(a) ||
      a.project.slug.localeCompare(b.project.slug),
  );
}

export interface MastheadCounts {
  active: number;
  blocked: number;
  todayCount: number;
}

export function mastheadCounts(
  projects: Project[],
  entries: LogEntry[],
  today: Date = new Date(),
): MastheadCounts {
  const todayStr = toDateStr(today);
  return {
    active: projects.filter((p) => p.status === "active").length,
    blocked: projects.filter((p) => p.status === "blocked").length,
    todayCount: entries.filter((e) => e.date === todayStr).length,
  };
}

/** 相对时间：刚刚 / N 小时前 / 昨天 / N 天前（<14 天）/ MM-DD */
export function formatRelative(date: string, time: string | null, now: Date = new Date()): string {
  const days = dayDiff(now, parseDate(date));
  if (days === 0) {
    if (!time) return "刚刚";
    const [hh, mm] = time.split(":").map(Number);
    const minutes = Math.floor((now.getTime() - new Date(
      now.getFullYear(), now.getMonth(), now.getDate(), hh, mm,
    ).getTime()) / 60_000);
    if (minutes < 60) return "刚刚";
    return `${Math.floor(minutes / 60)} 小时前`;
  }
  if (days === 1) return "昨天";
  if (days < 14) return `${days} 天前`;
  return date.slice(5);
}

const WEEKDAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

/** 周几（中文），由日期真实计算 */
export function weekdayZh(date: string | Date): string {
  const d = typeof date === "string" ? parseDate(date) : date;
  return WEEKDAYS_ZH[d.getDay()];
}

/** ISO 8601 周号（1–53） */
export function isoWeek(date: string | Date): number {
  const d = startOfDay(typeof date === "string" ? parseDate(date) : date);
  // 移到本周周四（ISO 周以周四定归属）
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / DAY_MS - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  );
}
