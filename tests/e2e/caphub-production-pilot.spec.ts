import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createAndVerifyPilotBackup,
  createProductionPilotCaptureBytes,
  finalizePilotRelease,
  openProductionPilotPool,
  readProductionPilotFixture,
  readProductionPilotState,
  runPilotAnalysisAndImport,
  composePilotRelease
} from "./caphub-production-pilot-fixtures";

const SCREEN_DIR = resolve(".agent/caphub/production-activation-screenshots");

async function approve(page: Page, requestId: string, kind: "candidate" | "release"): Promise<string> {
  await page.goto(`/reviews?request=${requestId}`);
  await expect(page.getByRole("heading", { name: /Decide with the evidence/i })).toBeVisible();
  if (kind === "candidate") await page.getByRole("button", { name: "adopt", exact: true }).click();
  const confirmation = (await page.locator("code", { hasText: new RegExp(`APPROVE ${kind.toUpperCase()}`) }).first().textContent())?.trim();
  if (!confirmation) throw new Error("approval confirmation is unavailable");
  await page.getByLabel(/Typed confirmation/i).fill(confirmation);
  await page.getByRole("button", { name: kind === "candidate" ? "Approve adopt" : "Approve this version" }).click();
  await expect(page.getByRole("heading", { name: "Decision recorded" })).toBeFocused();
  return (await page.locator(".registry-decision-receipt dd code").first().textContent())!;
}

test("runs one isolated P1-P4 lifecycle while every target remains disabled", async ({ page }) => {
  const fixture = readProductionPilotFixture();
  const state = readProductionPilotState(fixture);
  const pool = openProductionPilotPool(fixture);
  const png = await createProductionPilotCaptureBytes();
  mkdirSync(SCREEN_DIR, { recursive: true });
  try {
    expect(state.captureImport).toMatchObject({ created: 1, sourceUnchanged: true });

    await page.goto("/caphub");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose image", exact: true }).click();
    await (await chooser).setFiles({ name: "pilot-capability.png", mimeType: "image/png", buffer: png });
    await page.getByLabel("Source URL", { exact: false }).fill("https://docs.example.com/pilot-capability");
    await page.getByLabel("Note", { exact: false }).fill("Fixture-only third-party capability evidence.");
    const responsePromise = page.waitForResponse((response) => response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/caphub/captures");
    await page.getByRole("button", { name: "Receive capture", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const captureId = (await response.json()).capture.id as string;

    const analyzed = await runPilotAnalysisAndImport(pool, fixture, captureId);
    expect(analyzed.first).toEqual(analyzed.second);
    expect(analyzed.providerCalls).toEqual({ minimax: 1, kimi: 2 });
    expect(analyzed.first.analysisStatus).toBe("WAITING_FOR_REVIEW");

    await page.goto(`/reviews?request=${analyzed.first.reviewRequestId}`);
    await expect(page.getByText(analyzed.candidateId).first()).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: join(SCREEN_DIR, "reviews-1440.png"), fullPage: true });
    const candidateDecisionId = await approve(page, analyzed.first.reviewRequestId!, "candidate");

    const release = await composePilotRelease(pool, analyzed.candidateId, candidateDecisionId);
    const releaseDecisionId = await approve(page, release.requestId, "release");
    await expect(finalizePilotRelease(pool, release.releaseId, releaseDecisionId)).resolves.toEqual({ status: "finalized" });
    await expect(finalizePilotRelease(pool, release.releaseId, releaseDecisionId)).resolves.toEqual({ status: "existing" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/capabilities/${analyzed.candidateId}`);
    await expect(page.getByRole("heading", { name: "Adapter previews" })).toBeVisible();
    for (const name of ["codex", "claude", "hermes"]) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/targets remain disabled|stays read-only|safe-off/i).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: join(SCREEN_DIR, "capability-390.png"), fullPage: true });

    const evidence = await pool.query<{ deployments: string; captures: string }>(`
      SELECT
        (SELECT count(*) FROM caphub.registry_records WHERE kind IN ('deployment_plan','deployment'))::text AS deployments,
        (SELECT count(*) FROM caphub.registry_records WHERE kind='capture')::text AS captures
    `);
    expect(evidence.rows[0]).toEqual({ deployments: "0", captures: "2" });
    expect(existsSync(join(fixture.rootDir, "targets"))).toBe(false);

    const backup = await createAndVerifyPilotBackup(pool, fixture);
    expect(backup.verified).toBe(true);
    expect(backup.counts.capture).toBe(2);
  } finally {
    await pool.end();
  }
});
