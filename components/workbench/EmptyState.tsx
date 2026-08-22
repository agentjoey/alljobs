import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-center",
        className,
      )}
    >
      <Icon
        size={40}
        strokeWidth={1.5}
        className="text-label-tertiary"
        aria-hidden="true"
      />
      <h3 className="text-[15px] font-semibold text-label-primary">{title}</h3>
      {description && (
        <p className="max-w-xs text-[13px] text-label-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
