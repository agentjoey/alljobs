"use client";

import Link from "next/link";
import React, { useState } from "react";
import { PrimaryNav } from "./primary-nav";
import { SourceStatus, type SourceStatusProps } from "./source-status";

export interface AppShellProps {
  children: React.ReactNode;
  statusProps?: SourceStatusProps;
}

export function AppShell({ children, statusProps }: AppShellProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="app-layout">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="app-header">
        <Link href="/" className="brand" aria-label="AllJobs Planning Home">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
            <path d="M3 9h6" />
          </svg>
          <span>AllJobs <span style={{ opacity: 0.5, fontWeight: 400 }}>/ Planning</span></span>
        </Link>

        <PrimaryNav />

        <div className="header-search">
          <div className="universal-search">
            <input
              type="search"
              placeholder="Universal search (projects, tasks, backlog)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search planning records"
            />
            <kbd>⌘K</kbd>
          </div>
        </div>

        <div className="header-status">
          <span className="status-dot status-dot--healthy" role="status" aria-label="Control Host Online" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>127.0.0.1:3456</span>
        </div>
      </header>

      <SourceStatus {...statusProps} />

      <main id="main" className="main-content">
        {children}
      </main>
    </div>
  );
}
