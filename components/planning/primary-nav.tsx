"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { isNavItemCurrent, PRIMARY_AREAS } from "./navigation";

export function PrimaryNav() {
  const pathname = usePathname();

  return (
    <nav className="primary-nav" aria-label="Main Navigation">
      {PRIMARY_AREAS.map((area) => (
        <Link key={area.href} href={area.href} aria-current={isNavItemCurrent(area, pathname) ? "page" : undefined}>
          {area.label}
        </Link>
      ))}
    </nav>
  );
}
