"use client";

import Link from "next/link";
import {
  attentionList,
  deriveProjects,
  mastheadCounts,
  weekdayZh,
} from "@/lib/data/derive";
import type { LedgerData } from "@/lib/data/types";
import {
  AppShell,
  DetailCard,
  EmptyState,
  ListRow,
  ProofBanner,
  StatusDot,
} from "@/components/workbench";
import { EntryRow } from "@/components/workbench/EntryRow";
import {
  attentionStamp,
  attentionWhy,
  sortForIndex,
  toDateStr,
} from "@/components/workbench/lib";

export type TodayViewProps = {
  data: LedgerData;
  now: Date;
};

export function TodayView({ data, now }: TodayViewProps) {
  const derived = sortForIndex(deriveProjects(data.projects, data.entries, now));
  const attention = attentionList(derived);
  const counts = mastheadCounts(data.projects, data.entries, now);
  const todayStr = toDateStr(now);
  const todayEntries = data.entries
    .filter((e) => e.date === todayStr)
    .sort((a, b) => a.time.localeCompare(b.time));

  const projectsByStatus = {
    active: derived.filter((p) => p.status === "active").map((p) => ({ slug: p.slug, title: p.title })),
    paused: derived.filter((p) => p.status === "paused").map((p) => ({ slug: p.slug, title: p.title })),
    done: derived.filter((p) => p.status === "done").map((p) => ({ slug: p.slug, title: p.title })),
  };

  const writableSlugs = derived
    .filter((p) => p.status === "active" || p.status === "blocked")
    .map((p) => p.slug);

  return (
    <AppShell
      title="今天"
      activeItem="today"
      counts={{ today: counts.todayCount, attention: attention.length }}
      attentionCount={attention.length}
      projectsByStatus={projectsByStatus}
      newEntrySlugs={writableSlugs}
    >
      <div className="space-y-6 p-6">
        <ProofBanner issues={data.issues} />

        {data.projects.length === 0 ? (
          <EmptyState
            title="还没有项目"
            description="在 data/projects/ 下新建 md 文件，或让任何 agent 替你建——文件即真相。"
          />
        ) : (
          <>
            {attention.length > 0 && (
              <DetailCard title={`注意力 · ${attention.length} 项`}>
                <div className="flex flex-col gap-1">
                  {attention.map((item) => {
                    const stamp = attentionStamp(item, now);
                    return (
                      <ListRow
                        key={item.project.slug}
                        href={`/projects/${item.project.slug}`}
                        title={item.project.title}
                        subtitle={attentionWhy(item)}
                        meta={item.project.priority}
                        leading={
                          <StatusDot
                            status={stamp.cls}
                            label={stamp.text}
                          />
                        }
                      />
                    );
                  })}
                </div>
              </DetailCard>
            )}

            <DetailCard
              title={`今日 · ${weekdayZh(todayStr)} · ${todayEntries.length} 笔`}
            >
              {todayEntries.length === 0 ? (
                <EmptyState
                  title="今天还没落过账"
                  description="点击右上角「新建日志」写下第一笔，或让手头的 agent 记上一行。"
                />
              ) : (
                <div className="-mx-4">
                  {todayEntries.map((e) => (
                    <EntryRow key={`${e.date}-${e.line}`} entry={e} />
                  ))}
                </div>
              )}
            </DetailCard>

            <div className="flex items-center justify-between text-[13px] text-label-secondary">
              <span>
                活跃 {counts.active} · 卡住 {counts.blocked} ·{" "}
                <Link href="/log" className="text-accent-text hover:underline">
                  全部日志
                </Link>
              </span>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
