import { describe, it, expect } from "vitest";
import {
  deriveProjects,
  attentionList,
  mastheadCounts,
  formatRelative,
  weekdayZh,
  isoWeek,
} from "./derive";
import type { Project, LogEntry } from "./types";

const TODAY = new Date(2026, 7, 11, 12, 0); // 2026-08-11 12:00 本地

function makeProject(over: Partial<Project> = {}): Project {
  return {
    slug: "demo",
    title: "Demo",
    type: "code",
    status: "active",
    priority: "P1",
    agents: ["claude"],
    tags: [],
    started: "2026-08-01",
    file: "data/projects/demo.md",
    now: null,
    next: [],
    notes: null,
    ...over,
  };
}

function makeEntry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    date: "2026-08-11",
    time: "09:00",
    slug: "demo",
    agent: "claude",
    text: "x",
    file: "data/log/2026-08-11.md",
    line: 1,
    ...over,
  };
}

describe("deriveProjects", () => {
  it("lastEntry = 提及该 slug 的最新日志行（跨日期按日期+时间比较）", () => {
    const p = makeProject();
    const entries = [
      makeEntry({ date: "2026-08-11", time: "08:00", text: "较早" }),
      makeEntry({ date: "2026-08-10", time: "23:59", text: "昨天深夜" }),
      makeEntry({ date: "2026-08-11", time: "09:42", text: "最新" }),
      makeEntry({ slug: "other", date: "2026-08-11", time: "23:00", text: "别的项目" }),
    ];
    const [d] = deriveProjects([p], entries, TODAY);
    expect(d.lastEntry?.text).toBe("最新");
  });

  it("无记录的项目 lastEntry 为 null 且视为停滞", () => {
    const [d] = deriveProjects([makeProject()], [], TODAY);
    expect(d.lastEntry).toBeNull();
    expect(d.stale).toBe(true);
  });

  it("stale 边界：7 天前停滞，6 天前不停滞；非 active 不判停滞", () => {
    const at = (date: string) => [makeEntry({ date, time: "10:00" })];
    expect(deriveProjects([makeProject()], at("2026-08-04"), TODAY)[0].stale).toBe(true);
    expect(deriveProjects([makeProject()], at("2026-08-05"), TODAY)[0].stale).toBe(false);
    expect(
      deriveProjects([makeProject({ status: "paused" })], [], TODAY)[0].stale,
    ).toBe(false);
  });

  it("dueSoon 边界：5 天内到期为 true，6 天为 false，已过期/无 due 为 false", () => {
    const withDue = (due?: string) => makeProject({ due });
    expect(deriveProjects([withDue("2026-08-16")], [], TODAY)[0].dueSoon).toBe(true);
    expect(deriveProjects([withDue("2026-08-11")], [], TODAY)[0].dueSoon).toBe(true);
    expect(deriveProjects([withDue("2026-08-17")], [], TODAY)[0].dueSoon).toBe(false);
    expect(deriveProjects([withDue("2026-08-10")], [], TODAY)[0].dueSoon).toBe(false);
    expect(deriveProjects([withDue(undefined)], [], TODAY)[0].dueSoon).toBe(false);
  });

  it("blockedDays = 距今天数；无 blocked_since 为 null", () => {
    const blocked = makeProject({
      status: "blocked",
      blocked_reason: "等海外供应商报价答复",
      blocked_since: "2026-08-06",
    });
    const [d] = deriveProjects([blocked, makeProject({ slug: "x" })], [], TODAY);
    expect(d.blockedDays).toBe(5);
    expect(deriveProjects([makeProject()], [], TODAY)[0].blockedDays).toBeNull();
  });

  it("activity14：跨月窗口、空日为 0、单日封顶 4", () => {
    // today = 2026-08-11 → 窗口 07-29 … 08-11
    const entries = [
      makeEntry({ date: "2026-07-29", time: "09:00" }), // 窗口首日
      makeEntry({ date: "2026-07-28", time: "09:00" }), // 窗口外
      ...Array.from({ length: 6 }, (_, i) =>
        makeEntry({ date: "2026-08-11", time: `1${i}:00` }),
      ), // 今日 6 条 → 封顶 4
    ];
    const [d] = deriveProjects([makeProject()], entries, TODAY);
    expect(d.activity14).toHaveLength(14);
    expect(d.activity14[0]).toBe(1); // 07-29
    expect(d.activity14[13]).toBe(4); // 今日封顶
    expect(d.activity14.slice(1, 13).every((n) => n === 0)).toBe(true); // 空日
  });
});

describe("attentionList", () => {
  it("blocked ∪ stale ∪ dueSoon，按此优先级去重排序", () => {
    const blocked = makeProject({ slug: "b", status: "blocked", blocked_reason: "r", blocked_since: "2026-08-06" });
    const stale = makeProject({ slug: "s" }); // 无记录 → stale
    const due = makeProject({ slug: "d", due: "2026-08-15" });
    const both = makeProject({ slug: "both", due: "2026-08-14" }); // stale 且 dueSoon → 只出现一次，记 stale
    const fine = makeProject({ slug: "ok" });
    const entries = [makeEntry({ slug: "ok" }), makeEntry({ slug: "d" }), makeEntry({ slug: "b" })];
    const derived = deriveProjects([fine, due, stale, blocked, both], entries, TODAY);
    const list = attentionList(derived);
    expect(list.map((i) => [i.project.slug, i.kind])).toEqual([
      ["b", "blocked"],
      ["both", "stale"],
      ["s", "stale"],
      ["d", "dueSoon"],
    ]);
  });
});

describe("mastheadCounts", () => {
  it("active / blocked / 今日笔数", () => {
    const projects = [
      makeProject({ slug: "a" }),
      makeProject({ slug: "b", status: "blocked", blocked_reason: "r" }),
      makeProject({ slug: "c", status: "done" }),
    ];
    const entries = [makeEntry({ slug: "a" }), makeEntry({ slug: "a", time: "10:00" }), makeEntry({ slug: "a", date: "2026-08-10" })];
    expect(mastheadCounts(projects, entries, TODAY)).toEqual({ active: 1, blocked: 1, todayCount: 2 });
  });
});

describe("formatRelative", () => {
  const now = new Date(2026, 7, 11, 12, 0);
  it("刚刚 / N 小时前 / 昨天 / N 天前 / MM-DD", () => {
    expect(formatRelative("2026-08-11", "11:30", now)).toBe("刚刚");
    expect(formatRelative("2026-08-11", "09:42", now)).toBe("2 小时前");
    expect(formatRelative("2026-08-10", "23:59", now)).toBe("昨天");
    expect(formatRelative("2026-08-03", "10:00", now)).toBe("8 天前");
    expect(formatRelative("2026-07-22", "10:00", now)).toBe("07-22");
  });
});

describe("日期工具", () => {
  it("周几由日期真实计算", () => {
    expect(weekdayZh("2026-08-11")).toBe("周二");
    expect(weekdayZh("2026-08-08")).toBe("周六");
  });
  it("ISO 周号", () => {
    expect(isoWeek("2026-08-11")).toBe(33);
    expect(isoWeek("2026-01-01")).toBe(1);
  });
});
