import { cn } from "../../../lib/utils";

/**
 * 区块标题行（本身即标题，非眉标）。
 * day=true 时为日志日头（a11y 待办：dayhead 必须是标题元素）。
 */
export function SectionHead({
  title,
  count,
  aside,
  day = false,
  className,
}: {
  title: string;
  count?: string;
  aside?: string;
  day?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("section-head", day && "dayhead", className)}>
      <h2 className={day ? "d" : undefined}>{title}</h2>
      {count !== undefined && <span className="count">{count}</span>}
      {aside !== undefined && <span className="aside">{aside}</span>}
    </div>
  );
}
