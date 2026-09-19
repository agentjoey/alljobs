"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemCurrent, type NavItem } from "./navigation";

export function SectionNav({ label, items }: { label: string; items: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="section-nav" aria-label={label}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={isNavItemCurrent(item, pathname) ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
