import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

/** 账页 sheet：红纵栏线 + 行格线（样式在 globals.css，红栏线由 ::before 绘制） */
export function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("sheet", className)}>{children}</div>;
}

/** 账页行：mono 边距列 + 正文列 */
export function Row({
  margin,
  children,
  className,
  marginAriaHidden = false,
}: {
  margin: ReactNode;
  children: ReactNode;
  className?: string;
  marginAriaHidden?: boolean;
}) {
  return (
    <div className={cn("row", className)}>
      <span className="margin" aria-hidden={marginAriaHidden || undefined}>
        {margin}
      </span>
      <span className="body">{children}</span>
    </div>
  );
}
