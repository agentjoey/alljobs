import { defineConfig, devices } from "@playwright/test";
import { CAPHUB_ORIGIN, caphubFixtureEnvironment, createCaphubFixture, readCaphubFixture } from "./tests/e2e/caphub-fixtures";

const fixture = process.env.TEST_WORKER_INDEX === undefined ? createCaphubFixture() : readCaphubFixture();
Object.assign(process.env, caphubFixtureEnvironment(fixture));
process.once("exit", fixture.cleanup);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "caphub-foundation.spec.ts",
  outputDir: "test-results/caphub-foundation",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: CAPHUB_ORIGIN,
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Starts built `next start -p 3468 -H 127.0.0.1` behind the fixture-only TLS proxy.
    command: "node --import tsx tests/e2e/caphub-fixtures.ts serve-caphub-fixture",
    url: `${CAPHUB_ORIGIN}/caphub`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    env: caphubFixtureEnvironment(fixture)
  }
});
