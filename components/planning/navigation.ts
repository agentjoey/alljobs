export interface NavItem {
  href: string;
  label: string;
  /** Path prefixes that also mark this item current; `href` itself always matches. */
  matches?: readonly string[];
  /** When true, only an exact `href` match marks this item current. */
  exact?: boolean;
}

export const PORTFOLIO_SECTION: readonly NavItem[] = [
  { href: "/", label: "Overview", exact: true },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/register", label: "Register" },
  { href: "/archived", label: "Archived" }
];

export const CAPHUB_SECTION: readonly NavItem[] = [
  { href: "/caphub", label: "Capture", exact: true, matches: ["/caphub/captures"] },
  { href: "/caphub/reviews", label: "Reviews" }
];

export const PRIMARY_AREAS: readonly NavItem[] = [
  { href: "/", label: "Portfolio", matches: PORTFOLIO_SECTION.filter((item) => item.href !== "/").map((item) => item.href) },
  { href: "/monitoring", label: "Monitoring" },
  { href: "/caphub", label: "Caphub", matches: ["/capabilities", "/reviews", "/captures"] }
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNavItemCurrent(item: NavItem, pathname: string): boolean {
  if (item.href === "/" ? pathname === "/" : item.exact ? pathname === item.href : matchesPrefix(pathname, item.href)) {
    return true;
  }
  return (item.matches ?? []).some((prefix) => matchesPrefix(pathname, prefix));
}

export function isPortfolioPath(pathname: string): boolean {
  return PORTFOLIO_SECTION.some((item) => isNavItemCurrent(item, pathname));
}
