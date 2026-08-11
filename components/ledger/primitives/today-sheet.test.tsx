import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { LogEntry } from "../../../lib/data/types";
import { TodaySheet } from "./today-sheet";

function makeEntry(e: Partial<LogEntry> & { slug: string }): LogEntry {
  return {
    date: "2026-08-11",
    time: "09:00",
    agent: "claude",
    text: "记录",
    file: "data/log/2026-08-11.md",
    line: 1,
    ...e,
  };
}

describe("TodaySheet（快速添加接线）", () => {
  test("idle：控件可用、name 齐备、submit 钮、占位文案（回车落账）", () => {
    const html = renderToStaticMarkup(<TodaySheet entries={[makeEntry({ slug: "alljobs" })]} slugs={["alljobs"]} />);
    expect(html).toContain("记一笔…");
    expect(html).toContain("日志内容（回车落账）");
    expect(html).toContain('name="text"');
    expect(html).toContain('name="slug"');
    expect(html).toContain('name="agent"');
    expect(html).toContain('type="submit"');
    // T2 占位行是全 disabled；接线后 idle 态控件可用（唯一 disabled 是占位 option「选择项目…」）
    expect(html.match(/disabled/g)).toHaveLength(1);
    expect(html).not.toMatch(/<input[^>]*disabled/);
    expect(html).not.toMatch(/<button[^>]*disabled/);
    // idle 无校验错误
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("err-inline");
  });

  test("初始渲染无 is-new（印压只给落账成功的那一行）", () => {
    const html = renderToStaticMarkup(
      <TodaySheet entries={[makeEntry({ slug: "alljobs" })]} slugs={["alljobs"]} />,
    );
    expect(html).not.toContain("is-new");
  });

  test("今日无日志：引导句（样张 14）", () => {
    const html = renderToStaticMarkup(<TodaySheet entries={[]} slugs={["alljobs"]} />);
    expect(html).toContain("今天还没落过账");
  });

  test("项目 select 只给可写 slug；记录者默认 joey", () => {
    const html = renderToStaticMarkup(
      <TodaySheet entries={[]} slugs={["alljobs", "tradelinks"]} />,
    );
    expect(html).toContain('value="alljobs"');
    expect(html).toContain('value="tradelinks"');
    expect(html).toContain('value="joey"');
    expect(html).toContain('value="kimi"');
  });
});
