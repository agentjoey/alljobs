"use client";

import { X } from "lucide-react";
import { Sidebar, type SidebarProps } from "./Sidebar";

export type MobileNavDrawerProps = {
  open: boolean;
  onClose: () => void;
  sidebarProps: SidebarProps;
};

/**
 * 移动端导航抽屉——桌面侧栏在 md 断点下 hidden 且无其他入口，
 * 看板/统计/日志/项目列表在手机上原本完全不可达。AppShell 与
 * ProjectsShell 各自独立渲染桌面侧栏，故抽屉抽成共享组件复用。
 */
export function MobileNavDrawer({ open, onClose, sidebarProps }: MobileNavDrawerProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex md:hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-label-primary/20" aria-hidden="true" />
      <div className="relative flex h-full w-[280px] max-w-[80vw] flex-col bg-bg shadow-2xl">
        <div className="flex h-14 shrink-0 items-center justify-end border-b border-hairline px-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-label-secondary hover:bg-surface-secondary"
            aria-label="关闭导航菜单"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1" onClick={onClose}>
          <Sidebar {...sidebarProps} />
        </div>
      </div>
    </div>
  );
}
