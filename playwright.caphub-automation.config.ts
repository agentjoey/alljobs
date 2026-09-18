import {defineConfig,devices} from "@playwright/test";
import {AUTOMATION_ORIGIN,createAutomationFixture,readAutomationFixture,automationEnvironment} from "./tests/e2e/caphub-automation-fixtures";
const fixture=process.env.TEST_WORKER_INDEX===undefined?createAutomationFixture():readAutomationFixture();
Object.assign(process.env,automationEnvironment(fixture));process.once("exit",fixture.cleanup);
export default defineConfig({testDir:"./tests/e2e",testMatch:"caphub-automation.spec.ts",outputDir:"test-results/caphub-automation",fullyParallel:false,workers:1,retries:0,reporter:"list",timeout:90000,expect:{timeout:15000},
 use:{baseURL:AUTOMATION_ORIGIN,ignoreHTTPSErrors:true,serviceWorkers:"block",trace:"retain-on-failure"},projects:[{name:"chromium",use:{...devices["Desktop Chrome"]}}],
 webServer:{command:"node --conditions=react-server --import tsx tests/e2e/caphub-automation-fixtures.ts serve-caphub-automation",url:`${AUTOMATION_ORIGIN}/`,ignoreHTTPSErrors:true,reuseExistingServer:false,timeout:90000,gracefulShutdown:{signal:"SIGTERM",timeout:10000},env:automationEnvironment(fixture)}});
