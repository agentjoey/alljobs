import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readLedger } from "./read";
import { deriveProjects, attentionList, mastheadCounts } from "./derive";

const DATA_DIR = join(__dirname, "..", "..", "data");

describe("data/ 种子", () => {
  it("10 个项目、4 个日志文件、零 ProofIssue", () => {
    const r = readLedger(DATA_DIR);
    expect(r.issues).toEqual([]);
    expect(r.projects).toHaveLength(10);
    expect(r.entries.length).toBeGreaterThan(0);
    const logDays = new Set(r.entries.map((e) => e.date));
    expect([...logDays].sort()).toEqual(["2026-08-07", "2026-08-08", "2026-08-10", "2026-08-11"]);
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

  it("派生与 mockup 一致（2026-08-11 视角：活跃 7 · 卡住 1 · 今日 4 笔；注意清单 blocked/stale/dueSoon）", () => {
    const today = new Date(2026, 7, 11, 12, 0);
    const r = readLedger(DATA_DIR);
    // 今日 4 笔 = overview 3 笔 ∪ project 页 pactify-apps 07:58 一笔（三页并集去重）
    const counts = mastheadCounts(r.projects, r.entries, today);
    expect(counts).toEqual({ active: 7, blocked: 1, todayCount: 4 });
    const list = attentionList(deriveProjects(r.projects, r.entries, today));
    expect(list.map((i) => [i.project.slug, i.kind])).toEqual([
      ["tradelinks", "blocked"],
      ["petcare-app", "stale"],
      ["eastern-astrology-mvp", "dueSoon"],
    ]);
    const blocked = list[0].project;
    expect(blocked.blockedDays).toBe(5);
  });
});
