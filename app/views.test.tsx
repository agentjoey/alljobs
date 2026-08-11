import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { LedgerData, LogEntry, Project, ProofIssue } from "../lib/data/types";
import { OverviewView } from "./overview-view";
import { ProjectsView } from "./projects/projects-view";
import { DetailView } from "./projects/[slug]/detail-view";
import { ProjectNotFound } from "./projects/[slug]/not-found-view";
import { LogView } from "./log/log-view";

const NOW = new Date(2026, 7, 11, 12, 0); // 2026-08-11 周二
const TODAY = "2026-08-11";

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
    date: TODAY,
    time: "09:00",
    agent: "claude",
    text: "记录",
    file: `data/log/${TODAY}.md`,
    line: 1,
    ...e,
  };
}

function ledger(partial: Partial<LedgerData>): LedgerData {
  return { projects: [], entries: [], issues: [], ...partial };
}

function seedLedger(): LedgerData {
  const projects = [
    makeProject({
      slug: "pactify-apps",
      title: "Pactify Apps",
      priority: "P0",
      agents: ["claude", "codex"],
      due: "2026-08-20",
      next: ["App Store 提审材料与截图"],
    }),
    makeProject({
      slug: "alljobs",
      title: "AllJobs 工作台",
      priority: "P0",
      next: ["Mockup Gate 批准后开始 v1 实现"],
    }),
    makeProject({
      slug: "tradelinks",
      title: "TradeLinks",
      type: "biz",
      status: "blocked",
      blocked_reason: "等海外供应商报价答复",
      blocked_since: "2026-08-06",
      now: "等海外供应商报价答复——收到后更新选品测算。",
      agents: ["joey"],
    }),
    makeProject({
      slug: "petcare-app",
      title: "PetCare App",
      priority: "P2",
      agents: ["codex"],
      next: ["宠物档案页原型"],
    }),
    makeProject({
      slug: "design",
      title: "设计资产库",
      type: "ops",
      status: "done",
      priority: "P2",
      agents: ["joey"],
    }),
    makeProject({ slug: "mathmagics-mvp", title: "MathMagics MVP", status: "paused", priority: "P2" }),
    makeProject({
      slug: "astro",
      title: "东方星理 MVP",
      type: "product",
      priority: "P1",
      agents: ["kimi"],
      due: "2026-08-15",
      next: ["命盘算法 20 例准确性验证（12/20）"],
    }),
  ];
  const entries = [
    makeEntry({ slug: "tradelinks", time: "08:12", agent: "joey", text: "供应商邮件再跟进" }),
    makeEntry({ slug: "alljobs", time: "08:35", text: "T3 Brief 定稿" }),
    makeEntry({ slug: "pactify-apps", time: "09:42", agent: "codex", text: "TestFlight #42 上传" }),
    makeEntry({ slug: "astro", time: "10:05", agent: "kimi", text: "完成 12/20 例命盘验证" }),
    makeEntry({ slug: "petcare-app", date: "2026-08-03", text: "旧记录", file: "data/log/2026-08-03.md" }),
    makeEntry({ slug: "design", date: "2026-07-30", agent: "joey", text: "设计资产库整理归档，移交各项目引用", file: "data/log/2026-07-30.md" }),
  ];
  return ledger({ projects, entries });
}

describe("总览 /", () => {
  test("注意清单：blocked/停滞/到期戳 + 行链接 + 原因", () => {
    const html = renderToStaticMarkup(<OverviewView data={seedLedger()} now={NOW} />);
    const attnStart = html.indexOf("需要注意");
    const todayStart = html.indexOf("datestamp");
    const attn = html.slice(attnStart, todayStart);
    expect(attn).toContain("卡住 5 天");
    expect(attn).toContain("停滞 8 天");
    expect(attn).toContain("4 天到期"); // astro due 08-15
    expect(attn).toContain('href="/projects/tradelinks"');
    expect(attn).toContain("等海外供应商报价答复");
    // 排序：blocked → stale → dueSoon
    expect(attn.indexOf("卡住 5 天")).toBeLessThan(attn.indexOf("停滞 8 天"));
    expect(attn.indexOf("停滞 8 天")).toBeLessThan(attn.indexOf("4 天到期"));
  });

  test("今日：日期戳 + 条目按时间升序 + 快速添加占位行", () => {
    const html = renderToStaticMarkup(<OverviewView data={seedLedger()} now={NOW} />);
    expect(html).toContain("2026·08·11");
    expect(html).toContain("已记 4 笔");
    const i0812 = html.indexOf("08:12");
    const i0835 = html.indexOf("08:35");
    const i0942 = html.indexOf("09:42");
    expect(i0812).toBeGreaterThan(-1);
    expect(i0812).toBeLessThan(i0835);
    expect(i0835).toBeLessThan(i0942);
    expect(html).toContain("记一笔…（回车落账）");
    expect(html).toContain("落账");
  });

  test("右页：P0→P2 分组、NEXT、tally、last；done 进最近完成且不进右页", () => {
    const html = renderToStaticMarkup(<OverviewView data={seedLedger()} now={NOW} />);
    expect(html).toContain("P0 · 现在最重要");
    expect(html).toContain("NEXT");
    expect(html).toContain("App Store 提审材料与截图");
    expect(html.indexOf("P0 · 现在最重要")).toBeLessThan(html.indexOf(">P2<"));
    expect(html).toContain("近 14 天活动 →");
    expect(html).toContain("最近完成");
    expect(html).toContain("设计资产库整理归档");
    // done 项目不出现在右侧活跃底账分组行中
    const right = html.slice(html.indexOf("P0 · 现在最重要"));
    expect(right).not.toContain('href="/projects/design"');
    // paused 减淡
    expect(html).toContain("is-quiet");
  });

  test("空账：引导教 schema", () => {
    const html = renderToStaticMarkup(<OverviewView data={ledger({})} now={NOW} />);
    expect(html).toContain("空 账");
    expect(html).toContain("data/projects/");
    expect(html).toContain("title:");
  });

  test("注意清单为空：无事确认行", () => {
    const data = ledger({
      projects: [makeProject({ slug: "a" })],
      entries: [makeEntry({ slug: "a" })],
    });
    const html = renderToStaticMarkup(<OverviewView data={data} now={NOW} />);
    expect(html).toContain("无事");
    expect(html).toContain("今日无风险");
  });

  test("今日无日志：空格线 + 引导句", () => {
    const data = ledger({ projects: [makeProject({ slug: "a" })], entries: [] });
    const html = renderToStaticMarkup(<OverviewView data={data} now={NOW} />);
    expect(html).toContain("今天还没落过账");
  });

  test("校对横幅：有 issue 时出现在页首", () => {
    const issues: ProofIssue[] = [{ file: "data/log/2026-08-11.md", line: 6, message: "无法解析的日志行：oops" }];
    const html = renderToStaticMarkup(<OverviewView data={ledger({ issues })} now={NOW} />);
    expect(html).toContain("校对");
    expect(html).toContain("data/log/2026-08-11.md");
  });

  test("每页 h1 存在", () => {
    const html = renderToStaticMarkup(<OverviewView data={seedLedger()} now={NOW} />);
    expect(html).toContain("<h1");
  });
});

describe("项目列表 /projects", () => {
  test("默认全部：chip aria-current + 全量底账行", () => {
    const html = renderToStaticMarkup(<ProjectsView data={seedLedger()} filters={{}} now={NOW} />);
    expect(html).toContain("项目底账");
    for (const slug of ["pactify-apps", "tradelinks", "petcare-app", "design", "mathmagics-mvp"]) {
      expect(html).toContain(`href="/projects/${slug}"`);
    }
    // chips 是链接（role=link），选中态用 aria-current（aria-pressed 对 link 无效，axe critical）
    const chip = html.match(/<a[^>]*aria-current="true"[^>]*>全部[\s\S]*?<\/a>/);
    expect(chip).toBeTruthy();
    expect(html).not.toContain("aria-pressed");
  });

  test("过滤：status=done 只留 done；URL searchParams 驱动", () => {
    const html = renderToStaticMarkup(
      <ProjectsView data={seedLedger()} filters={{ status: "done" }} now={NOW} />,
    );
    expect(html).toContain('href="/projects/design"');
    expect(html).not.toContain('href="/projects/pactify-apps"');
    expect(html).toContain("status=done");
  });

  test("过滤无结果：说明行 + 清除过滤", () => {
    const html = renderToStaticMarkup(
      <ProjectsView data={seedLedger()} filters={{ type: "biz", agent: "kimi" }} now={NOW} />,
    );
    expect(html).toContain("没有同时满足");
    expect(html).toContain("清除过滤");
    expect(html).toContain('href="/projects"');
  });

  test("校对横幅出现", () => {
    const data = { ...seedLedger(), issues: [{ file: "data/projects/petcare-app.md", field: "links.folder", message: "缩进错误" }] };
    const html = renderToStaticMarkup(<ProjectsView data={data} filters={{}} now={NOW} />);
    expect(html).toContain("校对");
    expect(html).toContain("links.folder");
  });
});

describe("项目详情 /projects/[slug]", () => {
  test("详情头 + kv + Now/Next/Notes + 活动流倒序日分组", () => {
    const data = seedLedger();
    const html = renderToStaticMarkup(<DetailView data={data} slug="pactify-apps" now={NOW} />);
    expect(html).toContain("<h1");
    expect(html).toContain("Pactify Apps");
    expect(html).toContain("started");
    expect(html).toContain("2026-08-20");
    expect(html).toContain("当前 NOW");
    expect(html).toContain("下一步 NEXT");
    expect(html).toContain("App Store 提审材料与截图");
    // 活动流：今日在上，日内倒序
    const actStart = html.indexOf("活动");
    expect(actStart).toBeGreaterThan(-1);
  });

  test("blocked：页首红条含 blocked_reason 与天数", () => {
    const html = renderToStaticMarkup(<DetailView data={seedLedger()} slug="tradelinks" now={NOW} />);
    expect(html).toContain("blockbar");
    expect(html).toContain("卡住 5 天");
    expect(html).toContain("等海外供应商报价答复");
    expect(html).toContain("BLOCKED");
  });

  test("缺 Now：占位提示", () => {
    const html = renderToStaticMarkup(<DetailView data={seedLedger()} slug="petcare-app" now={NOW} />);
    expect(html).toContain("## Now");
    expect(html).toContain("缺");
  });

  test("无活动记录：引导句", () => {
    const html = renderToStaticMarkup(<DetailView data={seedLedger()} slug="mathmagics-mvp" now={NOW} />);
    expect(html).toContain("本页尚无记录");
    expect(html).toContain("data/log/");
  });

  test("链接行：repo/obsidian/folder/url 齐备才渲染", () => {
    const data = ledger({
      projects: [
        makeProject({
          slug: "linked",
          links: {
            repo: "~/AgentWorks/CodeSpace/linked",
            obsidian: "obsidian://open?vault=Main",
            folder: "~/Documents/linked",
            url: "https://linked.example",
          },
        }),
      ],
      entries: [makeEntry({ slug: "linked" })],
    });
    const html = renderToStaticMarkup(<DetailView data={data} slug="linked" now={NOW} />);
    expect(html).toContain("[repo]");
    expect(html).toContain("[vault]");
    expect(html).toContain("[dir]");
    expect(html).toContain("[url]");
  });

  test("「更早记录见日志」整句为独立链接（axe link-in-text-block）", () => {
    const html = renderToStaticMarkup(<DetailView data={seedLedger()} slug="pactify-apps" now={NOW} />);
    // 整句做成链接，而非在文本块中嵌入只靠颜色区分的小链接
    expect(html).toMatch(/<a[^>]*href="\/log\?slug=pactify-apps"[^>]*>更早记录见日志/);
    expect(html).not.toMatch(/更早记录见 <a/);
  });

  test("done：整页减淡 + DONE 戳", () => {
    const html = renderToStaticMarkup(<DetailView data={seedLedger()} slug="design" now={NOW} />);
    expect(html).toContain("DONE");
    expect(html).toContain("is-done");
  });
});

describe("slug 不存在", () => {
  test("not-found：查无此页 + 最近 slug 索引", () => {
    const html = renderToStaticMarkup(<ProjectNotFound data={seedLedger()} slug="foo" now={NOW} />);
    expect(html).toContain("查无此页");
    expect(html).toContain("foo");
    expect(html).toContain('href="/projects/pactify-apps"');
    expect(html).toContain("项目索引");
  });
});

describe("日志 /log", () => {
  test("日分组倒序、日内倒序、项目链接", () => {
    const html = renderToStaticMarkup(<LogView data={seedLedger()} filters={{}} now={NOW} />);
    const iToday = html.indexOf(TODAY);
    const i0803 = html.indexOf("2026-08-03");
    expect(iToday).toBeGreaterThan(-1);
    expect(iToday).toBeLessThan(i0803);
    const i0942 = html.indexOf("09:42");
    const i0812 = html.indexOf("08:12");
    expect(i0942).toBeLessThan(i0812); // 日内倒序：最新在上
    expect(html).toContain('href="/projects/tradelinks"');
    // dayhead 用标题元素（a11y 待办）
    expect(html).toMatch(/<h2[^>]*class="[^"]*d[^"]*"/);
  });

  test("项目过滤 chips 生效", () => {
    const html = renderToStaticMarkup(<LogView data={seedLedger()} filters={{ slug: "alljobs" }} now={NOW} />);
    expect(html).toContain("T3 Brief 定稿");
    expect(html).not.toContain("TestFlight #42 上传");
    // chips 是链接：选中态 aria-current，不得出现 aria-pressed（axe aria-allowed-attr）
    expect(html).toContain('aria-current="true"');
    expect(html).not.toContain("aria-pressed");
  });

  test("agent 过滤生效", () => {
    const html = renderToStaticMarkup(<LogView data={seedLedger()} filters={{ agent: "joey" }} now={NOW} />);
    expect(html).toContain("供应商邮件再跟进");
    expect(html).not.toContain("T3 Brief 定稿");
  });

  test("按月折叠：30 天前的记录聚合成月份占位", () => {
    const data = ledger({
      projects: [makeProject({ slug: "a" })],
      entries: [
        makeEntry({ slug: "a", date: "2026-08-10", text: "近期", file: "data/log/2026-08-10.md" }),
        makeEntry({ slug: "a", date: "2026-06-20", text: "远古一", file: "data/log/2026-06-20.md" }),
        makeEntry({ slug: "a", date: "2026-06-02", text: "远古二", file: "data/log/2026-06-02.md" }),
      ],
    });
    const html = renderToStaticMarkup(<LogView data={data} filters={{}} now={NOW} />);
    expect(html).toContain("近期");
    expect(html).not.toContain("远古一");
    expect(html).toContain("2026-06");
    expect(html).toContain("2 笔");
  });

  test("空日不渲染；无记录给引导", () => {
    const data = ledger({
      projects: [makeProject({ slug: "a" })],
      entries: [makeEntry({ slug: "a", date: "2026-08-10", file: "data/log/2026-08-10.md" })],
    });
    const html = renderToStaticMarkup(<LogView data={data} filters={{}} now={NOW} />);
    expect(html).not.toContain("2026-08-09");
    const empty = renderToStaticMarkup(<LogView data={ledger({})} filters={{}} now={NOW} />);
    expect(empty).toContain("还没有日志");
  });

  test("过滤无结果：说明 + 清除过滤（账上有日志时不得谎称空账）", () => {
    // alljobs + joey 组合为空，但账上有日志
    const html = renderToStaticMarkup(
      <LogView data={seedLedger()} filters={{ slug: "alljobs", agent: "joey" }} now={NOW} />,
    );
    expect(html).toContain("没有同时满足");
    expect(html).toContain("alljobs");
    expect(html).toContain("joey");
    expect(html).toContain("清除过滤");
    expect(html).toContain('href="/log"');
    expect(html).not.toContain("还没有日志");
    // 真·空账（一条日志都没有）才教 schema，即使带着过滤参数
    const empty = renderToStaticMarkup(
      <LogView data={ledger({})} filters={{ slug: "x" }} now={NOW} />,
    );
    expect(empty).toContain("还没有日志");
  });
});
