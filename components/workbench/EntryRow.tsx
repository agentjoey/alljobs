import Link from "next/link";
import type { LogEntry } from "@/lib/data/types";
import { formatRelative } from "@/lib/data/derive";
import { AgentPill } from "./AgentPill";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

export type EntryRowProps = {
  entry: LogEntry;
  showSlug?: boolean;
  isNew?: boolean;
};

export function EntryRow({ entry, showSlug = true, isNew }: EntryRowProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-b-0",
        isNew && "animate-settle",
      )}
    >
      <time className="w-12 shrink-0 text-[13px] tabular-nums text-label-tertiary">
        {entry.time}
      </time>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-relaxed text-label-primary">
          {showSlug && (
            <Link
              href={`/projects/${entry.slug}`}
              className="mr-1.5 font-medium text-accent-text hover:underline"
            >
              {entry.slug}
            </Link>
          )}
          {entry.kind === "session" && (
            <span className="mr-1.5 inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent-text">
              <MessageSquare size={10} aria-hidden="true" />
              会话
            </span>
          )}
          {entry.text}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <AgentPill agent={entry.agent} />
          <span className="text-[12px] text-label-tertiary">
            {formatRelative(entry.date, entry.time)}
          </span>
        </div>
      </div>
    </div>
  );
}
