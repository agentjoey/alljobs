import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  readR1Activity,
  readR1Backlog,
  readR1GitHead,
  readR1GitStatus,
  resetR1Backlog
} from "./r1-fixtures";

async function openBacklog(page: Page, slug = "sample-code") {
  await page.goto(`/projects/${slug}`);
  await page.getByRole("tab", { name: /^Backlog \(/ }).click();
  await expect(page.getByRole("heading", { name: "Backlog ledger" })).toBeVisible();
}

async function enterOrdering(page: Page) {
  await page.getByRole("button", { name: "Manage ordering" }).click();
  await expect(page.getByRole("heading", { name: "Manage ordering" })).toBeVisible();
}

async function tabUntilFocused(page: Page, target: ReturnType<Page["getByRole"]>, label: string) {
  for (let step = 0; step < 48; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) {
      await expect(target, `${label} receives keyboard focus`).toBeFocused();
      return;
    }
  }
  const diagnostics = await page.evaluate(() => ({
    active: document.activeElement?.outerHTML,
    focusable: [...document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
      .map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim())
  }));
  throw new Error(`${label} was not reachable with Tab: ${JSON.stringify(diagnostics)}`);
}

async function expectNoWcagAaViolations(page: Page, state: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations, `${state} accessibility violations`).toEqual([]);
}

async function expectNoHorizontalPageScroll(page: Page, state: string) {
  const report = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    culprits: [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element: `${element.tagName.toLowerCase()}.${element.className}`,
          label: element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        };
      })
      .filter(({ left, right }) => left < -1 || right > document.documentElement.clientWidth + 1)
      .slice(0, 8)
  }));
  expect(report.scrollWidth, `${state} overflow: ${JSON.stringify(report.culprits)}`).toBeLessThanOrEqual(report.clientWidth);
}

test.describe("R1 Backlog Control browser-to-filesystem boundaries", () => {
  test.beforeEach(() => {
    resetR1Backlog("unranked");
  });

  test("reads the dirty local working tree instead of committed content", async ({ page }) => {
    await openBacklog(page);

    await expect(page.getByText("LOCAL WORKING TREE · MODIFIED", { exact: true })).toBeVisible();
    await expect(page.getByText("Visible uncommitted local value", { exact: true })).toBeVisible();
    await expect(page.getByText("Committed backlog title", { exact: true })).toHaveCount(0);
  });

  test("prepares and copies an initialize handoff without writing Backlog or activity", async ({ page, context }) => {
    const before = readR1Backlog();
    const headBefore = readR1GitHead();
    const statusBefore = readR1GitStatus();
    const activityBefore = readR1Activity();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3465" });
    await page.setViewportSize({ width: 1440, height: 1000 });

    await openBacklog(page);
    await enterOrdering(page);
    await page.getByRole("button", { name: "Initialize ordering" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();

    await expect(page.getByRole("listitem").filter({ hasText: "AJ-B-001" })).toContainText("rank absent → 100");
    await expect(page.getByRole("listitem").filter({ hasText: "AJ-B-002" })).toContainText("rank absent → 200");
    await expect(page.getByRole("listitem").filter({ hasText: "AJ-B-003" })).toContainText("rank absent → 100");
    await expect(page.getByRole("button", { name: "Confirm and apply" })).toHaveCount(0);

    const handoff = page.getByRole("textbox", { name: "Backlog application handoff" });
    await expect(handoff).toHaveValue(/Project: sample-code/);
    await expect(handoff).toHaveValue(new RegExp(`HEAD: ${headBefore}`));
    await expect(handoff).toHaveValue(/Full Backlog file digest \(SHA-256\): [a-f0-9]{64}/);
    await expect(handoff).toHaveValue(/Proposal digest \(SHA-256\): [a-f0-9]{64}/);
    await expect(handoff).toHaveValue(/Field-only diff:[\s\S]*AJ-B-002:[\s\S]*rank absent -> 200/);
    await expect(handoff).toHaveValue(/AllJobs did not write to docs\/BACKLOG\.md/);
    await page.getByRole("button", { name: "Copy application handoff" }).click();
    await expect(page.getByRole("status")).toHaveText("Application handoff copied to clipboard.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Application owner: repository agent or Human Owner");
    const desktopEvidence = resolve(tmpdir(), "alljobs-r1b-copy-only-1440.png");
    await page.screenshot({ path: desktopEvidence, fullPage: true });
    expect(existsSync(desktopEvidence)).toBe(true);

    expect(readR1Backlog()).toBe(before);
    expect(readR1Activity()).toBe(activityBefore);
    expect(readR1GitHead()).toBe(headBefore);
    expect(readR1GitStatus()).toBe(statusBefore);
  });

  test("keeps the exact move diff copy-only", async ({ page }) => {
    resetR1Backlog("ranked");
    const before = readR1Backlog();
    const activityBefore = readR1Activity();
    await openBacklog(page);
    await enterOrdering(page);

    await page.getByRole("button", { name: "Move AJ-B-002 up" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "AJ-B-002" })).toContainText("rank 200 → 50");
    await expect(page.getByRole("textbox", { name: "Backlog application handoff" })).toHaveValue(/AJ-B-002: priority P0 -> P0; rank 200 -> 50/);
    expect(readR1Backlog()).toBe(before);
    expect(readR1Activity()).toBe(activityBefore);
  });

  test("prepares a later-lane repair without writing it", async ({ page }) => {
    resetR1Backlog("conflict");
    const before = readR1Backlog();
    const activityBefore = readR1Activity();
    await openBacklog(page);
    await enterOrdering(page);

    await page.getByRole("button", { name: "Repair phase-2 / P1 ordering" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "AJ-B-002" })).toContainText("rank 100 → 100");
    await expect(page.getByRole("listitem").filter({ hasText: "AJ-B-003" })).toContainText("rank 100 → 200");
    await expect(page.getByRole("button", { name: "Copy application handoff" })).toBeVisible();
    expect(readR1Backlog()).toBe(before);
    expect(readR1Activity()).toBe(activityBefore);
  });

  test("keeps remote commits and cache snapshots read-only", async ({ page }) => {
    for (const [slug, label] of [
      ["sample-remote", "REMOTE COMMIT · READ ONLY"],
      ["sample-cache", "CACHE SNAPSHOT · READ ONLY"]
    ] as const) {
      await openBacklog(page, slug);
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Manage ordering" })).toBeDisabled();
      await expect(page.getByText("SOURCE_NOT_WRITABLE", { exact: true })).toBeVisible();
    }
  });

  test("supports keyboard-only proposal copying without a write", async ({ page, context }) => {
    resetR1Backlog("ranked");
    const before = readR1Backlog();
    const activityBefore = readR1Activity();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3465" });
    await page.goto("/projects/sample-code");
    const backlogTab = page.getByRole("tab", { name: /^Backlog \(/ });
    await tabUntilFocused(page, backlogTab, "Backlog tab");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Backlog ledger" })).toBeVisible();
    await expect(page.getByText("Rank 200", { exact: true })).toBeVisible();
    const manage = page.getByRole("button", { name: "Manage ordering" });
    await tabUntilFocused(page, manage, "Manage ordering");
    await page.keyboard.press("Enter");
    const move = page.getByRole("button", { name: "Move AJ-B-002 up" });
    await tabUntilFocused(page, move, "Move Up");
    await page.keyboard.press("Enter");
    const review = page.getByRole("button", { name: "Review changes" });
    await tabUntilFocused(page, review, "Review changes");
    await page.keyboard.press("Enter");
    await tabUntilFocused(page, page.getByRole("button", { name: "Back to draft" }), "Back to draft");
    await page.keyboard.press("Tab");
    const copy = page.getByRole("button", { name: "Copy application handoff" });
    await expect(copy, "Copy application handoff receives keyboard focus").toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("status")).toHaveText("Application handoff copied to clipboard.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("AJ-B-002: priority P0 -> P0; rank 200 -> 50");
    expect(readR1Backlog()).toBe(before);
    expect(readR1Activity()).toBe(activityBefore);
  });

  test("keeps the copy path usable without horizontal page scroll at 390px", async ({ page }) => {
    resetR1Backlog("ranked");
    await page.setViewportSize({ width: 390, height: 844 });
    await openBacklog(page);
    await expectNoHorizontalPageScroll(page, "reading");

    await enterOrdering(page);
    await expect(page.getByRole("button", { name: "Move AJ-B-002 up" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Change priority for AJ-B-002" })).toBeVisible();
    await expectNoHorizontalPageScroll(page, "editing");
    await page.getByRole("button", { name: "Move AJ-B-002 up" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();
    await expect(page.getByRole("textbox", { name: "Backlog application handoff" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy application handoff" })).toBeVisible();
    await expectNoHorizontalPageScroll(page, "copy-only review");
    const mobileEvidence = resolve(tmpdir(), "alljobs-r1b-copy-only-390.png");
    await page.screenshot({ path: mobileEvidence, fullPage: true });
    expect(existsSync(mobileEvidence)).toBe(true);
  });

  test("has no WCAG AA violations in reading, editing, review, copied, and invalid states", async ({ page }) => {
    resetR1Backlog("ranked");
    await openBacklog(page);
    await expectNoWcagAaViolations(page, "reading");

    await enterOrdering(page);
    await expectNoWcagAaViolations(page, "editing");

    await page.getByRole("button", { name: "Move AJ-B-002 up" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();
    await expect(page.getByRole("heading", { name: "Review the exact field changes" })).toBeVisible();
    await expectNoWcagAaViolations(page, "review");

    await page.getByRole("button", { name: "Copy application handoff" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await expectNoWcagAaViolations(page, "copied");

    resetR1Backlog("invalid");
    await page.reload();
    await page.getByRole("tab", { name: /^Backlog \(/ }).click();
    await expect(page.getByText("LOCAL SOURCE INVALID · READ ONLY", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage ordering" })).toBeDisabled();
    await expectNoWcagAaViolations(page, "invalid");
  });

  test("captures final R1 evidence", async ({ page }) => {
    test.skip(process.env.R1_CAPTURE_EVIDENCE !== "1", "Set R1_CAPTURE_EVIDENCE=1 to write final screenshots.");
    resetR1Backlog("ranked");
    const evidenceDir = resolve(process.cwd(), ".agent/frontend-design/r1-backlog-control/final-screens");
    mkdirSync(evidenceDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });

    await openBacklog(page);
    await page.screenshot({ path: resolve(evidenceDir, "r1-backlog-reading-1440.png"), fullPage: true });

    await enterOrdering(page);
    await page.getByRole("button", { name: "Move AJ-B-002 up" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();
    await expect(page.getByRole("heading", { name: "Review the exact field changes" })).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDir, "r1-backlog-review-1440.png"), fullPage: true });
  });
});
