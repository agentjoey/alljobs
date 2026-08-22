import Link from "next/link";
import { Fragment } from "react";
import { deriveProjects, weekdayZh } from "@/lib/data/derive";
import type { LedgerData, TaskBucket } from "@/lib/data/types";
import {
  AgentPill,
  Badge,
  DetailCard,
  EmptyState,
  StatusDot,
} from "@/components/workbench";
import { EntryRow } from "@/components/workbench/EntryRow";
import { countInWindow, formatMmDd, groupByDay, toDateStr } from "@/components/workbench/lib";

export type DetailViewProps = {
  data: LedgerData;
  slug: string;
  now: Date;
  tasks: Map<string, TaskBucket>;
};

export function DetailView({ data, slug, now, tasks }: DetailViewProps) {
  const project = data.projects.find((p) => p.slug === slug)!;
  const [derived] = deriveProjects([project], data.entries, now);
  const mine = data.entries.filter((e) => e.slug === slug);
  const days = groupByDay(mine);
  const total14 = countInWindow(data.entries, slug, now);
  const todayStr = toDateStr(now);
  const dueDays =
    project.due !== undefined
      ? Math.round(
          (new Date(`${project.due}T00:00`).getTime() -
            new Date(`${todayStr}T00:00`).getTime()) /
            86_400_000,
        )
      : null;
  const taskBucket = tasks.get(slug);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hairline bg-surface px-6 py-5">
        <div className="mb-2 flex items-center gap-2 text-[13px] text-label-secondary">
          <Link href="/projects" className="text-accent-text hover:underline">
            项目
          </Link>
          <span>/</span>
          <span>{slug}</span>
          <Badge variant="default">{project.priority}</Badge>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold text-label-primary">
              {project.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[13px] text-label-secondary">
              <StatusDot status={project.status} label={labelForStatus(project.status)} />
              <span>[{project.type}]</span>
              <span>started {project.started}</span>
              {project.due && (
                <span className={derived.dueSoon ? "text-orange-text" : ""}>
                  due {project.due}
                  {dueDays !== null &&
                    `（${dueDays > 0 ? `${dueDays} 天` : dueDays === 0 ? "今日" : `逾期 ${-dueDays} 天`}）`}
                </span>
              )}
              <span>近 14 天 {total14} 笔</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {project.agents.map((a) => (
            <AgentPill key={a} agent={a} />
          ))}
          {project.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-label-secondary"
            >
              {t}
            </span>
          ))}
        </div>

        {project.links && (
          <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
            {project.links.repo && (
              <span className="text-label-secondary">repo: {project.links.repo}</span>
            )}
            {project.links.obsidian && (
              <a
                href={project.links.obsidian}
                className="text-accent-text hover:underline"
              >
                Obsidian →
              </a>
            )}
            {project.links.folder && (
              <span className="text-label-secondary">dir: {project.links.folder}</span>
            )}
            {project.links.url && (
              <a href={project.links.url} className="text-accent-text hover:underline">
                {project.links.url.replace(/^https?:\/\//, "")} →
              </a>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-auto p-6">
        {project.status === "blocked" && (
          <div
            className="mb-4 rounded-lg border border-red/20 bg-red/10 px-4 py-3 text-[14px] text-red-text"
            role="status"
          >
            <span className="font-medium">
              {derived.blockedDays !== null ? `卡住 ${derived.blockedDays} 天` : "卡住"}
            </span>
            <span className="ml-2">
              {project.blocked_reason}
              {project.blocked_since && `（自 ${formatMmDd(project.blocked_since)}）`}
            </span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <DetailCard title="当前 NOW">
              {project.now ? (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-label-primary">
                  {project.now}
                </p>
              ) : (
                <p className="text-[13px] text-label-tertiary">
                  文件缺 ## Now 段——在项目 md 里补一段，总览的注意力区同时受益。
                </p>
              )}
            </DetailCard>

            <DetailCard title={`下一步 NEXT · ${project.next.length} 项`}>
              {project.next.length > 0 ? (
                <ul className="space-y-2">
                  {project.next.map((item, i) => (
                    <li key={i} className="flex gap-2 text-[15px] text-label-primary">
                      <span className="text-label-tertiary">{String(i + 1).padStart(2, "0")}</span>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-label-tertiary">
                  文件缺 ## Next 段。
                </p>
              )}
            </DetailCard>

            {project.notes && (
              <DetailCard title="笔记 NOTES">
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-label-primary">
                  {project.notes}
                </p>
              </DetailCard>
            )}

            {taskBucket && taskBucket.items.length > 0 && (
              <DetailCard
                title={`任务 · ${taskBucket.items.filter((t) => t.status !== "done").length} 待办`}
              >
                <div className="space-y-2">
                  {taskBucket.items.slice(0, 5).map((t) => (
                    <div key={t.line} className="flex items-center gap-2 text-[14px] text-label-primary">
                      <TaskMarker status={t.status} />
                      <span className={t.status === "done" ? "line-through text-label-tertiary" : ""}>
                        {t.text}
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href={`/board?project=${slug}`}
                  className="mt-3 inline-block text-[13px] text-accent-text hover:underline"
                >
                  在看板中管理 →
                </Link>
              </DetailCard>
            )}
          </div>

          <div>
            <DetailCard title="活动记录">
              {days.length === 0 ? (
                <EmptyState
                  title="本页尚无记录"
                  description={`任何 agent 在 data/log/ 提到 ${slug} 即入账。`}
                />
              ) : (
                <div className="-mx-4 max-h-[60vh] overflow-auto">
                  {days.map((g) => (
                    <Fragment key={g.date}>
                      <h4 className="sticky top-0 z-10 border-b border-hairline bg-surface px-4 py-2 text-[12px] font-medium text-label-tertiary">
                        {g.date} {weekdayZh(g.date)}
                      </h4>
                      {g.entries.map((e) => (
                        <EntryRow key={`${e.date}-${e.line}`} entry={e} showSlug={false} />
                      ))}
                    </Fragment>
                  ))}
                </div>
              )}
            </DetailCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function labelForStatus(status: string): string {
  switch (status) {
    case "active":
      return "活跃";
    case "blocked":
      return "卡住";
    case "paused":
      return "搁置";
    case "done":
      return "完成";
    default:
      return status;
  }
}

function TaskMarker({ status }: { status: string }) {
  const color =
    status === "done"
      ? "bg-green"
      : status === "doing"
        ? "bg-accent"
        : "bg-label-tertiary";
  return (
    <span
      className={`h-2 w-2 rounded-full ${color}`}
      aria-label={status}
    />
  );
}
