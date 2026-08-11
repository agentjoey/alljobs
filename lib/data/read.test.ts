import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLedger } from "./read";

let dir: string;

const GOOD_PROJECT = `---
title: AllJobs 工作台
type: code
status: active
priority: P0
agents: [claude]
tags: [workbench]
started: 2026-08-01
---
<!-- 占位样例：状态/优先级/日期待 Joey 校正 -->
## Now
T3 Brief 定稿

## Next
- Mockup Gate 批准后开始 v1 实现
- 数据层落地

## Notes
自由笔记
`;

function write(rel: string, content: string) {
  writeFileSync(join(dir, rel), content, "utf8");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "alljobs-data-"));
  mkdirSync(join(dir, "projects"));
  mkdirSync(join(dir, "log"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readLedger", () => {
  it("正常解析项目与日志", () => {
    write("projects/alljobs.md", GOOD_PROJECT);
    write("log/2026-08-11.md", "- 08:35 alljobs @claude T3 Brief 定稿\n- 09:10 alljobs @kimi 数据层落地\n");
    const r = readLedger(dir);
    expect(r.issues).toEqual([]);
    expect(r.projects).toHaveLength(1);
    expect(r.projects[0].slug).toBe("alljobs");
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({ date: "2026-08-11", time: "08:35", slug: "alljobs", agent: "claude" });
  });

  it("解析 body 的 Now / Next / Notes 段", () => {
    write("projects/alljobs.md", GOOD_PROJECT);
    const r = readLedger(dir);
    const p = r.projects[0];
    expect(p.now).toBe("T3 Brief 定稿");
    expect(p.next).toEqual(["Mockup Gate 批准后开始 v1 实现", "数据层落地"]);
    expect(p.notes).toBe("自由笔记");
  });

  it("坏 frontmatter 进 ProofIssue（指明文件与字段），其余项目照常", () => {
    write("projects/alljobs.md", GOOD_PROJECT);
    write(
      "projects/broken.md",
      "---\ntitle: 坏项目\ntype: code\nstatus: doing\npriority: P1\nagents: [claude]\nstarted: 2026-08-01\n---\n## Now\nx\n",
    );
    const r = readLedger(dir);
    expect(r.projects.map((p) => p.slug)).toEqual(["alljobs"]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].file).toContain("broken.md");
    expect(r.issues[0].field).toBe("status");
  });

  it("frontmatter 完全无法解析（YAML 损坏）进 ProofIssue 且不抛出", () => {
    write("projects/alljobs.md", GOOD_PROJECT);
    write("projects/garbage.md", "---\n: : : [unclosed\n---\nbody\n");
    const r = readLedger(dir);
    expect(r.projects).toHaveLength(1);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].file).toContain("garbage.md");
  });

  it("坏日志行进 ProofIssue（指明文件与行号），好行照常", () => {
    write("projects/alljobs.md", GOOD_PROJECT);
    write(
      "log/2026-08-11.md",
      "- 08:35 alljobs @claude 正常行\n这一行不是日志\n- 25:99 alljobs @claude 时间非法\n",
    );
    const r = readLedger(dir);
    expect(r.entries).toHaveLength(1);
    expect(r.issues).toHaveLength(2);
    expect(r.issues[0]).toMatchObject({ line: 2 });
    expect(r.issues[0].file).toContain("2026-08-11.md");
    expect(r.issues[1]).toMatchObject({ line: 3 });
  });

  it("未知 slug 的日志行进 ProofIssue", () => {
    write("projects/alljobs.md", GOOD_PROJECT);
    write("log/2026-08-11.md", "- 08:35 ghost-project @claude 查无此项目\n");
    const r = readLedger(dir);
    expect(r.entries).toHaveLength(1);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].message).toContain("ghost-project");
  });

  it("日志文件可带 frontmatter（brief 允许）：剥离后解析，行号按原文件计", () => {
    write("projects/alljobs.md", GOOD_PROJECT);
    write(
      "log/2026-08-11.md",
      "---\nmood: tired\n---\n\n- 08:35 alljobs @claude 正常行\n这一行不是日志\n",
    );
    const r = readLedger(dir);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ time: "08:35", line: 5 });
    // 只有第 6 行坏行进 ProofIssue；frontmatter 三行与空行不得误报
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ line: 6 });
  });

  it("日志文件名非法（非 YYYY-MM-DD）进 ProofIssue", () => {
    write("projects/alljobs.md", GOOD_PROJECT);
    write("log/notes.md", "- 08:35 alljobs @claude x\n");
    const r = readLedger(dir);
    expect(r.entries).toHaveLength(0);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].file).toContain("notes.md");
  });

  it("空 data 目录不抛出", () => {
    const r = readLedger(dir);
    expect(r.projects).toEqual([]);
    expect(r.entries).toEqual([]);
    expect(r.issues).toEqual([]);
  });
});
