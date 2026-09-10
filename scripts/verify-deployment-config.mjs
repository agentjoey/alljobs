import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

console.log("[verify-deployment-config] Checking deployment manifests and safety invariants...");

// 1. Check package.json scripts
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (!pkg.scripts["start:prod"]?.includes("-H 127.0.0.1") || !pkg.scripts["start:prod"]?.includes("-p 3456")) {
  console.error("[verify-deployment-config] start:prod script MUST include '-H 127.0.0.1 -p 3456'");
  process.exit(1);
}

// 2. Check LaunchAgents
const appPlist = readFileSync(resolve(root, "deploy/com.agentjoey.alljobs.plist"), "utf8");
if (!appPlist.includes("start:prod")) {
  console.error("[verify-deployment-config] com.agentjoey.alljobs.plist MUST call start:prod");
  process.exit(1);
}

const refreshPlist = readFileSync(resolve(root, "deploy/com.agentjoey.alljobs-refresh.plist"), "utf8");
if (!refreshPlist.includes("planning:refresh")) {
  console.error("[verify-deployment-config] com.agentjoey.alljobs-refresh.plist MUST call planning:refresh");
  process.exit(1);
}

// 3. Check Cloudflare config example
const cfConfig = readFileSync(resolve(root, "deploy/cloudflared-config.example.yml"), "utf8");
if (!cfConfig.includes("alljobs.agentjoey.ai") || !cfConfig.includes("http://localhost:3456") || !cfConfig.includes("http_status:404")) {
  console.error("[verify-deployment-config] cloudflared config MUST route to localhost:3456 and terminate with http_status:404");
  process.exit(1);
}

// 4. R2 assistant must keep provider credentials and responses server-only.
const assistantRoute = readFileSync(resolve(root, "app/api/assistant/respond/route.ts"), "utf8");
const assistantRouteFactory = readFileSync(resolve(root, "app/api/assistant/respond/route-factory.ts"), "utf8");
const minimaxProvider = readFileSync(resolve(root, "lib/assistant/minimax-token-plan.ts"), "utf8");
const clientSources = [
  resolve(root, "components/planning/assistant-panel.tsx"),
  resolve(root, "components/planning/assistant-session.ts"),
  resolve(root, "components/planning/assistant-answer.tsx")
].map((path) => readFileSync(path, "utf8")).join("\n");
// Human commit c9d83c8 renamed the disabled-config guard (`assistantIsEnabled`
// became `getAssistantConfig` plus `assistant?.enabled !== true`). Assert the
// semantic invariants, not the helper identifier: dynamic route, disabled or
// missing config rejected with a safe 503/no-store response, and configured
// allowedOrigins passed through to the route factory.
if (!assistantRoute.includes('export const dynamic = "force-dynamic"')) {
  console.error("[verify-deployment-config] assistant route MUST be dynamic");
  process.exit(1);
}
if (!assistantRoute.includes("assistant?.enabled !== true")) {
  console.error("[verify-deployment-config] assistant route MUST reject requests when the Control Host assistant config is disabled or missing");
  process.exit(1);
}
if (!assistantRoute.includes("status: 503") || !assistantRoute.includes('"cache-control": "no-store"')) {
  console.error("[verify-deployment-config] disabled assistant MUST answer with a safe 503 no-store response");
  process.exit(1);
}
if (!assistantRoute.includes("allowedOrigins: assistant.allowedOrigins")) {
  console.error("[verify-deployment-config] assistant route MUST pass configured allowedOrigins through to the route factory");
  process.exit(1);
}
if (!assistantRouteFactory.includes('"cache-control": "no-store"') || !assistantRouteFactory.includes('"x-content-type-options": "nosniff"')) {
  console.error("[verify-deployment-config] assistant responses MUST be no-store and nosniff");
  process.exit(1);
}
const minimaxProviderCore = readFileSync(resolve(root, "lib/assistant/minimax-token-plan-core.ts"), "utf8");
if (!minimaxProvider.startsWith('import "server-only";') || !minimaxProvider.includes("./minimax-token-plan-core") || !minimaxProviderCore.includes("MINIMAX_API_KEY")) {
  console.error("[verify-deployment-config] MINIMAX_API_KEY MUST remain behind the server-only MiniMax provider module");
  process.exit(1);
}
if (/NEXT_PUBLIC_MINIMAX|MINIMAX_API_KEY|api[_-]?key|credential/i.test(clientSources)) {
  console.error("[verify-deployment-config] assistant client sources MUST NOT reference provider credentials");
  process.exit(1);
}

console.log("[verify-deployment-config] All deployment configs and invariants verified successfully.");
process.exit(0);
