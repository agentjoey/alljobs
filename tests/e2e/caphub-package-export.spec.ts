import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  readP4Fixture,
  readP4FixtureState,
  setP4ExportsEnabled,
  type P4FixtureState
} from "./caphub-package-export-fixtures";

const SCREEN_DIR = resolve(".agent/caphub/p4-screenshots");

async function shot(page: Page, name: string, width: 1440 | 390): Promise<void> {
  mkdirSync(SCREEN_DIR, { recursive: true });
  await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
  await page.screenshot({ path: resolve(SCREEN_DIR, `${name}-${width}.png`), fullPage: true });
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function assertNoRootLeakage(page: Page): Promise<void> {
  const html = await page.content();
  expect(html).not.toContain("/private/tmp");
  expect(html).not.toContain("caphub-pg-");
  expect(html).not.toMatch(/postgres:\/\//);
  expect(html).not.toContain("CAPHUB_DATABASE_URL");
}

test.describe.serial("Caphub P4 package export browser journeys", () => {
  let state: P4FixtureState;

  test.beforeAll(() => {
    state = readP4FixtureState();
  });

  test("Review Center filters deployment requests and records the exact confirmation once", async ({ page }) => {
    await page.goto("/reviews?kind=deployment");
    await expect(page.getByRole("heading", { name: /Decide with the evidence/i })).toBeVisible();
    await expect(page.locator("select[name=kind]")).toHaveValue("deployment");
    await expect(page.locator(".registry-docket li").first()).toBeVisible();

    await page.goto(`/reviews?kind=deployment&request=${state.deploymentRequestWaiting}`);
    const confirmation = (await page.locator("code", { hasText: /APPROVE DEPLOYMENT/ }).first().textContent())
      ?.trim();
    if (!confirmation) throw new Error("approve confirmation not rendered");
    await page.getByLabel(/Typed confirmation/i).fill(confirmation);
    await page.getByRole("button", { name: "Approve this version" }).click();
    await expect(page.getByRole("heading", { name: "Decision recorded" })).toBeFocused();

    await page.goto(`/reviews?kind=deployment&request=${state.deploymentRequestWaiting}`);
    await expect(page.getByText(/consumed|No release, build, installation/i).first()).toBeVisible();
    await assertNoRootLeakage(page);
  });

  test("Capability detail shows no-release state with eligibility copy", async ({ page }) => {
    await page.goto(`/capabilities/${state.candidates.plain}`);
    await expect(page.getByRole("heading", { name: "No Release candidate" })).toBeVisible();
    await expect(page.getByText(/adopt/)).toBeVisible();
    await expect(page.getByText(/learn/)).toBeVisible();
    await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);
    await assertNoRootLeakage(page);
  });

  test("Capability detail shows waiting release, adapter previews, projection conflict, and unconsumed plan", async ({ page }) => {
    await page.goto(`/capabilities/${state.releaseWaiting}`);
    await expect(page.getByRole("heading", { name: "Release candidate" })).toBeVisible();
    await expect(page.getByText(/waiting for its own exact-version human review/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Adapter previews" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Obsidian projection" })).toBeVisible();
    await expect(page.getByText(/not owned by Caphub/)).toBeVisible();
    await expect(page.getByText(/decision unconsumed/i)).toBeVisible();
    await expect(page.getByText(/stays read-only/i)).toBeVisible();
    await assertNoRootLeakage(page);
    await shot(page, "capability-waiting", 1440);
  });

  test("Capability detail shows finalized release with active pointer, history, and rollback plan", async ({ page }) => {
    await page.goto(`/capabilities/${state.releaseDeployed}`);
    await expect(page.getByText(/finalized; deployment planning may proceed/i)).toBeVisible();
    await expect(page.getByText(/Active pointer: deployment/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Deployment history" })).toBeVisible();
    await expect(page.getByText(/rollback/i).first()).toBeVisible();
    await assertNoRootLeakage(page);
    await shot(page, "capability-deployed", 1440);
  });

  test("Capability detail shows unsupported adapter output as a publish block", async ({ page }) => {
    await page.goto(`/capabilities/${state.releaseUnsupported}`);
    await expect(page.getByText(/Unsupported adapter output blocks every target publish/i)).toBeVisible();
    await assertNoRootLeakage(page);
  });

  test("exports safe-off state renders without roots after the master switch is turned off", async ({ page }) => {
    const fixture = readP4Fixture();
    setP4ExportsEnabled(fixture, false);
    await page.goto(`/capabilities/${state.releaseWaiting}`);
    await expect(page.getByRole("heading", { name: "Exports are safe-off" })).toBeVisible();
    setP4ExportsEnabled(fixture, true);
    await page.goto(`/capabilities/${state.releaseWaiting}`);
    await expect(page.getByRole("heading", { name: "Release candidate" })).toBeVisible();
  });

  test("390px viewport keeps the export states readable without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/capabilities/${state.releaseDeployed}`);
    await expect(page.getByRole("heading", { name: "Deployment history" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await shot(page, "capability-deployed", 390);
  });

  test("keyboard focus starts on a meaningful control and axe WCAG A/AA stays clean", async ({ page }) => {
    await page.goto(`/capabilities/${state.releaseWaiting}`);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["A", "BUTTON", "SELECT", "INPUT", "H1", "H2"]).toContain(focused ?? "");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations).toEqual([]);
  });
});
