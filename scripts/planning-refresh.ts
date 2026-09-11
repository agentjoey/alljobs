import { pathToFileURL } from "node:url";
import {
  loadControlHostConfig,
  type ControlHostResolvedPaths
} from "../lib/planning/config";
import { NativePlanningStore } from "../lib/planning/native/store";
import { NodeGitRunner } from "../lib/planning/providers/git-runner";
import { refreshAllProjects } from "../lib/planning/providers/refresh";
import {
  runMonitoringRefreshOnce,
  type MonitoringRefreshSummary
} from "./monitoring-refresh";

/**
 * Monitoring rides the existing refresh loop (design §14) but never shares
 * its failure fate: any monitoring error is caught, logged under its own
 * prefix, and the Git planning refresh result stands. When monitoring is
 * disabled the runner is not invoked at all.
 */
export async function runMonitoringRefreshSafely(
  paths: ControlHostResolvedPaths,
  run: () => Promise<MonitoringRefreshSummary> = () => runMonitoringRefreshOnce({ paths })
): Promise<void> {
  if (paths.config.monitoring?.enabled !== true) return;
  try {
    const summary = await run();
    console.log(
      `[monitoring-refresh] Cycle ${summary.cycle_id ?? "n/a"}: ${summary.status} (${summary.outcomes.length} bindings)`
    );
  } catch (err: any) {
    console.error(
      `[monitoring-refresh] Monitoring refresh failed; Git planning refresh is unaffected: ${err.message}`,
      err
    );
  }
}

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
    await runMonitoringRefreshSafely(paths);
  }

  if (once) {
    await cycle();
    process.exit(0);
  }

  // Continuous loop: schedule the next cycle only after the current one
  // completes, so slow cycles can never overlap (setInterval would)
  async function loop(): Promise<void> {
    await cycle();
    setTimeout(loop, paths.config.refreshIntervalSeconds * 1000);
  }
  await loop();
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main().catch(err => {
    console.error(`[planning-refresh] Fatal: ${err.message}`);
    process.exit(1);
  });
}
