"use client";

import { useState } from "react";
import { Sidebar, type SidebarProps } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { QuickAddSheet } from "./QuickAddSheet";
import { MobileNavDrawer } from "./MobileNavDrawer";

export type AppShellProps = SidebarProps & {
  title: React.ReactNode;
  toolbarChildren?: React.ReactNode;
  newEntrySlugs: string[];
  children: React.ReactNode;
};

export function AppShell({
  title,
  toolbarChildren,
  newEntrySlugs,
  children,
  ...sidebarProps
}: AppShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="hidden w-full md:block md:w-[240px] md:shrink-0">
        <div className="fixed inset-y-0 left-0 w-[240px]">
          <Sidebar {...sidebarProps} />
        </div>
      </div>

      <MobileNavDrawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        sidebarProps={sidebarProps}
      />

      <div className="flex flex-1 flex-col md:pl-[240px]">
        <Toolbar
          title={title}
          onNewEntry={() => setSheetOpen(true)}
          onMenuClick={() => setNavOpen(true)}
        >
          {toolbarChildren}
        </Toolbar>
        {children}
      </div>

      <QuickAddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        slugs={newEntrySlugs}
      />
    </div>
  );
}
