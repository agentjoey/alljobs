import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { AppShell } from "@/components/planning/app-shell";
import { CaptureForm } from "@/components/caphub/capture-form";

const route = vi.hoisted(() => ({ pathname: "/caphub" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
beforeEach(() => { route.pathname = "/caphub"; });
afterEach(cleanup);

it("names the new planning product without legacy surfaces", async () => {
  render(await HomePage());
  expect(screen.getByRole("heading", { name: /workbench|planning/i })).toBeInTheDocument();
  expect(screen.queryByText(/working ledger|apple hig|quick add/i)).not.toBeInTheDocument();
});

it("identifies Registry custody and keeps reviews under Caphub rather than global navigation", () => {
  render(<AppShell><h1>Capture inbox</h1></AppShell>);
  expect(screen.getByText("NATIVE: CAPHUB REGISTRY")).toBeVisible();
  const navigation = screen.getByRole("navigation", { name: "Main Navigation" });
  const links = [...navigation.querySelectorAll("a")];
  expect(links.map((link) => link.textContent?.trim())).toEqual(["Portfolio", "Monitoring", "Caphub"]);
  expect(within(navigation).getByRole("link", { name: "Caphub" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("navigation", { name: "Portfolio" })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Search planning records" })).toBeVisible();
});

it.each([
  ["/", "Overview"],
  ["/projects", "Projects"],
  ["/projects/alljobs", "Projects"],
  ["/tasks", "Tasks"],
  ["/register", "Register"],
  ["/archived", "Archived"]
])("groups %s under the Portfolio section", (pathname, currentSection) => {
  route.pathname = pathname;
  render(<AppShell><h1>Page</h1></AppShell>);
  const main = screen.getByRole("navigation", { name: "Main Navigation" });
  expect(within(main).getByRole("link", { name: "Portfolio" })).toHaveAttribute("aria-current", "page");
  expect(within(main).getByRole("link", { name: "Monitoring" })).not.toHaveAttribute("aria-current");
  const section = screen.getByRole("navigation", { name: "Portfolio" });
  const sectionLinks = [...section.querySelectorAll("a")];
  expect(sectionLinks.map((link) => [link.textContent?.trim(), link.getAttribute("href")])).toEqual([
    ["Overview", "/"], ["Projects", "/projects"], ["Tasks", "/tasks"], ["Register", "/register"], ["Archived", "/archived"]
  ]);
  expect(sectionLinks.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.textContent?.trim()))
    .toEqual([currentSection]);
});

it.each([
  ["/monitoring", "Monitoring"],
  ["/capabilities/cap_x", "Caphub"]
])("keeps %s outside the Portfolio section", (pathname, current) => {
  route.pathname = pathname;
  render(<AppShell><h1>Page</h1></AppShell>);
  const main = screen.getByRole("navigation", { name: "Main Navigation" });
  expect(within(main).getByRole("link", { name: current })).toHaveAttribute("aria-current", "page");
  expect(within(main).getByRole("link", { name: "Portfolio" })).not.toHaveAttribute("aria-current");
  expect(screen.queryByRole("navigation", { name: "Portfolio" })).not.toBeInTheDocument();
});

it("isolates Caphub state to each mounted shell and preserves other routes' provenance", () => {
  const { rerender } = render(<>
    <AppShell><CaptureForm enabled={false} maxUploadBytes={1024} /></AppShell>
    <AppShell><CaptureForm enabled maxUploadBytes={1024} /></AppShell>
  </>);
  const strips = screen.getAllByRole("region", { name: "Planning Source Provenance" });
  expect(strips[0]).toHaveTextContent(/STATE\s+Disabled/);
  expect(strips[1]).toHaveTextContent(/STATE\s+Ready/);
  route.pathname = "/projects/alljobs";
  rerender(<AppShell statusProps={{ revision: "6656480d19", freshness: "stale" }}><h1>Project</h1></AppShell>);
  const strip = screen.getByRole("region", { name: "Planning Source Provenance" });
  expect(strip).toHaveTextContent(/STATE\s+rev 6656480/);
  expect(strip).toHaveTextContent(/SYNC\s+STALE/);
  expect(within(strip).queryByText("N/A")).not.toBeInTheDocument();
  expect(within(strip).queryByText("Disabled")).not.toBeInTheDocument();
  route.pathname = "/caphub";
  rerender(<AppShell><CaptureForm enabled maxUploadBytes={1024} /></AppShell>);
  expect(screen.getByRole("region", { name: "Planning Source Provenance" })).toHaveTextContent(/STATE\s+Ready/);
});
