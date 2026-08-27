import {
  loadControlHostConfig,
  type ControlHostResolvedPaths
} from "../lib/planning/config";
import { NativePlanningStore } from "../lib/planning/native/store";
import { NodeGitRunner } from "../lib/planning/providers/git-runner";
import { refreshAllProjects } from "../lib/planning/providers/refresh";

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes("--once");

  let paths: ControlHostResolvedPaths;
  try {
    paths = loadControlHostConfig();
  } catch (err: any) {
    console.error(`[planning-refresh] Configuration error: ${err.message}`);
    process.exit(1);
  }

  const gitRunner = new NodeGitRunner();
  const store = new NativePlanningStore();

  console.log(`[planning-refresh] Starting refresh worker (home: ${paths.homeDir}, interval: ${paths.config.refreshIntervalSeconds}s)`);

  async function cycle() {
    const startTime = Date.now();
    try {
      const results = await refreshAllProjects({ paths, gitRunner, store });
      const elapsed = Date.now() - startTime;
      console.log(`[planning-refresh] Refreshed ${results.size} projects in ${elapsed}ms`);
      for (const [slug, proj] of results) {
        console.log(`  - ${slug}: ${proj.freshness} (${proj.roadmap.length} phases, ${proj.backlog.length} backlog, ${proj.issues.length} issues)`);
      }
    } catch (err: any) {
      console.error(`[planning-refresh] Error during refresh cycle: ${err.message}`);
    }
  }

  if (once) {
    await cycle();
    process.exit(0);
  }

  // Continuous loop
  await cycle();
  setInterval(cycle, paths.config.refreshIntervalSeconds * 1000);
}

main().catch(err => {
  console.error(`[planning-refresh] Fatal: ${err.message}`);
  process.exit(1);
});
