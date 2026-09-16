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

it("identifies local capture custody and keeps Caphub and Reviews before Register", () => {
  render(<AppShell><h1>Capture inbox</h1></AppShell>);
  expect(screen.getByText("NATIVE: LOCAL CAPTURE")).toBeVisible();
  const navigation = screen.getByRole("navigation", { name: "Main Navigation" });
  const links = [...navigation.querySelectorAll("a")];
  expect(links.map((link) => link.textContent?.trim())).toEqual([
    "Portfolio", "Projects", "Tasks", "Monitoring", "Caphub", "Reviews", "Register", "Archived"
  ]);
  expect(screen.getByRole("link", { name: "Caphub" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("combobox", { name: "Search planning records" })).toBeVisible();
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
