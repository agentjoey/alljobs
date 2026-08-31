import { defineConfig, devices } from "@playwright/test";
import { createDocumentAdaptationFixture } from "./tests/e2e/document-adaptation-fixtures";

const fixture = createDocumentAdaptationFixture();
process.once("exit", fixture.cleanup);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "document-adaptation-mobile-layout.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3467",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "./node_modules/.bin/next start -p 3467 -H 127.0.0.1",
    url: "http://127.0.0.1:3467",
    reuseExistingServer: false,
    env: {
      ...process.env,
      ALLJOBS_HOME: fixture.homeDir,
      ALLJOBS_DATA_ROOT: fixture.dataDir
    }
  }
});
