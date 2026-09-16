import { defineConfig, devices } from "@playwright/test";
import {
  CAPHUB_REVIEW_ORIGIN,
  createCaphubReviewFixture,
  readCaphubReviewFixture,
  reviewFixtureEnvironment
} from "./tests/e2e/caphub-review-registry-fixtures";

const fixture = process.env.TEST_WORKER_INDEX === undefined
  ? createCaphubReviewFixture()
  : readCaphubReviewFixture();
Object.assign(process.env, reviewFixtureEnvironment(fixture));
process.once("exit", fixture.cleanup);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "caphub-review-registry.spec.ts",
  outputDir: "test-results/caphub-review-registry",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: CAPHUB_REVIEW_ORIGIN,
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --import tsx tests/e2e/caphub-review-registry-fixtures.ts serve-caphub-review-fixture",
    url: `${CAPHUB_REVIEW_ORIGIN}/reviews`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 90_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    env: reviewFixtureEnvironment(fixture)
  }
});
