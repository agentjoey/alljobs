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

async function expectNoBacklogManagement(page: Page) {
  await expect(page.getByRole("tab", { name: /^Backlog/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manage ordering" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate proposal" })).toHaveCount(0);
}

test.describe("Document adaptation source boundaries", () => {
  test("keeps canonical Backlog metadata as read-only document evidence", async ({ page }) => {
    await page.goto("/projects/canonical-code");
    await expect(page.getByRole("status").filter({ hasText: "Canonical" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Backlog document" })).toBeVisible();
    await expect(page.getByText("docs/BACKLOG.md", { exact: true })).toBeVisible();
    await expect(page.getByText("Planning evidence only · no Backlog writes", { exact: true })).toBeVisible();
    await expectNoBacklogManagement(page);
  });

  test("shows a missing local Backlog without cached fallback, handoff, or management", async ({ page }) => {
    await page.goto("/projects/missing-backlog");
    const backlogEvidence = page.locator("article").filter({ has: page.getByRole("heading", { level: 3, name: "Backlog document" }) });
    await expect(backlogEvidence).toContainText("Missing document");
    await expect(backlogEvidence).toContainText("docs/BACKLOG.md");
    await expect(backlogEvidence.getByRole("button", { name: "Copy repository-agent handoff" })).toHaveCount(0);
    await expect(page.getByText("Cached fallback item", { exact: true })).toHaveCount(0);
    await expectNoBacklogManagement(page);
  });

  test("keeps recoverable and unstructured candidates as evidence only", async ({ page }) => {
    await page.goto("/projects/recoverable-code");
    await expect(page.getByText("Canonical repair needed", { exact: true })).toBeVisible();
    await expect(page.getByText("Candidate section", { exact: true })).toBeVisible();
    await expect(page.getByText("Evidence only — not promoted to Roadmap or Backlog.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy repository-agent handoff" })).toHaveCount(0);
    await expectNoBacklogManagement(page);

    await page.goto("/projects/unstructured-code");
    await expect(page.getByText("Not canonical planning data", { exact: true }).first()).toBeVisible();
    const backlogEvidence = page.locator("article").filter({ has: page.getByRole("heading", { level: 3, name: "Backlog document" }) });
    await expect(backlogEvidence.getByRole("button", { name: "Copy repository-agent handoff" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy repository-agent handoff" })).toHaveCount(1);
    await expectNoBacklogManagement(page);
  });

  test("keeps a remote canonical projection read-only", async ({ page }) => {
    await page.goto("/projects/remote-readonly");
    await expect(page.getByText("Remote commit", { exact: true })).toBeVisible();
    await expect(page.getByText("Read-only source", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Backlog document" })).toBeVisible();
    await expect(page.getByText("Read only · no planning writes", { exact: true })).toBeVisible();
    await expectNoBacklogManagement(page);
  });

  test("keeps only the Roadmap handoff keyboard reachable at a true 390px viewport", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3466" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects/unstructured-code");
    const copy = page.getByRole("button", { name: "Copy repository-agent handoff" });
    await expect(copy).toHaveCount(1);
    await tabUntilFocused(page, copy, "Roadmap repository-agent handoff");
    await expect(copy).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Repository-agent handoff copied.", { exact: true })).toBeVisible();
    const handoff = await page.evaluate(() => navigator.clipboard.readText());
    expect(handoff).toContain("docs/ROADMAP.md");
    expect(handoff).not.toContain("docs/BACKLOG.md");
    expect(handoff).toContain("Document state: unstructured");
    await expectNoBacklogManagement(page);
    await expectNoHorizontalPageScroll(page, "read-only planning evidence at 390px");
  });
});
