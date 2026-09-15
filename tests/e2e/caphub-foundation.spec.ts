import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// A fixed, valid 1x1 PNG. Expected storage bytes are independent of production helpers.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const PNG_NAME = "caphub-boundary.png";
const SOURCE_URL = "https://evidence.example.invalid/caphub";
const NOTE = "Preserve this fixed screenshot; Human review must still be required.";
const API_PATH = "/api/caphub/captures";

async function harness() { return import("./caphub-fixtures"); }

test("fixture guard refuses a changed sentinel before deleting any state", async () => {
  const createFixture = await import("./caphub-fixtures")
    .then((module) => module.createCaphubFixture, () => undefined);
  expect(createFixture, "Caphub needs an owner-checked isolated fixture").toEqual(expect.any(Function));
  const fixture = createFixture!();
  const original = readFileSync(fixture.sentinelPath, "utf8");
  try {
    writeFileSync(fixture.sentinelPath, JSON.stringify({ token: "foreign-token", ownerPid: process.pid }));
    expect(() => fixture.cleanup()).toThrow(/unowned/i);
    expect(existsSync(fixture.homeDir)).toBe(true);
    writeFileSync(fixture.sentinelPath, JSON.stringify({ token: fixture.token, ownerPid: process.pid + 1 }));
    expect(() => fixture.cleanup()).toThrow(/unowned/i);
    expect(existsSync(fixture.homeDir)).toBe(true);
  } finally {
    writeFileSync(fixture.sentinelPath, original);
    fixture.cleanup();
  }
  expect(existsSync(fixture.rootDir)).toBe(false);
});

test("fixture guard refuses symlinked roots and sentinels without deleting their targets", async () => {
  const { createCaphubFixture } = await harness();
  const fixture = createCaphubFixture();
  const savedSentinel = join(fixture.rootDir, "saved-sentinel.json");
  const savedRoot = `${fixture.rootDir}-saved`;
  try {
    renameSync(fixture.sentinelPath, savedSentinel);
    symlinkSync(savedSentinel, fixture.sentinelPath);
    try {
      expect(() => fixture.cleanup()).toThrow(/unsafe/i);
      expect(existsSync(savedSentinel)).toBe(true);
    } finally {
      unlinkSync(fixture.sentinelPath);
      renameSync(savedSentinel, fixture.sentinelPath);
    }
    renameSync(fixture.rootDir, savedRoot);
    symlinkSync(savedRoot, fixture.rootDir);
    try {
      expect(() => fixture.cleanup()).toThrow(/unsafe/i);
      expect(existsSync(join(savedRoot, "home", "config.json"))).toBe(true);
    } finally {
      unlinkSync(fixture.rootDir);
      renameSync(savedRoot, fixture.rootDir);
    }
  } finally { fixture.cleanup(); }
  expect(existsSync(fixture.rootDir)).toBe(false);
});

test("fixture guard lets a child validate state but never remove its owner's root", async () => {
  const { createCaphubFixture, caphubFixtureEnvironment } = await harness();
  const fixture = createCaphubFixture();
  const childCode = `const { readCaphubFixture } = require('./tests/e2e/caphub-fixtures.ts'); readCaphubFixture().cleanup();`;
  const env = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, NODE_ENV: "test" as const, TEST_WORKER_INDEX: "0", ...caphubFixtureEnvironment(fixture) };
  try {
    execFileSync(process.execPath, ["--import", "tsx", "-e", childCode], { env, stdio: "pipe", timeout: 10_000 });
    expect(existsSync(fixture.configPath)).toBe(true);
    for (const override of [
      { ALLJOBS_CAPHUB_E2E_TOKEN: "foreign-token" },
      { ALLJOBS_CAPHUB_E2E_OWNER_PID: String(process.pid + 1) },
      { ALLJOBS_CAPHUB_E2E_ROOT: resolve(fixture.rootDir, "..") },
      { ALLJOBS_HOME: resolve(fixture.homeDir, "..") }
    ]) {
      expect(() => execFileSync(process.execPath, ["--import", "tsx", "-e", childCode], {
        env: { ...env, ...override }, stdio: "pipe", timeout: 10_000
      })).toThrow();
      expect(existsSync(fixture.configPath)).toBe(true);
    }
  } finally { fixture.cleanup(); }
  expect(existsSync(fixture.rootDir)).toBe(false);
});

function outsideCaptureState(snapshot: Record<string, string>) {
  return Object.fromEntries(Object.entries(snapshot).filter(([path]) => !path.startsWith("home/state/caphub/")));
}

async function auditAndScreenshot(page: Page, testInfo: TestInfo, state: string) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 390) {
      const controls = page.locator(".caphub-page button:visible, .caphub-page input:visible, .caphub-page textarea:visible");
      expect(await controls.count()).toBeGreaterThan(0);
      for (const control of await controls.all()) {
        const box = await control.boundingBox();
        expect(box, "Every mobile capture control must have a visible target").not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
    }
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations).toEqual([]);
    const screenshot = testInfo.outputPath(`${state}-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(`${state}-${width}`, { path: screenshot, contentType: "image/png" });
  }
}

test("browser capture reaches immutable storage, rereads its receipt, and rejects a foreign replay", async ({ page, context, request }, testInfo) => {
  const { CAPHUB_ORIGIN, readCaphubFixture, snapshotCaphubFixture } = await harness();
  const fixture = readCaphubFixture();
  const before = snapshotCaphubFixture(fixture);
  const errors: string[] = [];
  const foreignRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === CAPHUB_ORIGIN) await route.continue();
    else { foreignRequests.push(route.request().url()); await route.abort(); }
  });
  await page.goto("/caphub");
  await expect(page.getByRole("heading", { name: "Preserve the evidence first." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose an image to continue" })).toBeDisabled();
  await auditAndScreenshot(page, testInfo, "ready");

  // Use the real chooser and UI; don't mock fetch or supply a fabricated browser Origin.
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose image", exact: true }).click();
  await (await choosing).setFiles({ name: PNG_NAME, mimeType: "image/png", buffer: PNG });
  await page.getByLabel("Source URL", { exact: false }).fill(SOURCE_URL);
  await page.getByLabel("Note", { exact: false }).fill(NOTE);
  await auditAndScreenshot(page, testInfo, "selected");

  const postPromise = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === API_PATH);
  const metadataPromise = page.waitForResponse((response) => response.request().method() === "GET" && /^\/api\/caphub\/captures\/cap_[0-9a-f]{32}$/.test(new URL(response.url()).pathname));
  await page.getByRole("button", { name: "Receive capture", exact: true }).click();
  const post = await postPromise;
  expect(post.status()).toBe(201);
  const created = await post.json();
  const id = created.capture.id as string;
  const digest = createHash("sha256").update(PNG).digest("hex");
  expect(id).toMatch(/^cap_[0-9a-f]{32}$/);
  expect(created).toEqual({
    kind: "created",
    capture: {
      schema_version: 1, id,
      source: { kind: "web", original_filename: PNG_NAME, source_url: SOURCE_URL },
      note: NOTE, mime_type: "image/png",
      object: { algorithm: "sha256", digest, bytes: PNG.length },
      status: "received", human_review_required: true, created_at: expect.any(String)
    }
  });
  const automaticGet = await metadataPromise;
  expect(automaticGet.url()).toBe(`${CAPHUB_ORIGIN}${API_PATH}/${id}`);
  expect(automaticGet.status()).toBe(200);
  expect(await automaticGet.json()).toEqual({ capture: created.capture });
  await expect(page.getByRole("heading", { name: "Capture received", exact: true })).toBeVisible();
  const receipt = page.getByRole("article", { name: "Created capture receipt" });
  await expect(receipt.getByText("received", { exact: true })).toBeVisible();
  await expect(receipt.getByText("Human review required", { exact: true })).toBeVisible();
  await expect(receipt.getByText(id, { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Receipt metadata refreshed" })).toBeAttached();
  const reread = await request.get(`${API_PATH}/${id}`);
  expect(reread.status()).toBe(200);
  expect(await reread.json()).toEqual({ capture: created.capture });
  expect(reread.headers()["cache-control"]).toBe("no-store");
  expect(reread.headers()["x-content-type-options"]).toBe("nosniff");

  const originalRequest = post.request();
  const headers = await originalRequest.allHeaders();
  const body = originalRequest.postDataBuffer();
  expect(headers.origin).toBe(CAPHUB_ORIGIN);
  expect(headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
  expect(body, "Playwright must capture the real multipart bytes, including the image").not.toBeNull();
  expect(body!.includes(PNG)).toBe(true);
  // Chromium does not expose its derived Content-Length through allHeaders.
  // The real 201 already proves the original met the route's mandatory length check.
  const multipart = await new Response(new Uint8Array(body!), { headers: { "content-type": headers["content-type"] } }).formData();
  expect([...multipart.keys()].sort()).toEqual(["idempotency_key", "image", "note", "source_url"]);
  const key = multipart.get("idempotency_key") as string;
  expect(key).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
  const replayHeaders = { origin: headers.origin, "content-type": headers["content-type"], "content-length": String(body!.length) };

  const stored = snapshotCaphubFixture(fixture);
  const files = Object.keys(stored).filter((path) => path.startsWith("home/state/caphub/") && stored[path] !== "directory");
  const capturePath = `home/state/caphub/records/captures/${id}.json`;
  const indexPath = `home/state/caphub/records/idempotency/${createHash("sha256").update(key).digest("hex")}.json`;
  const objectPath = `home/state/caphub/objects/sha256/${digest.slice(0, 2)}/${digest}`;
  const eventPath = `home/state/caphub/events/${created.capture.created_at.slice(0, 7)}.jsonl`;
  expect(files.sort()).toEqual([capturePath, indexPath, objectPath, eventPath].sort());
  expect(readFileSync(join(fixture.rootDir, objectPath))).toEqual(PNG);
  const record = JSON.parse(readFileSync(join(fixture.rootDir, capturePath), "utf8"));
  expect(record).toEqual({ ...created.capture, idempotency_key: key, object: { ...created.capture.object, key: `sha256/${digest.slice(0, 2)}/${digest}` } });
  expect(JSON.parse(readFileSync(join(fixture.rootDir, indexPath), "utf8"))).toEqual({ schema_version: 1, idempotency_key: key, capture_id: id });
  const events = readFileSync(join(fixture.rootDir, eventPath), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  expect(events).toEqual([{
    schema_version: 1, event_id: expect.stringMatching(/^evt_[0-9a-f]{32}$/),
    capture_id: id, type: "capture.received", actor: "web:user",
    occurred_at: created.capture.created_at, object_digest: digest
  }]);
  expect(outsideCaptureState(stored)).toEqual(outsideCaptureState(before));

  const duplicate = await request.post(API_PATH, { headers: replayHeaders, data: body! });
  expect(duplicate.status()).toBe(200);
  expect(await duplicate.json()).toEqual({ ...created, kind: "duplicate" });
  expect(snapshotCaphubFixture(fixture)).toEqual(stored);
  const foreign = await request.post(API_PATH, { headers: { ...replayHeaders, origin: "https://foreign.example.invalid" }, data: body! });
  expect(foreign.status()).toBe(403);
  expect(await foreign.json()).toEqual({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Capture request origin is not allowed." } });
  expect(snapshotCaphubFixture(fixture)).toEqual(stored);
  expect(await (await request.get(`${API_PATH}/${id}`)).json()).toEqual({ capture: created.capture });

  const text = await page.locator("body").innerText();
  for (const hidden of [fixture.rootDir, fixture.homeDir, fixture.token, record.object.key, key, PNG.toString("base64")]) expect(text).not.toContain(hidden);
  expect(await page.locator(".caphub-page img").count()).toBe(0);
  await auditAndScreenshot(page, testInfo, "received");
  expect(errors).toEqual([]);
  expect(foreignRequests).toEqual([]);
  await testInfo.attach("storage-boundary", { contentType: "application/json", body: JSON.stringify({
    captureId: id, digest, bytes: PNG.length, files, objectByteEquality: true,
    duplicateStatus: duplicate.status(), foreignOriginStatus: foreign.status(),
    immutableSnapshotAfterReplay: true, outsideCaptureStateUnchanged: true,
    browserErrors: errors, externalBrowserRequests: foreignRequests
  }, null, 2) });
});

test("oversize selection is rejected in the browser before any capture POST or disk write", async ({ page, context }, testInfo) => {
  const { CAPHUB_ORIGIN, CAPHUB_MAX_UPLOAD_BYTES, readCaphubFixture, snapshotCaphubFixture } = await harness();
  const fixture = readCaphubFixture();
  const before = snapshotCaphubFixture(fixture);
  const posts: string[] = [];
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (req) => { if (req.method() === "POST") posts.push(req.url()); });
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === CAPHUB_ORIGIN) await route.continue();
    else { external.push(route.request().url()); await route.abort(); }
  });
  await page.goto("/caphub");
  await page.getByLabel("Screenshot image").setInputFiles({
    name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(CAPHUB_MAX_UPLOAD_BYTES + 1)
  });
  await expect(page.locator("#capture-validation")).toContainText("larger than 10 MiB");
  await expect(page.getByRole("button", { name: "Choose an image to continue" })).toBeDisabled();
  // Enter exercises the form's submission boundary even with no staged image.
  await page.getByLabel("Source URL", { exact: false }).press("Enter");
  await auditAndScreenshot(page, testInfo, "oversize");
  expect(posts).toEqual([]);
  expect(snapshotCaphubFixture(fixture)).toEqual(before);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
