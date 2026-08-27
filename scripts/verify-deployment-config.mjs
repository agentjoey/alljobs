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

console.log("[verify-deployment-config] All deployment configs and invariants verified successfully.");
process.exit(0);
