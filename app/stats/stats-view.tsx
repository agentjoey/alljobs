"use client";

import Link from "next/link";
import { mastheadCounts } from "@/lib/data/derive";
import type { LedgerData } from "@/lib/data/types";
import type { StatsResult } from "@/lib/data/stats";
import {
  AppShell,
  DetailCard,
  EmptyState,
} from "@/components/workbench";

export type StatsViewProps = {
  data: LedgerData;
  stats: StatsResult;
  now: Date;
};

export function StatsView({ data, stats, now }: StatsViewProps) {
  const counts = mastheadCounts(data.projects, data.entries, now);
  const taskTotal = stats.taskCounts.todo + stats.taskCounts.doing + stats.taskCounts.done;
  const taskDoneRate = taskTotal > 0 ? Math.round((stats.taskCounts.done / taskTotal) * 100) : 0;

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

  const maxDaily = Math.max(1, ...stats.entriesLast30Days.map((d) => d.count));
  const maxAgent = Math.max(1, ...stats.entriesByAgent.map((d) => d.count));
  const maxProject = Math.max(1, ...stats.entriesByProject.map((d) => d.count));

  return (
    <AppShell
      title="统计"
      activeItem="stats"
      counts={{ today: counts.todayCount, attention }}
      attentionCount={attention}
      projectsByStatus={projectsByStatus}
      newEntrySlugs={writableSlugs}
    >
      <div className="space-y-6 p-6">
        {data.entries.length === 0 && data.projects.length === 0 ? (
          <EmptyState
            title="还没有足够数据"
            description="等项目和日志积累后，统计会自动呈现。"
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MetricCard label="活跃项目" value={stats.activeProjectsCount} />
              <MetricCard label="今日日志" value={counts.todayCount} />
              <MetricCard label="连续记录" value={stats.currentStreak} suffix="天" />
              <MetricCard label="任务完成率" value={taskDoneRate} suffix="%" />
            </div>

            <DetailCard title="最近 30 天日志">
              <div className="flex h-32 items-end gap-1">
                {stats.entriesLast30Days.map((d) => (
                  <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm bg-accent/80 transition-state hover:bg-accent"
                      style={{ height: `${(d.count / maxDaily) * 128}px` }}
                      aria-label={`${d.date}: ${d.count} 笔`}
                    />
                    <span className="text-[10px] text-label-tertiary">
                      {d.date.slice(8)}
                    </span>
                  </div>
                ))}
              </div>
            </DetailCard>

            <div className="grid gap-4 lg:grid-cols-2">
              <DetailCard title="Agent 分布">
                {stats.entriesByAgent.length === 0 ? (
                  <p className="text-[13px] text-label-tertiary">暂无记录</p>
                ) : (
                  <div className="space-y-2">
                    {stats.entriesByAgent.map(({ agent, count }) => (
                      <div key={agent} className="flex items-center gap-3">
                        <span className="w-12 text-[13px] text-label-secondary">{agent}</span>
                        <div className="flex-1">
                          <div
                            className="h-2 rounded-full bg-accent"
                            style={{ width: `${(count / maxAgent) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-[12px] text-label-tertiary">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </DetailCard>

              <DetailCard title="项目分布">
                {stats.entriesByProject.length === 0 ? (
                  <p className="text-[13px] text-label-tertiary">暂无记录</p>
                ) : (
                  <div className="space-y-2">
                    {stats.entriesByProject.slice(0, 10).map(({ slug, count }) => (
                      <div key={slug} className="flex items-center gap-3">
                        <Link
                          href={`/projects/${slug}`}
                          className="w-24 truncate text-[13px] text-accent-text hover:underline"
                        >
                          {slug}
                        </Link>
                        <div className="flex-1">
                          <div
                            className="h-2 rounded-full bg-green"
                            style={{ width: `${(count / maxProject) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-[12px] text-label-tertiary">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </DetailCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <DetailCard title="任务">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[20px] font-semibold text-label-primary">
                      {stats.taskCounts.todo}
                    </div>
                    <div className="text-[11px] text-label-tertiary">待办</div>
                  </div>
                  <div>
                    <div className="text-[20px] font-semibold text-label-primary">
                      {stats.taskCounts.doing}
                    </div>
                    <div className="text-[11px] text-label-tertiary">进行中</div>
                  </div>
                  <div>
                    <div className="text-[20px] font-semibold text-label-primary">
                      {stats.taskCounts.done}
                    </div>
                    <div className="text-[11px] text-label-tertiary">已完成</div>
                  </div>
                </div>
              </DetailCard>

              <DetailCard title="会话摘要">
                <div className="text-[28px] font-semibold text-label-primary">
                  {stats.sessionCount}
                </div>
                <p className="text-[13px] text-label-secondary">条 agent 会话记录</p>
              </DetailCard>

              <DetailCard title="最长连续记录">
                <div className="text-[28px] font-semibold text-label-primary">
                  {stats.longestStreak}
                </div>
                <p className="text-[13px] text-label-secondary">天</p>
              </DetailCard>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <div className="text-[28px] font-semibold text-label-primary">
        {value}
        {suffix && <span className="ml-1 text-[15px] font-normal">{suffix}</span>}
      </div>
      <div className="text-[13px] text-label-secondary">{label}</div>
    </div>
  );
}
