import Link from "next/link";
import type { LogEntry } from "../../../lib/data/types";
import { AgentMark } from "./agent-mark";

/** 日志记录行：mono 时间边距 + slug 链接 + agent 章 + 正文 */
export function EntryRow({
  entry,
  showSlug = true,
  isNew = false,
}: {
  entry: LogEntry;
  /** 详情页活动流已是单项目语境，省略 slug */
  showSlug?: boolean;
  /** 落账印压（180ms ease-out；reduced-motion 全局降级）——仅快速添加成功的那一行 */
  isNew?: boolean;
}) {
  return (
    <div className={`row entry${isNew ? " is-new" : ""}`}>
      <span className="margin">{entry.time}</span>
      <span className="body">
        {showSlug && (
          <Link className="slug" href={`/projects/${entry.slug}`}>
            {entry.slug}
          </Link>
        )}
        <AgentMark name={entry.agent} />
        <span className="text">{entry.text}</span>
      </span>
    </div>
  );
}
