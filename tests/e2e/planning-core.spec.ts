import { expect, test } from "@playwright/test";

test.describe("Planning Core UI Journeys", () => {
  test("loads Portfolio Overview with Workbench elements", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Personal Workbench" })).toBeVisible();
    await expect(page.getByText("Active Projects", { exact: true })).toBeVisible();
    await expect(page.getByText("Ongoing Work", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(/Universal search/i)).toBeVisible();
  });

  test("navigates to Projects and Register pages", async ({ page }) => {
    await page.goto("/");

    // Navigate to Projects via primary navigation
    await page.locator("nav.primary-nav").getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/.*\/projects/);
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();

    // Navigate to Register via primary navigation
    await page.locator("nav.primary-nav").getByRole("link", { name: "Register" }).click();
    await expect(page).toHaveURL(/.*\/register/);
    await expect(page.getByRole("heading", { name: "Register Project" })).toBeVisible();
  });

  test("navigates to Tasks and displays status filter chips", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page.locator("h1.view-title")).toHaveText("Tasks");
    await expect(page.getByRole("button", { name: /all/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /doing/i })).toBeVisible();
  });
});
