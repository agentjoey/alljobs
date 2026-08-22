import Link from "next/link";
import { cn } from "@/lib/utils";

export type ListRowProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  selected?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
};

export function ListRow({
  title,
  subtitle,
  meta,
  leading,
  trailing,
  selected,
  href,
  onClick,
  className,
}: ListRowProps) {
  const baseClass = cn(
    "flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-state",
    "bg-surface text-label-primary hover:bg-surface-secondary",
    "data-[selected=true]:bg-accent/10 data-[selected=true]:text-accent-text",
    className,
  );

  const content = (
    <>
      {leading && <span className="mt-0.5 shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium">{title}</span>
          {meta && (
            <span className="shrink-0 text-[12px] text-label-tertiary">
              {meta}
            </span>
          )}
        </span>
        {subtitle && (
          <span className="block truncate text-[13px] text-label-secondary">
            {subtitle}
          </span>
        )}
      </span>
      {trailing && <span className="mt-0.5 shrink-0">{trailing}</span>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        data-selected={selected}
        className={baseClass}
        onClick={onClick}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      data-selected={selected}
      className={cn(baseClass, onClick && "cursor-pointer")}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {content}
    </div>
  );
}
