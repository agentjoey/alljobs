import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readCurrentIndex } from "@/lib/monitoring/store/store";
import { createR5Fixture, R5_CYCLE_ID } from "./r5-fixtures";

// R5 Application Monitoring — final-candidate journeys (plan Task 9).
//
// Every journey runs against an isolated fixture Control Host home whose
// credential env vars are never set: page rendering performs zero provider
// calls by construction, and a manual refresh fails closed with normalized
// per-binding failures before any adapter request or probe. A page-level
// request listener fails every test if any request leaves 127.0.0.1.
//
// ORDER MATTERS: the manual-refresh journey is declared last because a queued
// cycle atomically publishes a new projection containing only the refreshed
// Project's bindings. All other journeys are read-only.

let externalRequests: string[];

test.beforeEach(async ({ page }) => {
  externalRequests = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!/^https?:/.test(url)) return;
    if (new URL(url).hostname !== "127.0.0.1") externalRequests.push(url);
  });
});

test.afterEach(() => {
  expect(externalRequests, "route rendering must never call provider or external hosts").toEqual([]);
});

function attentionRegion(page: Page): Locator {
  return page.getByRole("region", { name: "Needs attention" });
}

function ledgerTable(page: Page): Locator {
  return page.getByRole("table", { name: "All monitored projects" });
}

function ledgerRow(page: Page, projectName: string): Locator {
  return ledgerTable(page).locator("tbody tr", { hasText: projectName });
}

test.describe("R5 application monitoring", () => {
  test("attention queue triages critical, warning, unknown, watch and omits healthy evidence", async ({ page }) => {
    await page.goto("/monitoring");

    await expect(page.getByRole("heading", { name: "Application monitoring" })).toBeVisible();
    const provenance = page.locator('[aria-label="Cached projection provenance"]');
    await expect(provenance).toContainText("cached projection");
    await expect(provenance).toContainText(`cycle ${R5_CYCLE_ID}`);
    await expect(provenance).toContainText("Partially complete");

    const queue = attentionRegion(page);
    const rows = queue.getByRole("listitem");
    await expect(rows).toHaveCount(5);
    await expect(rows.locator(".mon-status")).toHaveText([
      "Critical",
      "Warning",
      "Unknown",
      "Unknown",
      "Watch"
    ]);

    // Queue identity: project names in precedence-then-name order.
    await expect(rows.locator("strong")).toHaveText([
      "TalentVault",
      "GrandeGPT",
      "MathMagics",
      "NovaWeb",
      "PulseBoard"
    ]);

    // Healthy projects never occupy the queue — including OrbitDesk: its Vercel
    // binding is an unsupported OPTIONAL capability with zero required signals,
    // so the evaluator keeps its attention healthy and only the binding's
    // Collector detail carries the unsupported state. TalentVault's healthy
    // Neon binding does not add a second TalentVault row.
    await expect(queue.getByText("DocLock")).toHaveCount(0);
    await expect(queue.getByText("OrbitDesk")).toHaveCount(0);
    await expect(queue.getByText("neon-production-db")).toHaveCount(0);
    await expect(rows.filter({ hasText: "TalentVault" })).toHaveCount(1);

    // Each queue item links back to its owning Project.
    const critical = rows.filter({ hasText: "TalentVault" });
    await expect(critical).toContainText("confirmed unhealthy");
    const open = critical.getByRole("link", { name: "Open ›" });
    await expect(open).toHaveAttribute("href", "/monitoring/talentvault");
  });

  test("ledger lists every monitored project exactly once with state, providers, reason, freshness, action", async ({ page }) => {
    await page.goto("/monitoring");

    const table = ledgerTable(page);
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(7);

    // Every monitored Project appears exactly once, sorted by attention then name.
    await expect(rows.locator("td:first-child strong")).toHaveText([
      "TalentVault",
      "GrandeGPT",
      "MathMagics",
      "NovaWeb",
      "PulseBoard",
      "DocLock",
      "OrbitDesk"
    ]);

    const talentvault = ledgerRow(page, "TalentVault");
    await expect(talentvault.locator("td").nth(1)).toHaveText("Critical");
    await expect(talentvault.locator("td").nth(2)).toHaveText("Neon 1 · Railway 1");
    await expect(talentvault.locator("td").nth(3)).toContainText("confirmed unhealthy");
    await expect(talentvault.locator("td").nth(4)).toHaveText("Current");
    await expect(talentvault.getByRole("link", { name: "Open ›" })).toHaveAttribute("href", "/monitoring/talentvault");

    const mathmagics = ledgerRow(page, "MathMagics");
    await expect(mathmagics.locator("td").nth(1)).toHaveText("Unknown");
    await expect(mathmagics.locator("td").nth(3)).toContainText("permission was denied");
    await expect(mathmagics.locator("td").nth(4)).toHaveText("Expired");

    // OrbitDesk's Vercel extension binding is collector-unsupported but declares
    // no required signals, so the evaluator keeps the Project healthy with no
    // active reasons and no freshness evidence; the unsupported state itself is
    // asserted in the binding's Collector detail on the detail route.
    const orbitdesk = ledgerRow(page, "OrbitDesk");
    await expect(orbitdesk.locator("td").nth(1)).toHaveText("Healthy");
    await expect(orbitdesk.locator("td").nth(2)).toHaveText("Vercel 1");
    await expect(orbitdesk.locator("td").nth(3)).toHaveText("No active reasons");
    await expect(orbitdesk.locator("td").nth(4)).toHaveText("—");

    const pulseboard = ledgerRow(page, "PulseBoard");
    await expect(pulseboard.locator("td").nth(1)).toHaveText("Watch");
    await expect(pulseboard.locator("td").nth(3)).toContainText("82% of its known allowance");

    const doclock = ledgerRow(page, "DocLock");
    await expect(doclock.locator("td").nth(1)).toHaveText("Healthy");
    await expect(doclock.locator("td").nth(3)).toHaveText("No active reasons");

    // Summary cards agree with the ledger and queue.
    const summary = page.getByRole("group", { name: "Monitoring summary" });
    await expect(summary.locator(".metric-card", { hasText: "Projects" }).locator(".metric-value")).toHaveText("7");
    await expect(summary.locator(".metric-card", { hasText: "Bindings" }).locator(".metric-value")).toHaveText("8");
    await expect(summary.locator(".metric-card", { hasText: "Needs attention" }).locator(".metric-value")).toHaveText("5");
    await expect(summary.locator(".metric-card", { hasText: "Freshness" }).locator(".metric-value")).toHaveText("Expired");
  });

  test("critical drill-down from the queue reaches signal-level evidence", async ({ page }) => {
    await page.goto("/monitoring");
    await attentionRegion(page).getByRole("listitem").filter({ hasText: "TalentVault" })
      .getByRole("link", { name: "Open ›" }).click();
    await expect(page).toHaveURL(/\/monitoring\/talentvault$/);

    await expect(page.getByRole("heading", { name: "TalentVault" })).toBeVisible();
    const why = page.getByRole("region", { name: "Why attention" });
    await expect(why).toContainText("Runtime is confirmed unhealthy after 2 consecutive failures of the independent probe.");

    // Provider-binding comparison keeps each signal separate.
    const bindings = page.getByRole("table", { name: "Provider bindings for TalentVault" });
    const railwayRow = bindings.locator("tbody tr", { hasText: "railway-production-api" });
    await expect(railwayRow.locator("td").nth(1)).toHaveText("Critical");
    await expect(railwayRow.locator("td").nth(2)).toHaveText("Succeeded");
    await expect(railwayRow.locator("td").nth(3)).toHaveText("Unhealthy");
    await expect(railwayRow.locator("td").nth(5)).toHaveText("Current");
    const neonRow = bindings.locator("tbody tr", { hasText: "neon-production-db" });
    await expect(neonRow.locator("td").nth(1)).toHaveText("Healthy");

    // Expand the critical binding: signal matrix, timestamps, billing
    // alignment, console link, and reason evidence become visible.
    const toggle = page.getByRole("button", { name: "Signal matrix for Railway · service · railway-production-api" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const matrix = page.getByRole("group", { name: "Signal matrix for Railway · service · railway-production-api" });
    await expect(matrix.locator(".mon-signal", { hasText: "Collector" })).toContainText("Healthy");
    await expect(matrix.locator(".mon-signal", { hasText: "Deployment" })).toContainText("Succeeded · c41ea1");
    await expect(matrix.locator(".mon-signal", { hasText: "Runtime" })).toContainText("Unhealthy");
    await expect(matrix.locator(".mon-signal", { hasText: "Runtime" })).toContainText("2 consecutive failures");
    await expect(matrix.locator(".mon-signal", { hasText: "Usage" })).toContainText("120 cpu_seconds · 12% of allowance");
    await expect(matrix.locator(".mon-signal", { hasText: "Platform incident" })).toContainText("None related");
    await expect(matrix.locator(".mon-signal", { hasText: "Freshness" })).toContainText("Current");

    const usage = page.getByRole("list", { name: "Usage measures" });
    await expect(usage).toContainText("Operational only");
    await expect(usage).toContainText("reported 2026-09-11 05:58 UTC");

    const freshness = page.getByRole("list", { name: "Signal freshness" });
    await expect(freshness).toContainText("observed 2026-09-11 05:55 UTC");
    await expect(freshness).toContainText("observed 2026-09-11 05:59 UTC");

    const reasons = page.getByRole("list", { name: "Attention reasons" });
    await expect(reasons).toContainText("runtime_unhealthy_confirmed");
    await expect(reasons).toContainText("runtime · observed 05:59");

    const consoleLink = railwayRow.getByRole("link", { name: "Provider console ↗" });
    await expect(consoleLink).toHaveAttribute("href", "https://railway.com/project/example.invalid-talentvault");
    await expect(consoleLink).toHaveAttribute("rel", /noopener/);

    // Recent normalized evidence with the bounded deterministic interpretation.
    const evidence = page.getByRole("region", { name: "Recent evidence" });
    await expect(evidence).toContainText("runtime · runtime: healthy → unhealthy");
    await expect(evidence).toContainText("deployment · deployment: building → succeeded");
    await expect(evidence).toContainText("The failure began 4 minutes after the active deployment.");
    await expect(evidence).toContainText("correlation evidence only");
  });

  test("mixed evidence stays separate: a succeeded deployment never flattens a failed runtime", async ({ page }) => {
    await page.goto("/monitoring/talentvault");

    const bindings = page.getByRole("table", { name: "Provider bindings for TalentVault" });
    const railwayRow = bindings.locator("tbody tr", { hasText: "railway-production-api" });
    // Both facts are simultaneously visible on the same binding row, and the
    // binding state stays Critical rather than collapsing to healthy.
    await expect(railwayRow.locator("td").nth(1)).toHaveText("Critical");
    await expect(railwayRow.locator("td").nth(2)).toHaveText("Succeeded");
    await expect(railwayRow.locator("td").nth(3)).toHaveText("Unhealthy");

    await page.getByRole("button", { name: "Signal matrix for Railway · service · railway-production-api" }).click();
    const matrix = page.getByRole("group", { name: "Signal matrix for Railway · service · railway-production-api" });
    await expect(matrix.locator(".mon-signal", { hasText: "Deployment" })).toContainText("Succeeded · c41ea1");
    await expect(matrix.locator(".mon-signal", { hasText: "Runtime" })).toContainText("Unhealthy");
  });

  test("stale and permission states render with their specific reasons; an unsupported optional capability never downgrades attention", async ({ page }) => {
    // Landing queue carries the specific reason per state.
    await page.goto("/monitoring");
    const queue = attentionRegion(page);
    await expect(queue.getByRole("listitem").filter({ hasText: "MathMagics" })).toContainText("permission was denied");
    // OrbitDesk's unsupported capability is optional (no required signals), so
    // it produces no queue entry and no aggregate reason.
    await expect(queue.getByRole("listitem").filter({ hasText: "OrbitDesk" })).toHaveCount(0);

    // Permission failure + expired retained value on the unknown project.
    await page.goto("/monitoring/mathmagics");
    await expect(page.getByRole("region", { name: "Why attention" })).toContainText("permission was denied");
    await page.getByRole("button", { name: "Signal matrix for Fly.io · app · fly-production-worker" }).click();
    const matrix = page.getByRole("group", { name: "Signal matrix for Fly.io · app · fly-production-worker" });
    await expect(matrix.locator(".mon-signal", { hasText: "Collector" })).toContainText("Permission denied");
    // The retained last-trustworthy value stays visible but is labeled expired.
    await expect(matrix.locator(".mon-signal", { hasText: "Runtime" })).toContainText("Healthy");
    await expect(matrix.locator(".mon-signal", { hasText: "Freshness" })).toContainText("Expired");
    const reasons = page.getByRole("list", { name: "Attention reasons" });
    await expect(reasons).toContainText("collector_permission_denied");
    await expect(reasons).toContainText("stale_max_age_exceeded");

    // Extension provider short-circuits with zero collection requests: the
    // unsupported capability stays visible in the binding's Collector detail,
    // but with zero required signals the evaluator leaves aggregate attention
    // healthy and emits no reason — never a fabricated unknown.
    await page.goto("/monitoring/orbitdesk");
    await expect(page.getByRole("region", { name: "Why attention" }))
      .toContainText("No active reasons");
    const orbitRow = page.getByRole("table", { name: "Provider bindings for OrbitDesk" })
      .locator("tbody tr", { hasText: "vercel-production-site" });
    await expect(orbitRow.locator("td").nth(1)).toHaveText("Healthy");
    await expect(orbitRow.locator("td").nth(5)).toHaveText("—");
    await page.getByRole("button", { name: "Signal matrix for Vercel · project · vercel-production-site" }).click();
    const orbitMatrix = page.getByRole("group", { name: "Signal matrix for Vercel · project · vercel-production-site" });
    await expect(orbitMatrix.locator(".mon-signal", { hasText: "Collector" })).toContainText("Unsupported capability");
    // No attention-reason list renders for a healthy binding.
    await expect(page.getByRole("list", { name: "Attention reasons" })).toHaveCount(0);
  });

  test("unmonitored project is absent and a never-collected project reads as pending unknown", async ({ page }) => {
    await page.goto("/monitoring");
    await expect(ledgerTable(page).getByText("Ledgerless")).toHaveCount(0);
    await expect(attentionRegion(page).getByText("Ledgerless")).toHaveCount(0);

    // Monitored but never collected: pending row in the ledger, unknown queue
    // entry explaining that no collection has happened yet.
    const novaweb = ledgerRow(page, "NovaWeb");
    await expect(novaweb.locator("td").nth(1)).toHaveText("Not yet collected");
    await expect(novaweb.locator("td").nth(2)).toHaveText("Railway 1");
    await expect(attentionRegion(page).getByRole("listitem").filter({ hasText: "NovaWeb" }))
      .toContainText("has not been collected yet");

    // Unmonitored projects have no detail route at all.
    const response = await page.goto("/monitoring/ledgerless");
    expect(response?.status()).toBe(404);

    // The pending project renders an explicit awaiting-first-collection state.
    await page.goto("/monitoring/novaweb");
    await expect(page.getByText(/Awaiting first collection/)).toBeVisible();
    const pendingRow = page.getByRole("table", { name: "Provider bindings for NovaWeb" })
      .locator("tbody tr", { hasText: "railway-production-app" });
    await expect(pendingRow.locator("td").nth(1)).toHaveText("Not yet collected");
  });

  test("keyboard traversal reaches refresh, queue links, and binding toggles with visible focus", async ({ page }) => {
    await page.goto("/monitoring");

    const focusName = async () => page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? `${el.tagName}:${el.textContent?.trim() ?? ""}` : "";
    });
    const focusOutline = () => page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "none";
      const style = getComputedStyle(el);
      return style.outlineStyle;
    });

    // Tab reaches the attention queue's drill-down links with a visible outline.
    let reachedQueueLink = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const name = await focusName();
      if (name.startsWith("A:") && name.includes("Open ›")) { reachedQueueLink = true; break; }
    }
    expect(reachedQueueLink, "Tab never reached a queue drill-down link").toBe(true);
    expect(await focusOutline()).toBe("solid");

    await page.goto("/monitoring/talentvault");
    const toggle = page.getByRole("button", { name: "Signal matrix for Railway · service · railway-production-api" });

    let reachedRefresh = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.textContent?.trim() === "Refresh monitoring")) {
        reachedRefresh = true;
        break;
      }
    }
    expect(reachedRefresh, "Tab never reached the refresh control").toBe(true);
    expect(await focusOutline()).toBe("solid");

    // Continue tabbing to the binding toggle; Enter and Space both operate it.
    let reachedToggle = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("aria-controls") === "mon-binding-railway-production-api")) {
        reachedToggle = true;
        break;
      }
    }
    expect(reachedToggle, "Tab never reached the binding toggle").toBe(true);
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#mon-binding-railway-production-api")).toBeVisible();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#mon-binding-railway-production-api")).toBeHidden();
  });

  test("390px layout reflows rows into labeled blocks without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/monitoring");

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

    // Rows recompose into labeled cards: the header row is gone and each cell
    // is announced by its data-label pseudo element.
    const table = ledgerTable(page);
    await expect(table.locator("thead")).toBeHidden();
    const talentvault = ledgerRow(page, "TalentVault");
    const label = (index: number) =>
      talentvault.locator("td").nth(index).evaluate((el) => getComputedStyle(el, "::before").content);
    expect(await label(0)).toBe('"Project"');
    expect(await label(1)).toBe('"State"');
    expect(await label(2)).toBe('"Provider bindings"');
    expect(await label(3)).toBe('"Leading reason"');
    expect(await label(4)).toBe('"Freshness"');
    expect(await label(5)).toBe('"Action"');

    // State, provider, reason, freshness, and the drill-down action remain visible.
    await expect(talentvault.locator("td").nth(1)).toHaveText("Critical");
    await expect(talentvault.locator("td").nth(2)).toContainText("Railway");
    await expect(talentvault.locator("td").nth(3)).toContainText("confirmed unhealthy");
    await expect(talentvault.locator("td").nth(4)).toHaveText("Current");
    await expect(talentvault.getByRole("link", { name: "Open ›" })).toBeVisible();

    // The attention queue keeps its status and reason visible at 390px.
    const first = attentionRegion(page).getByRole("listitem").first();
    await expect(first.locator(".mon-status")).toHaveText("Critical");
    await expect(first).toContainText("confirmed unhealthy");

    // The project detail route reflows the same way at 390px.
    await page.goto("/monitoring/talentvault");
    const detailMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(detailMetrics.scrollWidth).toBeLessThanOrEqual(detailMetrics.clientWidth);
    const bindings = page.getByRole("table", { name: "Provider bindings for TalentVault" });
    await expect(bindings.locator("thead")).toBeHidden();
    const railwayRow = bindings.locator("tbody tr", { hasText: "railway-production-api" });
    await expect(railwayRow.locator("td").nth(1)).toHaveText("Critical");
    await expect(railwayRow.locator("td").nth(3)).toHaveText("Unhealthy");
    await expect(railwayRow.getByRole("button", { name: /Signal matrix for Railway/ })).toBeVisible();
  });

  test("both monitoring routes pass an automated WCAG 2 AA audit", async ({ page }) => {
    await page.goto("/monitoring");
    const landing = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(landing.violations).toEqual([]);

    await page.goto("/monitoring/talentvault");
    // Audit with a binding expanded so the signal-matrix panel is included.
    await page.getByRole("button", { name: "Signal matrix for Railway · service · railway-production-api" }).click();
    const detail = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(detail.violations).toEqual([]);
  });

  // LAST: queueing a refresh atomically republishes the projection scoped to
  // the refreshed Project, so this journey must run after all read-only ones.
  test("manual refresh announces a normalized safe outcome and cannot reach providers", async ({ page }) => {
    await page.goto("/monitoring/talentvault");
    const status = page.getByRole("status");
    const refresh = page.getByRole("button", { name: "Refresh monitoring" });

    await refresh.click();
    // The ack always names the snapshot generation that keeps being served.
    await expect(status).toContainText("Refresh queued");
    await expect(status).toContainText(`cycle ${R5_CYCLE_ID}`);
    await expect(status).toContainText("keeps being served");

    // The page never blanks or errors while collection runs.
    await expect(page.getByRole("heading", { name: "TalentVault" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Provider bindings for TalentVault" })).toBeVisible();

    // No secret-shaped text anywhere in the rendered page or announcement.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/\b(bearer|authorization|secrets?|api[-_]?keys?|tokens?)\b/i);

    // A second immediate click can never bypass single-flight, backoff, or the
    // minimum interval: it reports collecting or backing off, never a new fan-out.
    await refresh.click();
    await expect(status).toContainText(/already running|backing off/);

    // The queued cycle fails closed (credential env vars are unset) with zero
    // provider network; once published, the new projection keeps serving
    // normalized evidence with last-trustworthy values carried forward.
    const fixture = createR5Fixture();
    await expect.poll(
      () => {
        const index = readCurrentIndex(fixture.monitoringDir);
        return index.ok ? index.value.cycle_id : null;
      },
      { timeout: 15_000 }
    ).not.toBe(R5_CYCLE_ID);

    await page.reload();
    await page.getByRole("button", { name: "Signal matrix for Railway · service · railway-production-api" }).click();
    const matrix = page.getByRole("group", { name: "Signal matrix for Railway · service · railway-production-api" });
    await expect(matrix.locator(".mon-signal", { hasText: "Collector" })).toContainText("Authentication failed");
    // Last trustworthy values survive the failed cycle.
    await expect(matrix.locator(".mon-signal", { hasText: "Deployment" })).toContainText("Succeeded · c41ea1");
    await expect(matrix.locator(".mon-signal", { hasText: "Runtime" })).toContainText("Unhealthy");

    const refreshedText = await page.locator("body").innerText();
    expect(refreshedText).not.toMatch(/\b(bearer|authorization|secrets?|api[-_]?keys?|tokens?)\b/i);
  });
});
