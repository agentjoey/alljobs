import { defineConfig, devices } from "@playwright/test";
import { createDocumentAdaptationFixture } from "./tests/e2e/document-adaptation-fixtures";

const fixture = createDocumentAdaptationFixture();
process.once("exit", fixture.cleanup);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["accessibility.spec.ts", "planning-core.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3460",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "./node_modules/.bin/next start -p 3460 -H 127.0.0.1",
    url: "http://127.0.0.1:3460",
    reuseExistingServer: false,
    env: {
      ...process.env,
      ALLJOBS_HOME: fixture.homeDir,
      ALLJOBS_DATA_ROOT: fixture.dataDir
    }
  },
});
