import { defineConfig, devices } from "@playwright/test";
import {
  CAPHUB_PRODUCTION_PILOT_ORIGIN,
  createProductionPilotFixture,
  productionPilotEnvironment,
  readProductionPilotFixture
} from "./tests/e2e/caphub-production-pilot-fixtures";

const fixture = process.env.TEST_WORKER_INDEX === undefined
  ? createProductionPilotFixture()
  : readProductionPilotFixture();
Object.assign(process.env, productionPilotEnvironment(fixture));
process.once("exit", fixture.cleanup);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "caphub-production-pilot.spec.ts",
  outputDir: "test-results/caphub-production-pilot",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: CAPHUB_PRODUCTION_PILOT_ORIGIN,
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --import tsx tests/e2e/caphub-production-pilot-fixtures.ts serve-caphub-production-pilot",
    url: `${CAPHUB_PRODUCTION_PILOT_ORIGIN}/caphub`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    env: productionPilotEnvironment(fixture)
  }
});
