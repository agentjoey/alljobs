import { Menu, Plus } from "lucide-react";

export type ToolbarProps = {
  title: React.ReactNode;
  children?: React.ReactNode;
  onNewEntry?: () => void;
  onMenuClick?: () => void;
};

export function Toolbar({ title, children, onNewEntry, onMenuClick }: ToolbarProps) {
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="-ml-1.5 rounded-md p-1.5 text-label-secondary hover:bg-surface-secondary md:hidden"
            aria-label="打开导航菜单"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        )}
        <h1 className="truncate text-[17px] font-semibold text-label-primary">
          {title}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {children}
        <button
          type="button"
          onClick={onNewEntry}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-text px-3 text-[13px] font-medium text-label-inverse transition-state hover:bg-accent-hover focus-visible:outline-offset-0"
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          新建日志
        </button>
      </div>
    </header>
  );
}
