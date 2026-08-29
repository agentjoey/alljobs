"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import {
  searchPlanningAction,
  type SearchResults
} from "@/app/actions/search";
import { PrimaryNav } from "./primary-nav";
import { SourceStatus, type SourceStatusProps } from "./source-status";

export interface AppShellProps {
  children: React.ReactNode;
  statusProps?: SourceStatusProps;
}

const EMPTY_RESULTS: SearchResults = { projects: [], tasks: [], backlog: [] };

/** Custody that is statically knowable from the route alone. */
function custodyForPath(pathname: string): SourceStatusProps["custody"] {
  if (pathname === "/") return "MIXED: PORTFOLIO";
  if (pathname.startsWith("/projects")) return "MIXED: WORKBENCH";
  if (pathname.startsWith("/tasks")) return "NATIVE: CONTROL-HOST";
  if (pathname.startsWith("/register")) return "NATIVE: CONTROL-HOST";
  if (pathname.startsWith("/archived")) return "MIXED: WORKBENCH";
  return "MIXED: WORKBENCH";
}

export function AppShell({ children, statusProps }: AppShellProps) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // ⌘K / Ctrl+K focuses the universal search input.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Click-outside closes the results dropdown.
  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [searchOpen]);

  // Debounced cross-project search. State resets happen in handleQueryChange;
  // this effect only schedules the async fetch.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    const handle = setTimeout(async () => {
      try {
        const res = await searchPlanningAction(q);
        setResults(res.status === "success" ? res.data : EMPTY_RESULTS);
        setSearchOpen(true);
      } catch {
        setResults(EMPTY_RESULTS);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleQueryChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim().length < 2) {
      setResults(EMPTY_RESULTS);
      setIsSearching(false);
      setSearchOpen(false);
    } else {
      setIsSearching(true);
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setResults(EMPTY_RESULTS);
  };

  const hasResults =
    results.projects.length > 0 || results.tasks.length > 0 || results.backlog.length > 0;
  const showDropdown = searchOpen && searchQuery.trim().length >= 2;

  return (
    <div className="app-layout">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="app-header">
        <Link href="/" className="brand" aria-label="AllJobs Planning Home">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
            <path d="M3 9h6" />
          </svg>
          <span className="brand__text">
            AllJobs <span style={{ color: "var(--ink-muted)", fontWeight: 400 }}>/ Planning</span>
          </span>
        </Link>

        <PrimaryNav />

        <div className="header-search" ref={searchBoxRef}>
          <div className="universal-search">
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Universal search (projects, tasks, backlog)..."
              value={searchQuery}
              onChange={e => handleQueryChange(e.target.value)}
              onFocus={() => {
                if (searchQuery.trim().length >= 2) setSearchOpen(true);
              }}
              onKeyDown={e => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  closeSearch();
                  searchInputRef.current?.blur();
                }
              }}
              role="combobox"
              aria-expanded={showDropdown}
              aria-controls="universal-search-results"
              aria-label="Search planning records"
            />
            <kbd>⌘K</kbd>
          </div>

          {showDropdown && (
            <div
              className="search-results"
              id="universal-search-results"
              role="listbox"
              aria-label="Search results"
            >
              {isSearching && <div className="search-results__hint">Searching…</div>}
              {!isSearching && !hasResults && (
                <div className="search-results__hint">No matches for “{searchQuery.trim()}”.</div>
              )}

              {results.projects.length > 0 && (
                <div className="search-results__group">
                  <div className="search-results__heading">Projects</div>
                  {results.projects.map(p => (
                    <Link
                      key={p.slug}
                      href={p.href}
                      role="option"
                      aria-selected="false"
                      className="search-results__item"
                      onClick={closeSearch}
                    >
                      <span className="search-results__title">{p.name}</span>
                      <span className="search-results__meta">{p.slug}</span>
                    </Link>
                  ))}
                </div>
              )}

              {results.tasks.length > 0 && (
                <div className="search-results__group">
                  <div className="search-results__heading">Tasks</div>
                  {results.tasks.map(t => (
                    <Link
                      key={t.id}
                      href={t.href}
                      role="option"
                      aria-selected="false"
                      className="search-results__item"
                      onClick={closeSearch}
                    >
                      <span className="search-results__title">{t.title}</span>
                      <span className="search-results__meta">
                        {t.id} · {t.project} · {t.status.toUpperCase()}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {results.backlog.length > 0 && (
                <div className="search-results__group">
                  <div className="search-results__heading">Backlog</div>
                  {results.backlog.map(b => (
                    <Link
                      key={b.id}
                      href={b.href}
                      role="option"
                      aria-selected="false"
                      className="search-results__item"
                      onClick={closeSearch}
                    >
                      <span className="search-results__title">{b.title}</span>
                      <span className="search-results__meta">
                        {b.id} · {b.project}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <SourceStatus routePath={pathname} custody={custodyForPath(pathname)} {...statusProps} />

      <main id="main" className="main-content">
        {children}
      </main>
    </div>
  );
}
