import Link from "next/link";
import { formatRelative, type DerivedProject } from "../../../lib/data/derive";
import type { LogEntry } from "../../../lib/data/types";
import { cn } from "../../../lib/utils";
import { countInWindow, formatMmDd, rowStamp, tallyDates } from "../lib";
import { AgentMark } from "./agent-mark";
import { Stamp } from "./stamp";
import { Tally } from "./tally";

/** 项目底账行：整行可点（cover 链接），红栏线侧状态戳，右侧 tally + last */
export function ProjectRow({
  project,
  entries,
  today,
  showPriority = false,
}: {
  project: DerivedProject;
  entries: LogEntry[];
  today: Date;
  /** 列表页显示优先级（总览按 P 分组，不重复） */
  showPriority?: boolean;
}) {
  const stamp = rowStamp(project);
  const quiet = project.status === "paused" || project.status === "done";
  const nextText = project.next[0] ?? project.now;
  const total = countInWindow(entries, project.slug, today);

  return (
    <div className={cn("row proj", quiet && "is-quiet")}>
      <span className="margin">
        <Stamp kind={stamp.cls}>{stamp.text}</Stamp>
      </span>
      <span className="body">
        <span className="l1">
          <Link
            className="name cover"
            href={`/projects/${project.slug}`}
            aria-label={`${project.title} 详情`}
          />
          <span className="name">{project.title}</span>
          <span className="slug">{project.slug}</span>
          <span className="type">
            [{project.type}]{showPriority && ` · ${project.priority}`}
          </span>
        </span>
        {project.status === "blocked" ? (
          <span className="next is-blocked">
            <b>卡在</b> {project.blocked_reason}
            {project.blockedDays !== null && `（第 ${project.blockedDays} 天）`}
          </span>
        ) : (
          <span className="next">
            {!quiet && nextText && <b>NEXT</b>} {nextText ?? "—"}
          </span>
        )}
        <span className="meta">
          {project.due && (
            <span className={project.dueSoon ? "due-soon" : undefined}>
              due {formatMmDd(project.due)}
            </span>
          )}
          {project.agents.map((a) => (
            <AgentMark key={a} name={a} />
          ))}
        </span>
        <span className="side">
          <Tally counts={project.activity14} dates={tallyDates(today)} total={total} />
          <span className="last">
            {project.lastEntry
              ? formatRelative(project.lastEntry.date, project.lastEntry.time, today)
              : "—"}
          </span>
        </span>
      </span>
    </div>
  );
}
