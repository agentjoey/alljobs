import { expect, test, type Page } from "@playwright/test";

async function tabUntilFocused(page: Page, target: ReturnType<Page["getByRole"]>, label: string) {
  for (let step = 0; step < 48; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) {
      await expect(target, `${label} receives keyboard focus`).toBeFocused();
      return;
    }
  }
  throw new Error(`${label} was not reachable with Tab.`);
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
      .slice(0, 12)
  }));
  expect(
    report.scrollWidth,
    `${state} overflow: ${JSON.stringify(report.culprits)}`
  ).toBeLessThanOrEqual(report.clientWidth);
}

test.describe("Document adaptation source boundaries", () => {
  test("keeps canonical planning data in the normal ledger", async ({ page }) => {
    await page.goto("/projects/canonical-code");
    await expect(page.getByRole("status").filter({ hasText: "Canonical" })).toBeVisible();
    await page.getByRole("tab", { name: /^Backlog \(/ }).click();
    await expect(page.getByTestId("backlog-card")).toContainText("Canonical backlog item");
  });

  test("shows a missing local Backlog without cached fallback or ordering", async ({ page }) => {
    await page.goto("/projects/missing-backlog");
    await expect(page.getByText("Missing document", { exact: true })).toBeVisible();
    await expect(page.getByText("docs/BACKLOG.md", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy repository-agent handoff" })).toBeVisible();
    await page.getByRole("tab", { name: /^Backlog \(Missing document\)$/ }).click();
    await expect(page.getByTestId("backlog-card")).toHaveCount(0);
    await expect(page.getByText("Cached fallback item", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Manage ordering" })).toHaveCount(0);
  });

  test("keeps recoverable and unstructured candidates as evidence only", async ({ page }) => {
    await page.goto("/projects/recoverable-code");
    await expect(page.getByText("Canonical repair needed", { exact: true })).toBeVisible();
    await expect(page.getByText("Candidate section", { exact: true })).toBeVisible();
    await expect(page.getByText("Evidence only — not promoted to Roadmap or Backlog.", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /^Backlog \(/ }).click();
    await expect(page.getByRole("button", { name: "Manage ordering" })).toHaveCount(0);

    await page.goto("/projects/unstructured-code");
    await expect(page.getByText("Not canonical planning data", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("backlog-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Manage ordering" })).toHaveCount(0);
  });

  test("keeps a remote canonical projection read-only", async ({ page }) => {
    await page.goto("/projects/remote-readonly");
    await expect(page.getByText("Remote commit", { exact: true })).toBeVisible();
    await expect(page.getByText("Read-only source", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /^Backlog \(/ }).click();
    await expect(page.getByText("REMOTE COMMIT · READ ONLY", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage ordering" })).toBeDisabled();
  });

  test("supports keyboard-only handoff copying at a true 390px viewport", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3466" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects/missing-backlog");
    const copy = page.getByRole("button", { name: "Copy repository-agent handoff" });
    await tabUntilFocused(page, copy, "Copy repository-agent handoff");
    await expect(copy).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Repository-agent handoff copied.", { exact: true })).toBeVisible();
    const handoff = await page.evaluate(() => navigator.clipboard.readText());
    expect(handoff).toContain("docs/BACKLOG.md");
    expect(handoff).toContain("Document state: missing");
    await expectNoHorizontalPageScroll(page, "missing Backlog at 390px");
  });
});
