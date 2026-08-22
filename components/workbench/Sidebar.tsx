import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  Calendar,
  Kanban,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./Badge";
import { StatusDot } from "./StatusDot";

type SmartItem = "today" | "attention" | "board" | "stats" | "log";

type ProjectItem = {
  slug: string;
  title: string;
};

export type ProjectsByStatus = {
  active: ProjectItem[];
  paused: ProjectItem[];
  done: ProjectItem[];
};

export type SidebarProps = {
  counts: {
    today: number;
    attention: number;
    log?: number;
  };
  projectsByStatus: ProjectsByStatus;
  activeItem: SmartItem | { type: "project"; slug: string };
  attentionCount: number;
};

const SMART: {
  id: SmartItem;
  label: string;
  href: string;
  icon: React.ElementType;
}[] = [
  { id: "today", label: "今天", href: "/", icon: Calendar },
  { id: "attention", label: "注意力", href: "/", icon: AlertCircle },
  { id: "board", label: "看板", href: "/board", icon: Kanban },
  { id: "stats", label: "统计", href: "/stats", icon: BarChart3 },
  { id: "log", label: "日志", href: "/log", icon: ScrollText },
];

const GROUPS: { key: keyof ProjectsByStatus; label: string }[] = [
  { key: "active", label: "活跃" },
  { key: "paused", label: "搁置" },
  { key: "done", label: "完成" },
];

export function Sidebar({
  counts,
  projectsByStatus,
  activeItem,
  attentionCount,
}: SidebarProps) {
  const smartActive = (id: SmartItem) => activeItem === id;
  const projectActive = (slug: string) =>
    typeof activeItem === "object" &&
    activeItem.type === "project" &&
    activeItem.slug === slug;

  return (
    <nav
      className="flex h-full w-full flex-col overflow-hidden border-r border-hairline bg-bg text-[13px]/[1.3]"
      aria-label="源列表"
    >
      {/* Wordmark */}
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link
          href="/"
          className="font-mono text-[15px] font-semibold tracking-widest text-label-primary hover:no-underline"
        >
          ALLJOBS
        </Link>
      </div>

      {/* 智能列表 */}
      <div className="px-3 pb-3">
        <ul className="flex flex-col gap-0.5">
          {SMART.map(({ id, label, href, icon: Icon }) => {
            const active = smartActive(id);
            return (
              <li key={id}>
                <Link
                  href={href}
                  data-active={active}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-label-secondary transition-state hover:bg-surface-secondary",
                    "data-[active=true]:bg-accent/10 data-[active=true]:font-medium data-[active=true]:text-accent-text",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                    <span>{label}</span>
                  </span>
                  {id === "attention" && attentionCount > 0 && (
                    <Badge variant="accent">{attentionCount}</Badge>
                  )}
                  {id === "today" && counts.today > 0 && (
                    <Badge variant="default">{counts.today}</Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 项目分组 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <h2 className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-label-tertiary">
          项目
        </h2>
        <div className="flex flex-col gap-3">
          {GROUPS.map(({ key, label }) => {
            const items = projectsByStatus[key];
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <h3 className="px-3 py-1 text-[11px] font-medium text-label-tertiary">
                  {label}
                </h3>
                <ul className="flex flex-col gap-0.5">
                  {items.map((p) => {
                    const active = projectActive(p.slug);
                    return (
                      <li key={p.slug}>
                        <Link
                          href={`/projects/${p.slug}`}
                          data-active={active}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-label-secondary transition-state hover:bg-surface-secondary",
                            "data-[active=true]:bg-accent/10 data-[active=true]:font-medium data-[active=true]:text-accent-text",
                          )}
                        >
                          <StatusDot status={key === "done" ? "done" : key} />
                          <span className="truncate">{p.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
