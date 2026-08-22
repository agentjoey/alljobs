import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTasks } from "./tasks";

let dir: string;

function write(rel: string, content: string) {
  writeFileSync(join(dir, rel), content, "utf8");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "alljobs-tasks-"));
  mkdirSync(join(dir, "tasks"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const knownSlugs = new Set(["alljobs", "pactify-apps"]);

describe("readTasks", () => {
  it("解析 todo / doing / done 任务", () => {
    write(
      "tasks/alljobs.md",
      "---\nproject: alljobs\n---\n\n- [ ] 待办\n- [/] 进行中\n- [x] 已完成\n",
    );
    const tasks = readTasks(dir, knownSlugs);
    const bucket = tasks.get("alljobs")!;
    expect(bucket.issues).toEqual([]);
    expect(bucket.items).toHaveLength(3);
    expect(bucket.items.map((i) => [i.status, i.text])).toEqual([
      ["todo", "待办"],
      ["doing", "进行中"],
      ["done", "已完成"],
    ]);
  });

  it("未知 slug 进 issues", () => {
    write("tasks/ghost.md", "---\nproject: ghost\n---\n\n- [ ] x\n");
    const tasks = readTasks(dir, knownSlugs);
    const bucket = tasks.get("ghost")!;
    expect(bucket.items).toHaveLength(1);
    expect(bucket.issues).toHaveLength(1);
    expect(bucket.issues[0].message).toContain("未知项目 slug：ghost");
  });

  it("frontmatter 缺 project 进 issues", () => {
    write("tasks/alljobs.md", "---\n---\n\n- [ ] x\n");
    const tasks = readTasks(dir, knownSlugs);
    const bucket = tasks.get("alljobs")!;
    expect(bucket.items).toHaveLength(1);
    expect(bucket.issues).toHaveLength(1);
    expect(bucket.issues[0].field).toBe("project");
  });

  it("非法 marker 进 issues 且忽略该行", () => {
    write("tasks/alljobs.md", "---\nproject: alljobs\n---\n\n- [ ] ok\n- [?] bad\n");
    const tasks = readTasks(dir, knownSlugs);
    const bucket = tasks.get("alljobs")!;
    expect(bucket.items).toHaveLength(1);
    expect(bucket.issues).toHaveLength(1);
    expect(bucket.issues[0].line).toBe(6);
    expect(bucket.issues[0].message).toContain("非法任务 marker");
  });

  it("非 task list 行进 issues", () => {
    write("tasks/alljobs.md", "---\nproject: alljobs\n---\n\n这是普通正文\n- [ ] ok\n");
    const tasks = readTasks(dir, knownSlugs);
    const bucket = tasks.get("alljobs")!;
    expect(bucket.items).toHaveLength(1);
    expect(bucket.issues).toHaveLength(1);
    expect(bucket.issues[0].message).toContain("无法解析的任务行");
  });

  it("缺失 tasks 目录返回空 Map", () => {
    const empty = mkdtempSync(join(tmpdir(), "alljobs-empty-"));
    const tasks = readTasks(empty, knownSlugs);
    expect(tasks.size).toBe(0);
    rmSync(empty, { recursive: true, force: true });
  });
});
