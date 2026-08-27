"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

export function PrimaryNav() {
  const pathname = usePathname();

  const isCurrent = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <nav className="primary-nav" aria-label="Main Navigation">
      <Link href="/" aria-current={isCurrent("/") ? "page" : undefined}>
        Portfolio
      </Link>
      <Link href="/projects" aria-current={isCurrent("/projects") ? "page" : undefined}>
        Projects
      </Link>
      <Link href="/tasks" aria-current={isCurrent("/tasks") ? "page" : undefined}>
        Tasks
      </Link>
      <Link href="/register" aria-current={isCurrent("/register") ? "page" : undefined}>
        Register
      </Link>
      <Link href="/archived" aria-current={isCurrent("/archived") ? "page" : undefined}>
        Archived
      </Link>
    </nav>
  );
}
