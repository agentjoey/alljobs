"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { deriveProjects, mastheadCounts } from "@/lib/data/derive";
import type { LedgerData } from "@/lib/data/types";
import { Sidebar, type SidebarProps } from "./Sidebar";
import { SplitView } from "./SplitView";
import { Toolbar } from "./Toolbar";
import { sortForIndex } from "./lib";
import { useState } from "react";
import { QuickAddSheet } from "./QuickAddSheet";
import { MobileNavDrawer } from "./MobileNavDrawer";

export type ProjectsShellProps = {
  data: LedgerData;
  now: Date;
  list: React.ReactNode;
  children: React.ReactNode;
};

export function ProjectsShell({ data, now, list, children }: ProjectsShellProps) {
  const pathname = usePathname();
  const isIndex = pathname === "/projects";
  const derived = sortForIndex(deriveProjects(data.projects, data.entries, now));
  const counts = mastheadCounts(data.projects, data.entries, now);
  const attention = derived.filter(
    (p) => p.status === "blocked" || p.stale || p.dueSoon,
  );

  const projectsByStatus = {
    active: derived.filter((p) => p.status === "active").map((p) => ({ slug: p.slug, title: p.title })),
    paused: derived.filter((p) => p.status === "paused").map((p) => ({ slug: p.slug, title: p.title })),
    done: derived.filter((p) => p.status === "done").map((p) => ({ slug: p.slug, title: p.title })),
  };

  const activeSlug = derived.find((p) => pathname === `/projects/${p.slug}`)?.slug;
  const activeItem = activeSlug ? { type: "project" as const, slug: activeSlug } : "today";

  const writableSlugs = derived
    .filter((p) => p.status === "active" || p.status === "blocked")
    .map((p) => p.slug);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const sidebarProps: SidebarProps = {
    activeItem,
    counts: { today: counts.todayCount, attention: attention.length },
    attentionCount: attention.length,
    projectsByStatus,
  };

  return (
    <>
      {/* 详情态在移动端 list（含 Toolbar）整个 hidden，唯一入口是这个悬浮按钮——
          index 态用 list 里 Toolbar 自带的菜单按钮（见下方），两者互斥不叠 */}
      {!isIndex && (
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="fixed left-3 top-3 z-40 rounded-full border border-hairline bg-surface p-2 text-label-secondary shadow-md md:hidden"
          aria-label="打开导航菜单"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
      )}

      <SplitView
        sidebar={<Sidebar {...sidebarProps} />}
        list={
          <div className="flex h-full flex-col">
            <Toolbar
              title="项目"
              onNewEntry={() => setSheetOpen(true)}
              onMenuClick={() => setNavOpen(true)}
            />
            <div className="flex-1 overflow-auto">{list}</div>
          </div>
        }
        detail={
          // 移动端顶部让出悬浮菜单按钮的位置，否则盖住详情页自己的面包屑/标题
          !isIndex ? <div className="pt-14 md:pt-0">{children}</div> : children
        }
        listClassName={isIndex ? "flex" : "hidden lg:flex"}
        detailClassName={isIndex ? "hidden lg:flex" : "flex"}
      />
      <MobileNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        sidebarProps={sidebarProps}
      />
      <QuickAddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        slugs={writableSlugs}
      />
    </>
  );
}
