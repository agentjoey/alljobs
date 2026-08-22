import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readLedger } from "./read";
import { readTasks } from "./tasks";
import { deriveStats } from "./stats";
import { deriveProjects, attentionList, mastheadCounts } from "./derive";

const DATA_DIR = join(__dirname, "..", "..", "data");

describe("data/ 种子", () => {
  it("10 个项目、4 个日志文件、零 ProofIssue", () => {
    const r = readLedger(DATA_DIR);
    expect(r.issues).toEqual([]);
    expect(r.projects).toHaveLength(10);
    expect(r.entries.length).toBeGreaterThan(0);
    const logDays = new Set(r.entries.map((e) => e.date));
    // 2026-08-23：Claude 接手完成 v2 三栏重构审查修复，记一笔 [session]（见该日志文件）
    expect([...logDays].sort()).toEqual([
      "2026-08-07",
      "2026-08-08",
      "2026-08-10",
      "2026-08-11",
      "2026-08-23",
    ]);

    const knownSlugs = new Set(r.projects.map((p) => p.slug));
    const tasks = readTasks(DATA_DIR, knownSlugs);
    const taskIssues = [...tasks.values()].flatMap((b) => b.issues);
    expect(taskIssues).toEqual([]);
    expect(tasks.has("alljobs")).toBe(true);
    expect(tasks.has("pactify-apps")).toBe(true);
  });

  it("每个项目文件含占位校正注释", () => {
    const r = readLedger(DATA_DIR);
    for (const p of r.projects) {
      const raw = readFileSync(p.file, "utf8");
      expect(raw).toContain("<!-- 占位样例：状态/优先级/日期待 Joey 校正 -->");
    }
  });

  it("tradelinks：blocked + blocked_reason + blocked_since", () => {
    const r = readLedger(DATA_DIR);
    const t = r.projects.find((p) => p.slug === "tradelinks");
    expect(t).toMatchObject({
      status: "blocked",
      blocked_reason: "等海外供应商报价答复",
      blocked_since: "2026-08-06",
    });
  });

  it("派生与 mockup 一致（2026-08-11 视角：活跃 7 · 卡住 1 · 今日 5 笔；注意清单 blocked/stale/dueSoon）", () => {
    const today = new Date(2026, 7, 11, 12, 0);
    const r = readLedger(DATA_DIR);
    // 今日 5 笔 = 原 4 笔 + 21:14 alljobs [session]
    const counts = mastheadCounts(r.projects, r.entries, today);
    expect(counts).toEqual({ active: 7, blocked: 1, todayCount: 5 });
    const list = attentionList(deriveProjects(r.projects, r.entries, today));
    expect(list.map((i) => [i.project.slug, i.kind])).toEqual([
      ["tradelinks", "blocked"],
      ["petcare-app", "stale"],
      ["eastern-astrology-mvp", "dueSoon"],
    ]);
    const blocked = list[0].project;
    expect(blocked.blockedDays).toBe(5);

    // sessionCount 不按 today 窗口过滤（deriveStats 同）：kimi 2026-08-11 一条 +
    // Claude 2026-08-23 接手重构审查一条，均计入
    const sessionCount = r.entries.filter((e) => e.kind === "session").length;
    expect(sessionCount).toBe(2);
    expect(r.entries.find((e) => e.kind === "session")?.slug).toBe("alljobs");

    const knownSlugs = new Set(r.projects.map((p) => p.slug));
    const tasks = readTasks(DATA_DIR, knownSlugs);
    const stats = deriveStats(r, tasks, today);
    // 「完成 Apple HIG v2 三栏视图」在审查修复完成后由 [/] 改记 [x]
    expect(stats.taskCounts).toEqual({ todo: 1, doing: 0, done: 4 });
    expect(stats.sessionCount).toBe(2);
  });
});
