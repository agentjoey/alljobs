import Link from "next/link";
import { isoWeek, weekdayZh, type MastheadCounts } from "../../lib/data/derive";
import { toDateStr } from "./lib";

export type LedgerRoute = "overview" | "projects" | "log";

const TABS: { route: LedgerRoute; href: string; label: string }[] = [
  { route: "overview", href: "/", label: "总览" },
  { route: "projects", href: "/projects", label: "项目" },
  { route: "log", href: "/log", label: "日志" },
];

/** 页首 folio：wordmark + 日期 + 计数 + 索引标签（拇指索引的顶置形态） */
export function Masthead({
  current,
  counts,
  today,
}: {
  current: LedgerRoute;
  counts: MastheadCounts;
  today: Date;
}) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="folio">
          <Link className="wordmark" href="/">
            ALLJOBS
          </Link>
          <span className="folio-sub">AgentJoey 工作底账</span>
          <span className="folio-date">
            {toDateStr(today)} {weekdayZh(today)} · W{isoWeek(today)}
          </span>
          <span className="folio-counts">
            活跃 <strong>{counts.active}</strong> ·{" "}
            <span className="is-blocked">卡住 {counts.blocked}</span> · 今日{" "}
            <strong>{counts.todayCount}</strong> 笔
          </span>
        </div>
        <nav className="tabs" aria-label="主导航">
          {TABS.map((tab) => (
            <Link
              key={tab.route}
              className="tab"
              href={tab.href}
              aria-current={tab.route === current ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
