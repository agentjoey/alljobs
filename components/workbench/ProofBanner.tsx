import { AlertTriangle } from "lucide-react";
import type { ProofIssue } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export type ProofBannerProps = {
  issues: ProofIssue[];
  className?: string;
};

export function ProofBanner({ issues, className }: ProofBannerProps) {
  if (issues.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-orange/30 bg-orange/10 px-4 py-3 text-[13px] text-orange-text",
        className,
      )}
      role="alert"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">发现 {issues.length} 处数据问题</p>
        <ul className="mt-1 space-y-0.5">
          {issues.map((issue, i) => (
            <li key={i} className="truncate">
              <code className="rounded bg-surface px-1 py-0.5 text-[12px]">
                {issue.file.split("/").pop()}
              </code>
              {issue.line && <span className="ml-1">第 {issue.line} 行</span>}
              {issue.field && (
                <span className="ml-1">字段 `{issue.field}`</span>
              )}
              <span className="ml-1 text-label-secondary">{issue.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
