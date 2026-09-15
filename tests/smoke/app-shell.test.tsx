import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import HomePage from "@/app/page";
import { AppShell } from "@/components/planning/app-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/caphub" }));

it("names the new planning product without legacy surfaces", async () => {
  render(await HomePage());
  expect(screen.getByRole("heading", { name: /workbench|planning/i })).toBeInTheDocument();
  expect(screen.queryByText(/working ledger|apple hig|quick add/i)).not.toBeInTheDocument();
});

it("identifies local capture custody and keeps Caphub between Monitoring and Register", () => {
  render(<AppShell><h1>Capture inbox</h1></AppShell>);
  expect(screen.getByText("NATIVE: LOCAL CAPTURE")).toBeVisible();
  const navigation = screen.getByRole("navigation", { name: "Main Navigation" });
  const links = [...navigation.querySelectorAll("a")];
  expect(links.map((link) => link.textContent?.trim())).toEqual([
    "Portfolio", "Projects", "Tasks", "Monitoring", "Caphub", "Register", "Archived"
  ]);
  expect(screen.getByRole("link", { name: "Caphub" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("combobox", { name: "Search planning records" })).toBeVisible();
});
