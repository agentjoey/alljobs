import Link from "next/link";
import type { LogEntry } from "../../../lib/data/types";
import { AgentMark } from "./agent-mark";

/** 日志记录行：mono 时间边距 + slug 链接 + agent 章 + 正文 */
export function EntryRow({
  entry,
  showSlug = true,
}: {
  entry: LogEntry;
  /** 详情页活动流已是单项目语境，省略 slug */
  showSlug?: boolean;
}) {
  return (
    <div className="row entry">
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
