import { defineConfig, devices } from "@playwright/test";
import { createR1Fixture } from "./tests/e2e/r1-fixtures";

const fixture = createR1Fixture();
process.once("exit", fixture.cleanup);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "r1-backlog-control.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3465",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "./node_modules/.bin/next start -p 3465 -H 127.0.0.1",
    url: "http://127.0.0.1:3465",
    reuseExistingServer: false,
    env: {
      ...process.env,
      ALLJOBS_HOME: fixture.homeDir,
      ALLJOBS_DATA_ROOT: fixture.dataDir
    }
  }
});
