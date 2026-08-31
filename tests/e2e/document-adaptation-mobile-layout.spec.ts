import { expect, test } from "@playwright/test";

test("keeps document health within a true 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects/missing-backlog");
  await expect(page.getByRole("region", { name: "Planning document health" })).toBeVisible();

  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));

  expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth);
});
