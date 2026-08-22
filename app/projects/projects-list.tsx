"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { deriveProjects, type DerivedProject } from "@/lib/data/derive";
import type { LedgerData } from "@/lib/data/types";
import {
  EmptyState,
  ListRow,
  SegmentedControl,
  StatusDot,
} from "@/components/workbench";
import { sortForIndex, toggleHref } from "@/components/workbench/lib";

const STATUSES = ["active", "blocked", "paused", "done"] as const;
const PRIORITIES = ["P0", "P1", "P2"] as const;

export type ProjectsListProps = {
  data: LedgerData;
  now: Date;
};

export function ProjectsList({ data, now }: ProjectsListProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const status = sp.get("status") ?? undefined;
  const priority = sp.get("priority") ?? undefined;
  const derived = sortForIndex(deriveProjects(data.projects, data.entries, now));
  const filtered = derived.filter((p) => {
    if (status && p.status !== status) return false;
    if (priority && p.priority !== priority) return false;
    return true;
  });

  const current: Record<string, string | undefined> = { status, priority };

  const statusOptions = STATUSES.map((s) => ({
    value: s,
    label: labelForStatus(s),
    count: derived.filter((p) => p.status === s).length,
  }));
  const priorityOptions = PRIORITIES.map((p) => ({
    value: p,
    label: p,
    count: derived.filter((x) => x.priority === p).length,
  }));

  const grouped = priority
    ? [{ priority, items: filtered }]
    : PRIORITIES.map((p) => ({
        priority: p,
        items: filtered.filter((x) => x.priority === p),
      })).filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-surface px-4 py-3">
        <SegmentedControl
          className="flex-wrap"
          options={[{ value: "all", label: "全部", count: derived.length }, ...statusOptions]}
          value={status ?? "all"}
          onChange={(v) => {
            const href = toggleHref("/projects", current, "status", v === "all" ? "" : v);
            router.push(href);
          }}
        />
        <SegmentedControl
          className="flex-wrap"
          options={[{ value: "all", label: "优先级", count: undefined }, ...priorityOptions]}
          value={priority ?? "all"}
          onChange={(v) => {
            const href = toggleHref("/projects", current, "priority", v === "all" ? "" : v);
            router.push(href);
          }}
        />
      </div>

      <div className="flex-1 overflow-auto p-2">
        {filtered.length === 0 ? (
          <EmptyState
            title="没有匹配的项目"
            description="调整过滤条件，或清除过滤。"
          />
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <section key={g.priority}>
                <h3 className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-label-tertiary">
                  {g.priority}
                </h3>
                <div className="flex flex-col gap-1">
                  {g.items.map((p) => (
                    <ProjectListRow key={p.slug} project={p} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectListRow({ project }: { project: DerivedProject }) {
  return (
    <ListRow
      href={`/projects/${project.slug}`}
      title={project.title}
      subtitle={project.next[0] ?? project.now ?? "—"}
      meta={project.priority}
      leading={<StatusDot status={project.status} />}
      trailing={
        project.dueSoon && project.due ? (
          <span className="text-[11px] text-orange-text">{project.due}</span>
        ) : undefined
      }
    />
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
