import Link from "next/link";
import { mastheadCounts, weekdayZh } from "../../lib/data/derive";
import type { LedgerData } from "../../lib/data/types";
import { Footer } from "../../components/ledger/footer";
import { Masthead } from "../../components/ledger/masthead";
import {
  foldOlderThan,
  groupByDay,
  toDateStr,
  toggleHref,
} from "../../components/ledger/lib";
import { EntryRow } from "../../components/ledger/primitives/entry-row";
import { ProofBanner } from "../../components/ledger/primitives/proof-banner";
import { SectionHead } from "../../components/ledger/primitives/section-head";
import { Sheet } from "../../components/ledger/primitives/sheet";

export interface LogFilters {
  slug?: string;
  agent?: string;
  more?: string;
}

const AGENT_ORDER = ["claude", "codex", "kimi", "joey"];
const TOP_SLUGS = 3;

/** /log：日分组倒序（检索逻辑：最新在上），项目/agent 过滤 chips，空日不渲染，按月折叠 */
export function LogView({
  data,
  filters,
  now,
}: {
  data: LedgerData;
  filters: LogFilters;
  now: Date;
}) {
  const counts = mastheadCounts(data.projects, data.entries, now);
  const todayStr = toDateStr(now);
  const filtered = data.entries.filter(
    (e) =>
      (!filters.slug || e.slug === filters.slug) &&
      (!filters.agent || e.agent === filters.agent),
  );
  const { recent, months } = foldOlderThan(groupByDay(filtered), now);

  const current: Record<string, string | undefined> = {
    slug: filters.slug,
    agent: filters.agent,
    more: filters.more,
  };
  const countBySlug = new Map<string, number>();
  for (const e of data.entries) countBySlug.set(e.slug, (countBySlug.get(e.slug) ?? 0) + 1);
  const slugs = [...countBySlug.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const expanded = filters.more === "1";
  const visibleSlugs = expanded ? slugs : slugs.slice(0, TOP_SLUGS);
  const agents = [
    ...AGENT_ORDER.filter((a) => data.entries.some((e) => e.agent === a)),
    ...new Set(data.entries.map((e) => e.agent).filter((a) => !AGENT_ORDER.includes(a))),
  ];
  const clearSlug = (() => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(current)) {
      if (v !== undefined && k !== "slug" && k !== "more") next[k] = v;
    }
    const qs = new URLSearchParams(next).toString();
    return qs ? `/log?${qs}` : "/log";
  })();

  return (
    <>
      <Masthead current="log" counts={counts} today={now} />
      <main className="ledger">
        <h1 className="sr-only">日志 · alljobs 工作底账</h1>
        <ProofBanner issues={data.issues} />

        <div className="filters" role="group" aria-label="过滤">
          <Link className="chip" href={clearSlug} aria-pressed={!filters.slug}>
            全部项目
          </Link>
          {visibleSlugs.map(([slug]) => (
            <Link
              key={slug}
              className="chip"
              href={toggleHref("/log", current, "slug", slug)}
              aria-pressed={filters.slug === slug}
            >
              {slug}
            </Link>
          ))}
          {slugs.length > TOP_SLUGS && (
            <Link
              className="chip"
              href={toggleHref("/log", current, "more", "1")}
              aria-pressed={expanded}
            >
              {expanded ? "收起" : "更多 ›"}
            </Link>
          )}
          <span className="chip-gap" aria-hidden="true" />
          {agents.map((a) => (
            <Link
              key={a}
              className="chip"
              href={toggleHref("/log", current, "agent", a)}
              aria-pressed={filters.agent === a}
            >
              {a}
            </Link>
          ))}
        </div>

        {recent.length === 0 && months.length === 0 && (
          <Sheet>
            <div className="row">
              <span className="margin" aria-hidden="true">
                —
              </span>
              <span className="body body--muted">
                还没有日志。在 <span className="mono mono--sm">data/log/{todayStr}.md</span>{" "}
                写下第一行：<span className="mono mono--sm">- HH:MM slug @agent 内容</span>
              </span>
            </div>
          </Sheet>
        )}

        {recent.map((g) => (
          <div key={g.date}>
            <SectionHead
              day
              title={`${g.date} ${weekdayZh(g.date)}${g.date === todayStr ? " · 今日" : ""}`}
              count={`${g.entries.length} 笔`}
            />
            <Sheet>
              {g.entries.map((e) => (
                <EntryRow key={`${e.date}-${e.line}`} entry={e} />
              ))}
            </Sheet>
          </div>
        ))}

        {months.length > 0 && (
          <Sheet className="sheet--months">
            {months.map((m) => (
              <div key={m.month} className="row">
                <span className="margin">{m.month}</span>
                <span className="body body--muted">按月折叠 · {m.count} 笔</span>
              </div>
            ))}
          </Sheet>
        )}
        <p className="empty-note empty-note--flush">空日不占页。</p>
      </main>
      <Footer
        left="alljobs 工作底账 · data/log/*.md"
        right="行文法：- HH:MM slug @agent 内容"
      />
    </>
  );
}
