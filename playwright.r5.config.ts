import { defineConfig, devices } from "@playwright/test";
import { createR5Fixture, R5_CREDENTIAL_ENV_NAMES } from "./tests/e2e/r5-fixtures";

// R5 Application Monitoring e2e (plan Task 9). The fixture Control Host home
// is an isolated tmpdir; the production home and any real credentials are
// never read. The credential env vars named by the fixture config are deleted
// from the runner environment so the webServer child can never inherit a
// token value — collection fails closed before any provider request.

for (const name of R5_CREDENTIAL_ENV_NAMES) {
  delete process.env[name];
}

const fixture = createR5Fixture();
process.once("exit", fixture.cleanup);
process.env.ALLJOBS_HOME = fixture.homeDir;
process.env.ALLJOBS_DATA_ROOT = fixture.dataDir;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "r5-application-monitoring.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3461", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "./node_modules/.bin/next start -p 3461 -H 127.0.0.1",
    url: "http://127.0.0.1:3461",
    reuseExistingServer: false,
    env: { ...process.env, ALLJOBS_HOME: fixture.homeDir, ALLJOBS_DATA_ROOT: fixture.dataDir }
  }
});
