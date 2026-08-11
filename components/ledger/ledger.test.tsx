import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { deriveProjects, attentionList, type AttentionItem } from "../../lib/data/derive";
import type { LogEntry, Project, ProofIssue } from "../../lib/data/types";
import {
  attentionStamp,
  attentionWhy,
  countInWindow,
  filterProjects,
  foldOlderThan,
  formatMmDd,
  groupByDay,
  recentSlugs,
  rowStamp,
  sortForIndex,
  tallyDates,
  toggleHref,
} from "./lib";
import { AgentMark } from "./primitives/agent-mark";
import { ContractComment } from "./contract";
import { DateStamp } from "./primitives/date-stamp";
import { Masthead } from "./masthead";
import { ProofBanner } from "./primitives/proof-banner";
import { SectionHead } from "./primitives/section-head";
import { Stamp } from "./primitives/stamp";
import { Tally } from "./primitives/tally";

const TODAY = new Date(2026, 7, 11, 12, 0); // 2026-08-11 周二

function makeProject(p: Partial<Project> & { slug: string }): Project {
  return {
    file: `data/projects/${p.slug}.md`,
    title: p.slug,
    type: "code",
    status: "active",
    priority: "P1",
    agents: ["claude"],
    tags: [],
    started: "2026-06-01",
    now: null,
    next: [],
    notes: null,
    ...p,
  };
}

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

function attentionOf(project: Project, entries: LogEntry[]): AttentionItem {
  const [derived] = deriveProjects([project], entries, TODAY);
  const [item] = attentionList(derived ? [derived] : []);
  if (!item) throw new Error(`expected attention item for ${project.slug}`);
  return item;
}

describe("lib · 戳文案与原因", () => {
  test("blocked：卡住 N 天 + blocked_reason", () => {
    const item = attentionOf(
      makeProject({
        slug: "tradelinks",
        status: "blocked",
        blocked_reason: "等海外供应商报价答复",
        blocked_since: "2026-08-06",
      }),
      [],
    );
    expect(attentionStamp(item, TODAY)).toEqual({ cls: "blocked", text: "卡住 5 天" });
    expect(attentionWhy(item)).toContain("等海外供应商报价答复");
  });

  test("blocked：why 只取 now 首句（对齐 mockup 单行密度）", () => {
    const item = attentionOf(
      makeProject({
        slug: "wordy",
        status: "blocked",
        blocked_reason: "r",
        blocked_since: "2026-08-06",
        now: "第一句说到这里。第二句不该出现在 why 里。\n换行后的也不该。",
      }),
      [],
    );
    expect(attentionWhy(item)).toBe("第一句说到这里。");
    // 无句读时退到首个换行；单句则原样
    const nonStop = attentionOf(
      makeProject({
        slug: "wordy2",
        status: "blocked",
        blocked_reason: "r",
        blocked_since: "2026-08-06",
        now: "没有句读的一行\n后面还有",
      }),
      [],
    );
    expect(attentionWhy(nonStop)).toBe("没有句读的一行");
  });

  test("stale：停滞 N 天；从未记录时给明确文案", () => {
    const stale = attentionOf(
      makeProject({ slug: "petcare-app", next: ["宠物档案页原型"] }),
      [makeEntry({ slug: "petcare-app", date: "2026-08-03" })],
    );
    expect(attentionStamp(stale, TODAY)).toEqual({ cls: "stale", text: "停滞 8 天" });
    expect(attentionWhy(stale)).toContain("上次记录 08-03");

    const never = attentionOf(makeProject({ slug: "fresh" }), []);
    expect(attentionStamp(never, TODAY).text).toBe("从未记录");
  });

  test("dueSoon：N 天到期 / 今日到期 / 逾期 N 天", () => {
    const due = attentionOf(
      makeProject({ slug: "astro", due: "2026-08-15" }),
      [makeEntry({ slug: "astro" })],
    );
    expect(attentionStamp(due, TODAY)).toEqual({ cls: "due", text: "4 天到期" });
    expect(attentionWhy(due)).toContain("due 08-15");

    const today0 = attentionOf(
      makeProject({ slug: "astro", due: "2026-08-11" }),
      [makeEntry({ slug: "astro" })],
    );
    expect(attentionStamp(today0, TODAY).text).toBe("今日到期");

    const overdue = attentionOf(
      makeProject({ slug: "astro", due: "2026-08-08" }),
      [makeEntry({ slug: "astro" })],
    );
    expect(attentionStamp(overdue, TODAY).text).toBe("逾期 3 天");
  });

  test("rowStamp：blocked 优先于停滞；paused/done 直取状态", () => {
    const [blocked] = deriveProjects(
      [makeProject({ slug: "a", status: "blocked", blocked_reason: "x" })],
      [],
      TODAY,
    );
    expect(rowStamp(blocked!)).toEqual({ cls: "blocked", text: "卡住" });

    const [stale] = deriveProjects([makeProject({ slug: "b" })], [], TODAY);
    expect(rowStamp(stale!)).toEqual({ cls: "stale", text: "停滞" });

    const [active] = deriveProjects(
      [makeProject({ slug: "c" })],
      [makeEntry({ slug: "c" })],
      TODAY,
    );
    expect(rowStamp(active!)).toEqual({ cls: "active", text: "进行中" });

    const [paused] = deriveProjects(
      [makeProject({ slug: "d", status: "paused" })],
      [],
      TODAY,
    );
    expect(rowStamp(paused!)).toEqual({ cls: "paused", text: "暂停" });

    const [done] = deriveProjects([makeProject({ slug: "e", status: "done" })], [], TODAY);
    expect(rowStamp(done!)).toEqual({ cls: "done", text: "已完成" });
  });
});

describe("lib · 过滤 / 分组 / 折叠", () => {
  const projects = [
    makeProject({ slug: "a", type: "code", status: "active", agents: ["claude"] }),
    makeProject({ slug: "b", type: "biz", status: "blocked", agents: ["joey"] }),
    makeProject({ slug: "c", type: "code", status: "done", agents: ["kimi", "claude"] }),
  ];

  test("filterProjects：status/type/agent 组合，空过滤返回全集", () => {
    expect(filterProjects(projects, {})).toHaveLength(3);
    expect(filterProjects(projects, { status: "done" }).map((p) => p.slug)).toEqual(["c"]);
    expect(filterProjects(projects, { type: "code" }).map((p) => p.slug)).toEqual(["a", "c"]);
    expect(filterProjects(projects, { agent: "claude" }).map((p) => p.slug)).toEqual(["a", "c"]);
    expect(filterProjects(projects, { type: "code", agent: "kimi" }).map((p) => p.slug)).toEqual(["c"]);
    expect(filterProjects(projects, { status: "paused" })).toHaveLength(0);
  });

  test("toggleHref：选中即去除参数，未选即设置，保留其它参数", () => {
    expect(toggleHref("/projects", {}, "status", "done")).toBe("/projects?status=done");
    expect(toggleHref("/projects", { status: "done" }, "status", "done")).toBe("/projects");
    expect(toggleHref("/projects", { type: "code" }, "status", "done")).toBe(
      "/projects?type=code&status=done",
    );
    expect(toggleHref("/log", { slug: "a", agent: "kimi" }, "agent", "kimi")).toBe("/log?slug=a");
  });

  test("groupByDay：日期倒序，日内按时间倒序", () => {
    const groups = groupByDay([
      makeEntry({ slug: "a", date: "2026-08-10", time: "10:00" }),
      makeEntry({ slug: "a", date: "2026-08-11", time: "08:00" }),
      makeEntry({ slug: "a", date: "2026-08-11", time: "09:30" }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(["2026-08-11", "2026-08-10"]);
    expect(groups[0]!.entries.map((e) => e.time)).toEqual(["09:30", "08:00"]);
  });

  test("foldOlderThan：30 天内全量，更早按月聚合计数", () => {
    const groups = groupByDay([
      makeEntry({ slug: "a", date: "2026-08-10" }),
      makeEntry({ slug: "a", date: "2026-07-20" }),
      makeEntry({ slug: "a", date: "2026-07-02" }),
      makeEntry({ slug: "a", date: "2026-06-15" }),
    ]);
    const { recent, months } = foldOlderThan(groups, TODAY);
    expect(recent.map((g) => g.date)).toEqual(["2026-08-10", "2026-07-20"]);
    expect(months).toEqual([
      { month: "2026-07", count: 1 },
      { month: "2026-06", count: 1 },
    ]);
  });

  test("recentSlugs：按最近活动排序，无记录者排后按 slug", () => {
    const derived = deriveProjects(
      [makeProject({ slug: "zeta" }), makeProject({ slug: "alpha" }), makeProject({ slug: "mid" })],
      [makeEntry({ slug: "mid", date: "2026-08-10" }), makeEntry({ slug: "zeta", date: "2026-08-11" })],
      TODAY,
    );
    expect(recentSlugs(derived, 3)).toEqual(["zeta", "mid", "alpha"]);
  });

  test("countInWindow / tallyDates / formatMmDd", () => {
    const entries = [
      makeEntry({ slug: "a", date: "2026-08-11" }),
      makeEntry({ slug: "a", date: "2026-07-01" }),
      makeEntry({ slug: "b", date: "2026-08-11" }),
    ];
    expect(countInWindow(entries, "a", TODAY)).toBe(1);
    const dates = tallyDates(TODAY);
    expect(dates).toHaveLength(14);
    expect(dates[0]).toBe("2026-07-29");
    expect(dates[13]).toBe("2026-08-11");
    expect(formatMmDd("2026-08-15")).toBe("08-15");
  });

  test("sortForIndex：优先级 → 安静组（paused/done）沉底 → 最近活动", () => {
    const derived = deriveProjects(
      [
        makeProject({ slug: "p2", priority: "P2" }),
        makeProject({ slug: "done0", priority: "P0", status: "done" }),
        makeProject({ slug: "old", priority: "P0" }),
        makeProject({ slug: "hot", priority: "P0" }),
      ],
      [makeEntry({ slug: "hot" }), makeEntry({ slug: "old", date: "2026-08-01" })],
      TODAY,
    );
    expect(sortForIndex(derived).map((p) => p.slug)).toEqual(["hot", "old", "done0", "p2"]);
  });
});

describe("primitives · 渲染", () => {
  test("Stamp：kind 进 class，文字承载状态", () => {
    const html = renderToStaticMarkup(<Stamp kind="blocked">卡住 5 天</Stamp>);
    expect(html).toContain('class="stamp blocked"');
    expect(html).toContain("卡住 5 天");
  });

  test("AgentMark：已知 agent 用色标 class，未知 agent 不染色但文字保留", () => {
    expect(renderToStaticMarkup(<AgentMark name="kimi" />)).toContain('class="agent kimi"');
    const unknown = renderToStaticMarkup(<AgentMark name="gpt" />);
    expect(unknown).toContain('class="agent"');
    expect(unknown).toContain("gpt");
  });

  test("Tally：14 格、data-v 由数据驱动、aria 文本由数据生成", () => {
    const counts = [0, 0, 1, 2, 3, 4, 0, 0, 0, 1, 0, 2, 3, 2];
    const html = renderToStaticMarkup(
      <Tally counts={counts} dates={tallyDates(TODAY)} total={16} />,
    );
    expect(html.match(/<i /g)).toHaveLength(14);
    expect(html).toContain('data-v="4"');
    expect(html).toContain('role="img"');
    expect(html).toContain("近 14 天 16 条记录");
    expect(html).toContain("08-11 · 2 笔");
  });

  test("DateStamp：签名元素，日期 + 今日", () => {
    const html = renderToStaticMarkup(<DateStamp date="2026-08-11" />);
    // large title 直出 ISO 日期（账本世界的 2026·08·11 分隔符已随改版移除）
    expect(html).toContain("2026-08-11");
    expect(html).toContain("今日");
    expect(html).toContain("datestamp");
  });

  test("SectionHead：标题元素 + 计数 + aside", () => {
    const html = renderToStaticMarkup(<SectionHead title="需要注意" count="3 项" aside="近 14 天活动 →" />);
    expect(html).toContain("<h2");
    expect(html).toContain("需要注意");
    expect(html).toContain("3 项");
    expect(html).toContain("近 14 天活动 →");
  });

  test("ProofBanner：role=status，列出文件与行号/字段", () => {
    const issues: ProofIssue[] = [
      { file: "data/projects/petcare-app.md", field: "links.folder", message: "缩进错误" },
      { file: "data/log/2026-08-11.md", line: 6, message: "无法解析的日志行" },
    ];
    const html = renderToStaticMarkup(<ProofBanner issues={issues} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("校对");
    expect(html).toContain("data/projects/petcare-app.md");
    expect(html).toContain("links.folder");
    expect(html).toContain("第 6 行");
  });

  test("Masthead：计数 + 索引标签 aria-current", () => {
    const html = renderToStaticMarkup(
      <Masthead current="projects" counts={{ active: 7, blocked: 1, todayCount: 3 }} today={TODAY} />,
    );
    expect(html).toContain("2026-08-11 周二 · W33");
    expect(html).toContain("活跃");
    expect(html).toContain("卡住 1");
    expect(html).toContain("今日");
    const tabsNav = html.slice(html.indexOf("<nav"));
    expect(tabsNav).toContain('href="/"');
    expect(tabsNav).toContain('href="/projects"');
    expect(tabsNav).toContain('aria-current="page"');
    const currentTab = tabsNav.match(/<a[^>]*aria-current="page"[^>]*>[^<]*<\/a>/);
    expect(currentTab?.[0]).toContain("/projects");
  });

  test("契约注释：THESIS…FINISH 六块 + seed cda17d0d", () => {
    const html = renderToStaticMarkup(<ContractComment />);
    for (const key of ["THESIS", "OWN-WORLD", "STORY", "FIRST VIEWPORT", "FORM", "FINISH", "cda17d0d"]) {
      expect(html).toContain(key);
    }
    expect(html).toContain("<!--");
  });
});
