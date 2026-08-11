import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendLogEntry } from "./append";

let dir: string;
const NOW = new Date(2026, 7, 11, 9, 5); // 2026-08-11 09:05 服务器本地时

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "alljobs-append-"));
  mkdirSync(join(dir, "projects"));
  mkdirSync(join(dir, "log"));
  // slug 存在性只查文件是否在（frontmatter 解析是 read 层的事）
  writeFileSync(join(dir, "projects/alljobs.md"), "---\ntitle: t\n---\n", "utf8");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const read = (rel: string) => readFileSync(join(dir, rel), "utf8");

describe("appendLogEntry", () => {
  it("合法追加：新行落在今日文件末尾，返回落账条目", () => {
    writeFileSync(join(dir, "log/2026-08-11.md"), "- 08:35 alljobs @claude T3 Brief 定稿\n", "utf8");
    const r = appendLogEntry(
      { text: "数据层落地", slug: "alljobs", agent: "kimi" },
      { dataDir: dir, now: NOW },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry).toEqual({
        date: "2026-08-11",
        time: "09:05",
        slug: "alljobs",
        agent: "kimi",
        text: "数据层落地",
      });
      expect(r.file).toBe(join(dir, "log", "2026-08-11.md"));
    }
  });

  it("追加格式精确：- HH:MM <slug> @<agent> <text>", () => {
    writeFileSync(join(dir, "log/2026-08-11.md"), "- 08:35 alljobs @claude T3 Brief 定稿\n", "utf8");
    appendLogEntry({ text: "数据层落地", slug: "alljobs", agent: "kimi" }, { dataDir: dir, now: NOW });
    expect(read("log/2026-08-11.md")).toBe(
      "- 08:35 alljobs @claude T3 Brief 定稿\n- 09:05 alljobs @kimi 数据层落地\n",
    );
  });

  it("今日文件不存在则创建：无 frontmatter，纯列表行", () => {
    const r = appendLogEntry({ text: "第一笔", slug: "alljobs", agent: "joey" }, { dataDir: dir, now: NOW });
    expect(r.ok).toBe(true);
    expect(read("log/2026-08-11.md")).toBe("- 09:05 alljobs @joey 第一笔\n");
  });

  it("空文本拒绝（含纯空白）：不写文件", () => {
    const r = appendLogEntry({ text: "  \n ", slug: "alljobs", agent: "joey" }, { dataDir: dir, now: NOW });
    expect(r).toMatchObject({ ok: false, kind: "validation" });
    expect(existsSync(join(dir, "log/2026-08-11.md"))).toBe(false);
  });

  it("未知 slug 拒绝：data/projects 下无对应文件", () => {
    const r = appendLogEntry({ text: "x", slug: "ghost", agent: "joey" }, { dataDir: dir, now: NOW });
    expect(r).toMatchObject({ ok: false, kind: "validation" });
    expect(existsSync(join(dir, "log/2026-08-11.md"))).toBe(false);
  });

  it("非法 agent 拒绝（只认 joey/claude/codex/kimi）", () => {
    const r = appendLogEntry({ text: "x", slug: "alljobs", agent: "gpt" }, { dataDir: dir, now: NOW });
    expect(r).toMatchObject({ ok: false, kind: "validation" });
  });

  it("文本内换行折叠为空格：保护单行行文法", () => {
    appendLogEntry({ text: "第一行\n第二行", slug: "alljobs", agent: "kimi" }, { dataDir: dir, now: NOW });
    expect(read("log/2026-08-11.md")).toBe("- 09:05 alljobs @kimi 第一行 第二行\n");
  });

  it("既有文件末尾无换行：新行仍独立成行", () => {
    writeFileSync(join(dir, "log/2026-08-11.md"), "- 08:00 alljobs @joey 手写忘了换行", "utf8");
    appendLogEntry({ text: "补一笔", slug: "alljobs", agent: "kimi" }, { dataDir: dir, now: NOW });
    expect(read("log/2026-08-11.md")).toBe(
      "- 08:00 alljobs @joey 手写忘了换行\n- 09:05 alljobs @kimi 补一笔\n",
    );
  });

  it("fs 失败返回结构化错误（不抛出）", () => {
    // log/2026-08-11.md 是个目录 → 追加必然失败
    mkdirSync(join(dir, "log/2026-08-11.md"));
    const r = appendLogEntry({ text: "x", slug: "alljobs", agent: "joey" }, { dataDir: dir, now: NOW });
    expect(r).toMatchObject({ ok: false, kind: "fs" });
    if (!r.ok && r.kind === "fs") {
      expect(r.file).toContain("2026-08-11.md");
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});
