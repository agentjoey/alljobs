import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  makeUnrelatedR1Edit,
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

async function reviewAndApply(page: Page) {
  await page.getByRole("button", { name: "Review changes" }).click();
  await expect(page.getByRole("heading", { name: "Review the exact field changes" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm and apply" }).click();
  await expect(page.getByText("Ordering changes applied locally.", { exact: false })).toBeVisible();
}

function itemSection(source: string, itemId: string) {
  const start = source.indexOf(`## ${itemId}:`);
  if (start < 0) throw new Error(`Missing fixture section ${itemId}`);
  const next = source.indexOf("\n## ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

function scalar(source: string, itemId: string, field: "priority" | "rank") {
  return new RegExp(`^${field}:\\s*(\\S+)`, "m").exec(itemSection(source, itemId))?.[1];
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

  test("initializes ranks through review and changes only rank lines on disk", async ({ page }) => {
    const before = readR1Backlog();
    const headBefore = readR1GitHead();

    await openBacklog(page);
    await enterOrdering(page);
    await page.getByRole("button", { name: "Initialize ordering" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();

    await expect(page.getByRole("listitem").filter({ hasText: "AJ-B-001" })).toContainText("rank absent → 100");
    await expect(page.getByRole("listitem").filter({ hasText: "AJ-B-002" })).toContainText("rank absent → 200");
    await expect(page.getByRole("listitem").filter({ hasText: "AJ-B-003" })).toContainText("rank absent → 100");
    expect(readR1Backlog()).toBe(before);

    await page.getByRole("button", { name: "Confirm and apply" }).click();
    await expect(page.getByText("Ordering changes applied locally.", { exact: false })).toBeVisible();

    const after = readR1Backlog();
    expect(after.replace(/^rank: \d+\r?\n/gm, "")).toBe(before);
    expect(scalar(after, "AJ-B-001", "rank")).toBe("100");
    expect(scalar(after, "AJ-B-002", "rank")).toBe("200");
    expect(scalar(after, "AJ-B-003", "rank")).toBe("100");
    expect(scalar(after, "AJ-B-004", "rank")).toBeUndefined();
    expect(readR1GitHead()).toBe(headBefore);
    expect(readR1GitStatus()).toBe("M docs/BACKLOG.md");
  });

  test("writes expected scalar values for Move Up and Change Priority", async ({ page }) => {
    resetR1Backlog("ranked");
    await openBacklog(page);
    await enterOrdering(page);

    await page.getByRole("button", { name: "Move AJ-B-002 up" }).click();
    await reviewAndApply(page);
    const afterMove = readR1Backlog();
    expect(scalar(afterMove, "AJ-B-002", "rank")).toBe("50");
    expect(scalar(afterMove, "AJ-B-002", "priority")).toBe("P0");

    await page.getByRole("button", { name: "Continue reading" }).click();
    await expect(page.getByText("Rank 50", { exact: true })).toBeVisible();
    await enterOrdering(page);
    await page.getByRole("combobox", { name: "Change priority for AJ-B-001" }).selectOption("P2");
    await reviewAndApply(page);
    await page.getByRole("button", { name: "Continue reading" }).click();
    await expect(page.locator('[data-item-id="AJ-B-001"] .badge--p2')).toBeVisible();

    const afterPriority = readR1Backlog();
    expect(scalar(afterPriority, "AJ-B-001", "priority")).toBe("P2");
    expect(scalar(afterPriority, "AJ-B-001", "rank")).toBe("100");
    expect(scalar(afterPriority, "AJ-B-002", "rank")).toBe("50");
    expect(afterPriority.replace("priority: P2\nrank: 100", "priority: P0\nrank: 100")).toBe(afterMove);
  });

  test("rejects a stale reviewed proposal and preserves an unrelated external edit", async ({ page }) => {
    resetR1Backlog("ranked");
    await openBacklog(page);
    await enterOrdering(page);
    await page.getByRole("button", { name: "Move AJ-B-002 up" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();
    await expect(page.getByRole("heading", { name: "Review the exact field changes" })).toBeVisible();

    const externallyEdited = makeUnrelatedR1Edit();
    await page.getByRole("button", { name: "Confirm and apply" }).click();

    await expect(page.locator(".backlog-error-state")).toContainText("STALE_WRITE");
    await expect(page.getByText("Prior intent (reference only)")).toBeVisible();
    expect(readR1Backlog()).toBe(externallyEdited);
    expect(scalar(readR1Backlog(), "AJ-B-002", "rank")).toBe("200");
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

  test("supports keyboard-only ordering", async ({ page }) => {
    resetR1Backlog("ranked");
    await openBacklog(page);

    const manage = page.getByRole("button", { name: "Manage ordering" });
    await manage.focus();
    await page.keyboard.press("Enter");
    const move = page.getByRole("button", { name: "Move AJ-B-002 up" });
    await move.focus();
    await page.keyboard.press("Enter");
    const review = page.getByRole("button", { name: "Review changes" });
    await review.focus();
    await page.keyboard.press("Enter");
    const apply = page.getByRole("button", { name: "Confirm and apply" });
    await apply.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByText("Ordering changes applied locally.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Continue reading" }).click();
    await expect(page.getByText("Rank 50", { exact: true })).toBeVisible();
    expect(scalar(readR1Backlog(), "AJ-B-002", "rank")).toBe("50");
  });

  test("has no horizontal page scroll at 390px while reading or editing", async ({ page }) => {
    resetR1Backlog("ranked");
    await page.setViewportSize({ width: 390, height: 844 });
    await openBacklog(page);
    await expectNoHorizontalPageScroll(page, "reading");

    await enterOrdering(page);
    await expect(page.getByRole("button", { name: "Move AJ-B-002 up" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Change priority for AJ-B-002" })).toBeVisible();
    await expectNoHorizontalPageScroll(page, "editing");
  });

  test("has no WCAG AA violations in reading, editing, review, stale, and invalid states", async ({ page }) => {
    resetR1Backlog("ranked");
    await openBacklog(page);
    await expectNoWcagAaViolations(page, "reading");

    await enterOrdering(page);
    await expectNoWcagAaViolations(page, "editing");

    await page.getByRole("button", { name: "Move AJ-B-002 up" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();
    await expect(page.getByRole("heading", { name: "Review the exact field changes" })).toBeVisible();
    await expectNoWcagAaViolations(page, "review");

    makeUnrelatedR1Edit();
    await page.getByRole("button", { name: "Confirm and apply" }).click();
    await expect(page.locator(".backlog-error-state")).toContainText("STALE_WRITE");
    await expectNoWcagAaViolations(page, "stale");

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
