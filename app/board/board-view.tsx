"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { mastheadCounts } from "@/lib/data/derive";
import type { LedgerData, TaskBucket, TaskItem, TaskStatus } from "@/lib/data/types";
import {
  AppShell,
  DetailCard,
  EmptyState,
  SegmentedControl,
} from "@/components/workbench";
import { moveTask } from "@/app/actions/movetask";

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "待办" },
  { key: "doing", label: "进行中" },
  { key: "done", label: "已完成" },
];

export type BoardViewProps = {
  data: LedgerData;
  tasks: Map<string, TaskBucket>;
  now: Date;
};

export function BoardView({ data, tasks, now }: BoardViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const counts = mastheadCounts(data.projects, data.entries, now);
  const attention = data.projects.filter(
    (p) => p.status === "blocked",
  ).length;
  const projectsByStatus = {
    active: data.projects.filter((p) => p.status === "active").map((p) => ({ slug: p.slug, title: p.title })),
    paused: data.projects.filter((p) => p.status === "paused").map((p) => ({ slug: p.slug, title: p.title })),
    done: data.projects.filter((p) => p.status === "done").map((p) => ({ slug: p.slug, title: p.title })),
  };
  const writableSlugs = data.projects
    .filter((p) => p.status === "active" || p.status === "blocked")
    .map((p) => p.slug);

  const projectSlugs = data.projects.map((p) => p.slug);
  const projectParam = sp.get("project") ?? projectSlugs[0] ?? "";
  const selectedSlug = projectSlugs.includes(projectParam) ? projectParam : projectSlugs[0] ?? "";
  const bucket = selectedSlug ? tasks.get(selectedSlug) : undefined;

  const projectOptions = data.projects.map((p) => ({
    value: p.slug,
    label: p.title,
    count: (tasks.get(p.slug)?.items.length ?? 0),
  }));

  function handleDrop(slug: string, line: number, newStatus: TaskStatus) {
    const form = new FormData();
    form.set("slug", slug);
    form.set("line", String(line));
    form.set("newStatus", newStatus);
    startTransition(async () => {
      await moveTask({ status: "idle" }, form);
    });
  }

  return (
    <AppShell
      title="看板"
      activeItem="board"
      counts={{ today: counts.todayCount, attention }}
      attentionCount={attention}
      projectsByStatus={projectsByStatus}
      newEntrySlugs={writableSlugs}
      toolbarChildren={
        projectOptions.length > 0 ? (
          <SegmentedControl
            className="flex-wrap"
            options={projectOptions}
            value={selectedSlug}
            onChange={(v) => router.push(`/board?project=${v}`)}
          />
        ) : null
      }
    >
      <div className="space-y-4 p-6">
        {projectOptions.length === 0 ? (
          <EmptyState title="没有项目" description="先创建项目，再为其添加任务。" />
        ) : !bucket || bucket.items.length === 0 ? (
          <EmptyState
            title="暂无任务"
            description={`在 data/tasks/${selectedSlug}.md 中写入任务列表即可出现在看板。`}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {STATUSES.map(({ key, label }) => (
              <Column
                key={key}
                slug={selectedSlug}
                status={key}
                label={label}
                tasks={bucket.items.filter((t) => t.status === key)}
                onDrop={handleDrop}
                disabled={isPending}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Column({
  slug,
  status,
  label,
  tasks,
  onDrop,
  disabled,
}: {
  slug: string;
  status: TaskStatus;
  label: string;
  tasks: TaskItem[];
  onDrop: (slug: string, line: number, status: TaskStatus) => void;
  disabled: boolean;
}) {
  return (
    <DetailCard title={`${label} · ${tasks.length}`}>
      <div
        className="min-h-[120px] space-y-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const line = Number(e.dataTransfer.getData("text/plain"));
          if (line) onDrop(slug, line, status);
        }}
      >
        {tasks.map((t) => (
          <TaskCard
            key={t.line}
            slug={slug}
            task={t}
            onMove={onDrop}
            disabled={disabled}
          />
        ))}
      </div>
    </DetailCard>
  );
}

function TaskCard({
  slug,
  task,
  onMove,
  disabled,
}: {
  slug: string;
  task: TaskItem;
  onMove: (slug: string, line: number, status: TaskStatus) => void;
  disabled: boolean;
}) {
  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(task.line));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`flex items-start justify-between gap-2 rounded-lg border border-hairline bg-surface p-3 text-[14px] text-label-primary shadow-sm transition-state ${
        disabled ? "opacity-50" : "cursor-grab hover:shadow-md active:cursor-grabbing"
      }`}
    >
      <p className={`min-w-0 flex-1 ${task.status === "done" ? "line-through text-label-tertiary" : ""}`}>
        {task.text}
      </p>
      {/* 拖拽的键盘可达替代——纯 HTML5 DnD 键盘用户/读屏用户无法操作 */}
      <label className="sr-only" htmlFor={`move-${slug}-${task.line}`}>
        移动「{task.text}」到
      </label>
      <select
        id={`move-${slug}-${task.line}`}
        className="shrink-0 rounded-md border border-hairline bg-bg text-[12px] text-label-secondary focus:border-accent focus:outline-none"
        value={task.status}
        disabled={disabled}
        onChange={(e) => onMove(slug, task.line, e.target.value as TaskStatus)}
      >
        <option value="todo">待办</option>
        <option value="doing">进行中</option>
        <option value="done">已完成</option>
      </select>
    </div>
  );
}
