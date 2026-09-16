import { defineConfig, devices } from "@playwright/test";
import {
  CAPHUB_P4_ORIGIN,
  createP4Fixture,
  p4FixtureEnvironment,
  readP4Fixture
} from "./tests/e2e/caphub-package-export-fixtures";

const fixture = process.env.TEST_WORKER_INDEX === undefined
  ? createP4Fixture()
  : readP4Fixture();
Object.assign(process.env, p4FixtureEnvironment(fixture));
process.once("exit", fixture.cleanup);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "caphub-package-export.spec.ts",
  outputDir: "test-results/caphub-package-export",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: CAPHUB_P4_ORIGIN,
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --import tsx tests/e2e/caphub-package-export-fixtures.ts serve-caphub-p4-fixture",
    url: `${CAPHUB_P4_ORIGIN}/reviews`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    env: p4FixtureEnvironment(fixture)
  }
});
