import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { refresh } from "next/cache";
import { quickAdd, type QuickAddState } from "./quickadd";

let dir: string;
const IDLE: QuickAddState = { status: "idle" };

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "alljobs-quickadd-"));
  mkdirSync(join(dir, "projects"));
  mkdirSync(join(dir, "log"));
  writeFileSync(join(dir, "projects/alljobs.md"), "---\ntitle: t\n---\n", "utf8");
  // 数据目录经 env 注入（action 签名只有 prev/formData，不吃第三个参数）
  process.env.ALLJOBS_DATA_DIR = dir;
  vi.mocked(refresh).mockClear();
});

afterEach(() => {
  delete process.env.ALLJOBS_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("quickAdd server action", () => {
  it("合法提交：落账成功 + refresh 触发同响应重渲染", async () => {
    const r = await quickAdd(IDLE, fd({ text: "催一下审核进度", slug: "alljobs", agent: "joey" }));
    expect(r.status).toBe("success");
    if (r.status === "success") {
      expect(r.entry.slug).toBe("alljobs");
      expect(r.entry.agent).toBe("joey");
      expect(r.entry.text).toBe("催一下审核进度");
      expect(r.entry.date).toBe(todayStr());
      expect(r.entry.time).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    }
    expect(vi.mocked(refresh)).toHaveBeenCalledTimes(1);
    // 文件单源：行真的写进了今日日志
    const content = readFileSync(join(dir, "log", `${todayStr()}.md`), "utf8");
    expect(content).toMatch(/^- \d{2}:\d{2} alljobs @joey 催一下审核进度\n$/);
  });

  it("空文本：validation，不 refresh、不落账", async () => {
    const r = await quickAdd(IDLE, fd({ text: "  ", slug: "alljobs", agent: "joey" }));
    expect(r).toEqual({ status: "validation" });
    expect(vi.mocked(refresh)).not.toHaveBeenCalled();
    expect(existsSync(join(dir, "log", `${todayStr()}.md`))).toBe(false);
  });

  it("未知 slug：validation，不落账", async () => {
    const r = await quickAdd(IDLE, fd({ text: "x", slug: "ghost", agent: "joey" }));
    expect(r).toEqual({ status: "validation" });
    expect(vi.mocked(refresh)).not.toHaveBeenCalled();
  });

  it("fs 失败：结构化 fs 状态（文件路径给手动补记提示），不抛 500", async () => {
    mkdirSync(join(dir, "log", `${todayStr()}.md`)); // 同名目录 → 写入必失败
    const r = await quickAdd(IDLE, fd({ text: "x", slug: "alljobs", agent: "joey" }));
    expect(r.status).toBe("fs");
    if (r.status === "fs") {
      expect(r.file).toContain(`${todayStr()}.md`);
      expect(r.message.length).toBeGreaterThan(0);
    }
    expect(vi.mocked(refresh)).not.toHaveBeenCalled();
  });

  it("FormData 缺字段按空串处理：不会抛 TypeError", async () => {
    const r = await quickAdd(IDLE, new FormData());
    expect(r).toEqual({ status: "validation" });
  });
});
