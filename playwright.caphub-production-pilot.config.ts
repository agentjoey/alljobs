import { defineConfig, devices } from "@playwright/test";
import { createRequire } from "node:module";

const neonValidationOnly = process.argv.some((argument) => argument.endsWith("caphub-neon-validation.spec.ts"));
const loadPilotFixture = createRequire(__filename);
const pilot = neonValidationOnly ? undefined
  : loadPilotFixture("./tests/e2e/caphub-production-pilot-fixtures") as typeof import("./tests/e2e/caphub-production-pilot-fixtures");
const fixture = pilot === undefined ? undefined : (process.env.TEST_WORKER_INDEX === undefined
  ? pilot.createProductionPilotFixture()
  : pilot.readProductionPilotFixture());
if (fixture && pilot) {
  Object.assign(process.env, pilot.productionPilotEnvironment(fixture));
  process.once("exit", fixture.cleanup);
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["caphub-production-pilot.spec.ts", "caphub-neon-validation.spec.ts"],
  outputDir: "test-results/caphub-production-pilot",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    ...(pilot === undefined ? {} : { baseURL: pilot.CAPHUB_PRODUCTION_PILOT_ORIGIN }),
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: neonValidationOnly ? undefined : {
    command: "node --import tsx tests/e2e/caphub-production-pilot-fixtures.ts serve-caphub-production-pilot",
    url: `${pilot!.CAPHUB_PRODUCTION_PILOT_ORIGIN}/caphub`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    env: pilot!.productionPilotEnvironment(fixture!)
  }
});
