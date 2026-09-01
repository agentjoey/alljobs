import { defineConfig, devices } from "@playwright/test";
import { createR2Fixture } from "./tests/e2e/r2-fixtures";

const fixture = createR2Fixture();
process.once("exit", fixture.cleanup);
process.env.ALLJOBS_HOME = fixture.homeDir;
process.env.ALLJOBS_DATA_ROOT = fixture.dataDir;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "r2-management-assistant.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3466", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "./node_modules/.bin/next start -p 3466 -H 127.0.0.1",
    url: "http://127.0.0.1:3466",
    reuseExistingServer: false,
    env: { ...process.env, ALLJOBS_HOME: fixture.homeDir, ALLJOBS_DATA_ROOT: fixture.dataDir }
  }
});
