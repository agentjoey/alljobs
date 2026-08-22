import { describe, it, expect } from "vitest";
import { deriveStats } from "./stats";
import type { LedgerData, TaskBucket } from "./types";

const today = new Date(2026, 7, 11, 12, 0);

function makeLedger(): LedgerData {
  return {
    projects: [
      { slug: "alljobs", title: "AllJobs", type: "code", status: "active", priority: "P0", agents: ["kimi"], tags: [], started: "2026-08-01", file: "p/alljobs.md", now: null, next: [], notes: null },
      { slug: "pactify-apps", title: "Pactify", type: "code", status: "active", priority: "P0", agents: ["claude"], tags: [], started: "2026-06-02", file: "p/pactify-apps.md", now: null, next: [], notes: null },
      { slug: "tradelinks", title: "TradeLinks", type: "biz", status: "blocked", priority: "P1", agents: ["joey"], tags: [], started: "2026-07-01", file: "p/tradelinks.md", now: null, next: [], notes: null, blocked_reason: "x" },
      { slug: "done-proj", title: "Done", type: "product", status: "done", priority: "P2", agents: ["claude"], tags: [], started: "2026-01-01", file: "p/done-proj.md", now: null, next: [], notes: null },
    ],
    entries: [
      { date: "2026-08-11", time: "08:00", slug: "alljobs", agent: "kimi", text: "a", kind: null, file: "log/2026-08-11.md", line: 1 },
      { date: "2026-08-11", time: "21:14", slug: "alljobs", agent: "kimi", text: "s", kind: "session", file: "log/2026-08-11.md", line: 2 },
      { date: "2026-08-11", time: "09:00", slug: "pactify-apps", agent: "claude", text: "b", kind: null, file: "log/2026-08-11.md", line: 3 },
      { date: "2026-08-10", time: "10:00", slug: "alljobs", agent: "kimi", text: "c", kind: null, file: "log/2026-08-10.md", line: 1 },
      { date: "2026-08-09", time: "11:00", slug: "pactify-apps", agent: "claude", text: "d", kind: null, file: "log/2026-08-09.md", line: 1 },
      { date: "2026-08-07", time: "12:00", slug: "alljobs", agent: "kimi", text: "e", kind: null, file: "log/2026-08-07.md", line: 1 },
    ],
    issues: [],
  };
}

function makeTasks(): Map<string, TaskBucket> {
  return new Map([
    ["alljobs", { items: [
      { status: "todo", text: "t", line: 1 },
      { status: "doing", text: "d", line: 2 },
      { status: "done", text: "x", line: 3 },
    ], issues: [] }],
    ["pactify-apps", { items: [
      { status: "todo", text: "t", line: 1 },
      { status: "done", text: "x", line: 2 },
    ], issues: [] }],
  ]);
}

describe("deriveStats", () => {
  it("计算项目状态计数", () => {
    const s = deriveStats(makeLedger(), makeTasks(), today);
    expect(s.activeProjectsCount).toBe(2);
    expect(s.blockedCount).toBe(1);
    expect(s.pausedCount).toBe(0);
    expect(s.doneCount).toBe(1);
  });

  it("entriesLast30Days 包含今日倒推 30 天", () => {
    const s = deriveStats(makeLedger(), makeTasks(), today);
    expect(s.entriesLast30Days).toHaveLength(30);
    expect(s.entriesLast30Days.at(-1)).toEqual({ date: "2026-08-11", count: 3 });
    expect(s.entriesLast30Days.find((d) => d.date === "2026-08-10")?.count).toBe(1);
    expect(s.entriesLast30Days.find((d) => d.date === "2026-08-08")?.count).toBe(0);
  });

  it("entriesByAgent 按数量降序", () => {
    const s = deriveStats(makeLedger(), makeTasks(), today);
    expect(s.entriesByAgent).toEqual([
      { agent: "kimi", count: 4 },
      { agent: "claude", count: 2 },
    ]);
  });

  it("entriesByProject 按数量降序", () => {
    const s = deriveStats(makeLedger(), makeTasks(), today);
    expect(s.entriesByProject).toEqual([
      { slug: "alljobs", count: 4 },
      { slug: "pactify-apps", count: 2 },
    ]);
  });

  it("currentStreak 以 today 为终点统计连续天数", () => {
    const s = deriveStats(makeLedger(), makeTasks(), today);
    expect(s.currentStreak).toBe(3); // 08-09, 08-10, 08-11
  });

  it("currentStreak 今日无日志则为 0", () => {
    const ledger = makeLedger();
    const s = deriveStats(ledger, makeTasks(), new Date(2026, 7, 12));
    expect(s.currentStreak).toBe(0);
  });

  it("longestStreak 返回历史最长连续天数", () => {
    const s = deriveStats(makeLedger(), makeTasks(), today);
    expect(s.longestStreak).toBe(3); // 08-09 ~ 08-11
  });

  it("taskCounts 汇总所有任务", () => {
    const s = deriveStats(makeLedger(), makeTasks(), today);
    expect(s.taskCounts).toEqual({ todo: 2, doing: 1, done: 2 });
  });

  it("sessionCount 统计 kind=session 条目", () => {
    const s = deriveStats(makeLedger(), makeTasks(), today);
    expect(s.sessionCount).toBe(1);
  });
});
