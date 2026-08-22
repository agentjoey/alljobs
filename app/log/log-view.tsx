"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Fragment } from "react";
import { mastheadCounts, weekdayZh } from "@/lib/data/derive";
import type { LedgerData } from "@/lib/data/types";
import {
  AppShell,
  EmptyState,
  ProofBanner,
  SegmentedControl,
} from "@/components/workbench";
import { EntryRow } from "@/components/workbench/EntryRow";
import {
  foldOlderThan,
  groupByDay,
  toDateStr,
  toggleHref,
} from "@/components/workbench/lib";

const AGENT_ORDER = ["claude", "codex", "kimi", "joey"];
const TOP_SLUGS = 3;

export type LogViewProps = {
  data: LedgerData;
  now: Date;
};

export function LogView({ data, now }: LogViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const slug = sp.get("slug") ?? undefined;
  const agent = sp.get("agent") ?? undefined;
  const more = sp.get("more") ?? undefined;

  const counts = mastheadCounts(data.projects, data.entries, now);
  const todayStr = toDateStr(now);
  const filtered = data.entries.filter(
    (e) =>
      (!slug || e.slug === slug) && (!agent || e.agent === agent),
  );
  const { recent, months } = foldOlderThan(groupByDay(filtered), now);

  const current: Record<string, string | undefined> = { slug, agent, more };

  const countBySlug = new Map<string, number>();
  for (const e of data.entries) countBySlug.set(e.slug, (countBySlug.get(e.slug) ?? 0) + 1);
  const slugs = [...countBySlug.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const expanded = more === "1";
  const visibleSlugs = expanded ? slugs : slugs.slice(0, TOP_SLUGS);
  const agents = [
    ...AGENT_ORDER.filter((a) => data.entries.some((e) => e.agent === a)),
    ...new Set(data.entries.map((e) => e.agent).filter((a) => !AGENT_ORDER.includes(a))),
  ];

  const slugOptions = [
    { value: "all", label: "全部项目", count: data.entries.length },
    ...visibleSlugs.map(([s, c]) => ({ value: s, label: s, count: c })),
    ...(slugs.length > TOP_SLUGS
      ? [{ value: "more", label: expanded ? "收起" : "更多", count: undefined }]
      : []),
  ];

  const agentOptions = [
    { value: "all", label: "全部记录者", count: undefined },
    ...agents.map((a) => ({
      value: a,
      label: a,
      count: data.entries.filter((e) => e.agent === a).length,
    })),
  ];

  const derived = data.projects.map((p) => ({ slug: p.slug, title: p.title }));
  const attention = data.projects.filter(
    (p) => p.status === "blocked",
  ).length;
  const projectsByStatus = {
    active: derived.filter((_, i) => data.projects[i].status === "active"),
    paused: derived.filter((_, i) => data.projects[i].status === "paused"),
    done: derived.filter((_, i) => data.projects[i].status === "done"),
  };
  const writableSlugs = data.projects
    .filter((p) => p.status === "active" || p.status === "blocked")
    .map((p) => p.slug);

  return (
    <AppShell
      title="日志"
      activeItem="log"
      counts={{ today: counts.todayCount, attention }}
      attentionCount={attention}
      projectsByStatus={projectsByStatus}
      newEntrySlugs={writableSlugs}
    >
      <div className="space-y-4 p-6">
        <ProofBanner issues={data.issues} />

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            className="flex-wrap"
            options={slugOptions}
            value={slug ?? (more === "1" ? "more" : "all")}
            onChange={(v) => {
              if (v === "more") {
                router.push(toggleHref("/log", current, "more", expanded ? "" : "1"));
              } else {
                const next: Record<string, string | undefined> = { ...current };
                delete next.more;
                router.push(toggleHref("/log", next, "slug", v === "all" ? "" : v));
              }
            }}
          />
          <SegmentedControl
            className="flex-wrap"
            options={agentOptions}
            value={agent ?? "all"}
            onChange={(v) => {
              router.push(toggleHref("/log", current, "agent", v === "all" ? "" : v));
            }}
          />
        </div>

        {recent.length === 0 && months.length === 0 && (
          <EmptyState
            title="没有日志"
            description={
              data.entries.length === 0
                ? `在 data/log/${todayStr}.md 写下第一行：- HH:MM slug @agent 内容`
                : "没有同时满足过滤条件的日志。"
            }
            action={
              data.entries.length > 0 ? (
                <Link href="/log" className="text-accent-text hover:underline">
                  清除过滤
                </Link>
              ) : undefined
            }
          />
        )}

        {recent.map((g) => (
          <Fragment key={g.date}>
            <h2 className="text-[13px] font-semibold text-label-secondary">
              {g.date} {weekdayZh(g.date)}
              {g.date === todayStr && " · 今日"} · {g.entries.length} 笔
            </h2>
            <div className="rounded-lg border border-hairline bg-surface">
              {g.entries.map((e) => (
                <EntryRow key={`${e.date}-${e.line}`} entry={e} />
              ))}
            </div>
          </Fragment>
        ))}

        {months.length > 0 && (
          <div className="rounded-lg border border-hairline bg-surface p-4">
            {months.map((m) => (
              <div
                key={m.month}
                className="flex justify-between border-b border-hairline py-2 text-[14px] last:border-b-0"
              >
                <span className="text-label-secondary">{m.month}</span>
                <span className="text-label-tertiary">{m.count} 笔</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
