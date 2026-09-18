import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { PostgresReviewStore } from "../../lib/caphub/registry/postgres/reviews";
import {
  openFixturePool,
  readCaphubReviewFixture,
  seedReviewCandidate,
  seedAnalysisStop,
  setRegistryEnabled,
  snapshotFixtureFiles,
  type CaphubReviewFixture,
  type SeededReview
} from "./caphub-review-registry-fixtures";

const SCREEN_DIR = resolve(".agent/frontend-design/caphub-review-registry/final-screens");

async function openReview(page: Page, review: SeededReview): Promise<void> {
  await page.goto(`/reviews?request=${review.requestId}`);
  await expect(page.getByRole("heading", { name: /Decide with the evidence/i })).toBeVisible();
  await expect(page.getByText(review.candidateId).first()).toBeVisible();
}

async function approve(page: Page, review: SeededReview): Promise<string> {
  await page.getByLabel(/Typed confirmation/i).fill(review.approveConfirmation);
  await page.getByRole("button", { name: "Approve build" }).click();
  const outcome = page.getByRole("heading", { name: "Decision recorded" });
  await expect(outcome).toBeFocused();
  await expect(page.getByText(/No release, build, installation/i)).toBeVisible();
  return (await page.locator(".registry-decision-receipt dd code").first().textContent())!;
}

async function decisionFetch(page: Page, review: SeededReview, body: Record<string, unknown>) {
  return page.evaluate(async ({ requestId, body }) => {
    const response = await fetch(`/api/caphub/reviews/${requestId}/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: response.status, payload: await response.json() };
  }, { requestId: review.requestId, body });
}

async function shot(page: Page, name: string, width: 1440 | 390): Promise<void> {
  await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
  await page.screenshot({ path: resolve(SCREEN_DIR, `${name}-${width}.png`), fullPage: true });
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test.describe.serial("Caphub P3 final-build Review Registry", () => {
  let fixture: CaphubReviewFixture;
  let pool: Pool;

  test.beforeAll(() => {
    fixture = readCaphubReviewFixture();
    pool = openFixturePool(fixture);
    mkdirSync(SCREEN_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    await pool.end();
  });

  test("approves one exact immutable version without later-phase or filesystem side effects", async ({ page }) => {
    const review = await seedReviewCandidate(pool, fixture, "approve-boundary");
    const before = snapshotFixtureFiles(fixture);
    const failed: string[] = [];
    const external: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).hostname !== "127.0.0.1") external.push(request.url());
    });
    page.on("requestfailed", (request) => {
      if (!request.failure()?.errorText.includes("ERR_ABORTED")) failed.push(`${request.method()} ${request.url()}`);
    });
    await openReview(page, review);
    await expect(page.getByText("Official docs <img src=x onerror=alert(1)>")).toBeVisible();
    await expect(page.locator(".registry-evidence-card img, .registry-evidence-card script")).toHaveCount(0);
    const decisionId = await approve(page, review);
    expect(decisionId).toMatch(/^dec_[0-9a-f]{32}$/);

    const evidence = await pool.query<{
      decision_count: string;
      audit_count: string;
      job_status: string;
      job_decision: string;
      later_count: string;
    }>(`
      SELECT
        (SELECT count(*) FROM caphub.review_decisions WHERE request_id=$1)::text AS decision_count,
        (SELECT count(*) FROM caphub.audit_events WHERE decision_id=$2 AND event_type='review.decided')::text AS audit_count,
        (SELECT payload->>'status' FROM caphub.registry_versions v JOIN caphub.registry_records r USING(record_id)
          WHERE r.record_id=$3 AND v.version=r.current_version) AS job_status,
        (SELECT payload->>'review_decision_id' FROM caphub.registry_versions v JOIN caphub.registry_records r USING(record_id)
          WHERE r.record_id=$3 AND v.version=r.current_version) AS job_decision,
        (SELECT count(*) FROM caphub.registry_records WHERE kind IN ('build_proposal','release','deployment'))::text AS later_count
    `, [review.requestId, decisionId, review.jobId]);
    expect(evidence.rows[0]).toEqual({
      decision_count: "1",
      audit_count: "1",
      job_status: "reviewed",
      job_decision: decisionId,
      later_count: "0"
    });
    expect(snapshotFixtureFiles(fixture)).toEqual(before);
    expect(failed).toEqual([]);
    expect(external).toEqual([]);
  });

  test("keeps reject terminal and idempotency exact", async ({ page }) => {
    const rejected = await seedReviewCandidate(pool, fixture, "reject-terminal");
    await openReview(page, rejected);
    await page.getByRole("button", { name: /Reject permanently/i }).click();
    await page.getByLabel(/Rationale/i).fill("The evidence does not justify this candidate version.");
    await page.getByLabel(/Typed confirmation/i).fill(rejected.rejectConfirmation);
    await page.getByRole("button", { name: /Reject this version/i }).click();
    await expect(page.getByRole("heading", { name: "Decision recorded" })).toBeFocused();
    const retry = await decisionFetch(page, rejected, {
      idempotency_key: `review.intent-${randomUUID()}`,
      expected_lock_version: 2,
      expected_subject_digest: rejected.subjectDigest,
      action: "approve",
      confirmation: rejected.approveConfirmation,
      rationale: "",
      disposition: "build"
    });
    expect(retry.status).toBe(409);
    expect(retry.payload.error.code).toBe("REVIEW_ALREADY_TERMINAL");

    const exact = await seedReviewCandidate(pool, fixture, "idempotency-exact");
    await openReview(page, exact);
    const intent = `review.intent-${randomUUID()}`;
    const body = {
      idempotency_key: intent,
      expected_lock_version: 1,
      expected_subject_digest: exact.subjectDigest,
      action: "approve",
      confirmation: exact.approveConfirmation,
      rationale: "Same intent",
      disposition: "build"
    };
    const first = await decisionFetch(page, exact, body);
    const second = await decisionFetch(page, exact, body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.payload.decision.id).toBe(first.payload.decision.id);
    const conflict = await decisionFetch(page, exact, { ...body, rationale: "Changed intent" });
    expect(conflict.status).toBe(409);
    expect(conflict.payload.error.code).toBe("IDEMPOTENCY_CONFLICT");
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM caphub.review_decisions WHERE request_id=$1",
      [exact.requestId]
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  test("returns the concurrent winner receipt and forces stale requests to refresh", async ({ browser }) => {
    const concurrent = await seedReviewCandidate(pool, fixture, "concurrent-tabs");
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const first = await context.newPage();
    const second = await context.newPage();
    await Promise.all([openReview(first, concurrent), openReview(second, concurrent)]);
    const winnerDecisionId = await approve(first, concurrent);
    await second.getByLabel(/Rationale/i).fill("Preserve concurrent rationale");
    await second.getByLabel(/Typed confirmation/i).fill(concurrent.approveConfirmation);
    await second.getByRole("button", { name: "Approve build" }).click();
    await expect(second.getByRole("heading", { name: "Decision recorded" })).toBeFocused();
    await expect(second.locator(".registry-decision-receipt")).toContainText(winnerDecisionId);
    await context.close();

    const stale = await seedReviewCandidate(pool, fixture, "same-request-stale");
    const stalePage = await browser.newPage({ ignoreHTTPSErrors: true });
    await openReview(stalePage, stale);
    await pool.query("UPDATE caphub.review_requests SET lock_version=lock_version+1, updated_at=clock_timestamp() WHERE request_id=$1", [stale.requestId]);
    await stalePage.getByLabel(/Rationale/i).fill("Preserve stale rationale");
    await stalePage.getByLabel(/Typed confirmation/i).fill(stale.approveConfirmation);
    await stalePage.getByRole("button", { name: "Approve build" }).click();
    await expect(stalePage.locator(".registry-decision-error")).toContainText(/changed before the decision/i);
    await expect(stalePage.getByLabel(/Rationale/i)).toHaveValue("Preserve stale rationale");
    await expect(stalePage.getByRole("button", { name: /Refresh this request/i })).toBeVisible();
    await expect(stalePage.getByRole("button", { name: "Approve build" })).toBeDisabled();
    await stalePage.close();
  });

  test("renders safe-off, Capture lineage, Candidate-only state, responsive order, and WCAG checks", async ({ page }) => {
    const review = await seedReviewCandidate(pool, fixture, "surface-verification");
    try {
      setRegistryEnabled(fixture, false);
      await page.goto("/reviews");
      await expect(page.getByRole("heading", { name: /safe-off/i })).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/postgres(?:ql)?:\/\//i);
    } finally {
      setRegistryEnabled(fixture, true);
    }

    await page.goto(`/captures/${review.captureId}`);
    await expect(page.getByRole("heading", { name: /Trace the decision back/i })).toBeVisible();
    await expect(page.getByText(/Raw object keys.*withheld/i)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(fixture.rootDir);

    await page.goto(`/capabilities/${review.candidateId}`);
    await expect(page.getByRole("heading", { name: /not a released capability/i })).toBeVisible();
    await expect(page.getByText("No BuildProposal")).toBeVisible();
    await expect(page.getByText("No Release")).toBeVisible();
    await expect(page.getByText("No Deployment or Usage")).toBeVisible();

    await openReview(page, review);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page);
    const order = await page.locator(".registry-folio > *").evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return { className: element.className, order: Number(style.order) };
    }));
    expect(order.map(({ order: value }) => value)).toEqual([...order.map(({ order: value }) => value)].sort((a, b) => a - b));
    const controls = await page.locator(".registry-page button, .registry-page input, .registry-page textarea, .registry-page select, .registry-page a").evaluateAll((elements) => elements
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        text: element.textContent?.trim().slice(0, 48),
        height: element.getBoundingClientRect().height
      })));
    expect(controls.filter(({ height }) => height < 40)).toEqual([]);
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    const decisionJump = page.getByRole("link", { name: "Decision" });
    await expect(decisionJump).toBeVisible();
    await decisionJump.focus();
    await expect(decisionJump).toBeFocused();
    await decisionJump.press("Enter");
    await expect(page).toHaveURL(/#decision$/);
    await expect(page.locator("#decision")).toBeVisible();
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  });

  test("analysis stops show precise read-only failures with Capture navigation, responsive layout, and WCAG checks", async ({ page }) => {
    const stop = await seedAnalysisStop(pool, "analysis-stops-v2");
    const external: string[] = [];
    const mutations: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).hostname !== "127.0.0.1") external.push(request.url());
      if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url());
    });
    const before = await pool.query("SELECT count(*)::int AS versions FROM caphub.registry_versions");
    await page.goto("/reviews");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const panel = page.getByRole("region", { name: "Analysis stops" });
    const stopped = panel.getByRole("listitem").filter({ hasText: stop.jobId });
    await expect(stopped.getByText("DEEPSEEK_STRUCTURE_FAILED", { exact: true })).toBeVisible();
    await expect(stopped.getByRole("heading", { name: "Schema structuring" })).toBeVisible();
    await expect(stopped.getByText("caphub-analysis-v2", { exact: true })).toBeVisible();
    await expect(stopped.getByText("extraction", { exact: true })).toBeVisible();
    await expect(stopped.getByText(stop.supersedesJobId, { exact: true })).toBeVisible();
    await expect(panel.locator("form, button, input")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /retry|rerun|analyze/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /retry|rerun|analyze/i })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/postgres(?:ql)?:\/\/|api[_-]?key|authorization:|\/Users\//i);
    await expect(page.locator("body")).not.toContainText(fixture.rootDir);
    await expect(page.locator("body")).not.toContainText(stop.objectKey);
    const screenshots = resolve(".agent/caphub/extraction-v2-screenshots");
    mkdirSync(screenshots, { recursive: true });
    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => window.innerWidth)).toBe(width);
      await assertNoHorizontalOverflow(page);
      const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(accessibility.violations).toEqual([]);
      execFileSync(process.execPath, ["scripts/shot.mjs", "http://127.0.0.1:3470/reviews",
        resolve(screenshots, `analysis-stops-${width}.png`), String(width), "1", width === 390 ? "1" : "0"],
      { timeout: 20_000, stdio: "pipe" });
    }
    const capture = stopped.getByRole("link", { name: stop.captureId });
    await expect(capture).toHaveAttribute("href", `/captures/${stop.captureId}`);
    await capture.focus();
    await expect(capture).toBeFocused();
    await capture.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/captures/${stop.captureId}$`));
    await expect(page.getByRole("heading", { name: /Trace the decision back/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(stop.captureId);
    expect(external).toEqual([]);
    expect(mutations).toEqual([]);
    expect((await pool.query("SELECT count(*)::int AS versions FROM caphub.registry_versions")).rows).toEqual(before.rows);
  });

  test("captures the approved P3 state matrix from this production build", async ({ page }) => {
    const waiting = await seedReviewCandidate(pool, fixture, "screens-waiting");
    await openReview(page, waiting);
    await shot(page, "waiting", 1440);
    await shot(page, "waiting", 390);

    const approved = await seedReviewCandidate(pool, fixture, "screens-approved");
    await openReview(page, approved);
    const approvedDecision = await approve(page, approved);
    await openReview(page, approved);
    await expect(page.getByRole("button", { name: /Revoke approval/i })).toBeVisible();
    await expect(page.getByText(`REVOKE CANDIDATE ${approved.candidateId.slice(5, 13)}`)).toBeVisible();
    await expect(page.getByLabel(/Rationale \(required\)/i)).toBeVisible();
    await shot(page, "approved-unconsumed", 1440);
    await shot(page, "approved-unconsumed", 390);
    await new PostgresReviewStore(pool).consumeDecision(approvedDecision, `bld_${createHash("sha256").update("screens-consumer").digest("hex").slice(0, 32)}`);
    await openReview(page, approved);
    await shot(page, "approved-consumed", 1440);
    await shot(page, "approved-consumed", 390);

    const revoked = await seedReviewCandidate(pool, fixture, "screens-revoked");
    await openReview(page, revoked);
    await approve(page, revoked);
    await openReview(page, revoked);
    await page.getByLabel(/Rationale/i).fill("Approval is no longer appropriate.");
    await page.getByLabel(/Typed confirmation/i).fill(`REVOKE CANDIDATE ${revoked.candidateId.slice(5, 13)}`);
    const [revokeResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes(`/reviews/${revoked.requestId}/decisions`) && response.request().method() === "POST"),
      page.getByRole("button", { name: /Revoke approval/i }).click()
    ]);
    const revokePayload = await revokeResponse.json();
    expect(revokeResponse.status(), JSON.stringify(revokePayload)).toBe(200);
    await openReview(page, revoked);
    await expect(page.getByRole("heading", { name: "Approval revoked" })).toBeVisible();
    await shot(page, "revoked", 1440);
    await shot(page, "revoked", 390);

    const superseded = await seedReviewCandidate(pool, fixture, "screens-superseded");
    const latestId = `rev_${createHash("sha256").update("screens-latest").digest("hex").slice(0, 32)}`;
    await pool.query("BEGIN");
    try {
      await pool.query(`
        INSERT INTO caphub.review_requests
          (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
           lock_version, state, approve_confirmation, reject_confirmation, superseded_by_request_id, created_at, updated_at)
        SELECT $1, review_kind, subject_kind, subject_id, subject_version, subject_digest,
               1, 'WAITING_FOR_REVIEW', approve_confirmation, reject_confirmation, NULL,
               clock_timestamp(), clock_timestamp()
        FROM caphub.review_requests WHERE request_id=$2
      `, [latestId, superseded.requestId]);
      await pool.query(`UPDATE caphub.review_requests
        SET state='SUPERSEDED', superseded_by_request_id=$1, lock_version=lock_version+1, updated_at=clock_timestamp()
        WHERE request_id=$2`, [latestId, superseded.requestId]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
    await openReview(page, superseded);
    const latestLink = page.getByRole("link", { name: /Open latest request/i });
    await latestLink.focus();
    await expect(latestLink).toBeFocused();
    expect((await latestLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await shot(page, "superseded", 1440);
    await shot(page, "superseded", 390);

    const stale = await seedReviewCandidate(pool, fixture, "screens-stale");
    await openReview(page, stale);
    await pool.query("UPDATE caphub.review_requests SET lock_version=2, updated_at=clock_timestamp() WHERE request_id=$1", [stale.requestId]);
    await page.getByLabel(/Rationale/i).fill("Stale state stays visible.");
    await page.getByLabel(/Typed confirmation/i).fill(stale.approveConfirmation);
    await page.getByRole("button", { name: "Approve build" }).click();
    await expect(page.locator(".registry-decision-error")).toContainText(/changed before the decision/i);
    await shot(page, "same-request-stale", 1440);
    await shot(page, "same-request-stale", 390);

    await page.goto(`/captures/${waiting.captureId}`);
    await shot(page, "capture-lineage", 1440);
    await shot(page, "capture-lineage", 390);
    await page.goto(`/capabilities/${waiting.candidateId}`);
    await shot(page, "candidate-only-capability", 1440);
    await shot(page, "candidate-only-capability", 390);
    await assertNoHorizontalOverflow(page);
  });
});
