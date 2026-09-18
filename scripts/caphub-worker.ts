import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { AnalysisRequests } from "../lib/caphub/registry/postgres/analysis-requests";
import { runAnalysisTick } from "../lib/caphub/automation/worker";

export function parseWorkerArgs(args: readonly string[]): "dry-run" | "once" | "daemon" {
  if (!args.length) return "dry-run";
  if (args.length === 1 && ["--dry-run", "--once", "--daemon"].includes(args[0])) return args[0].slice(2) as "dry-run" | "once" | "daemon";
  throw new Error("Usage: caphub:worker [--dry-run|--once|--daemon]");
}
export async function main(args = process.argv.slice(2)) {
  const mode = parseWorkerArgs(args);
  const { loadControlHostConfig } = await import("../lib/planning/config");
  const { loadControlHostRegistryRuntime } = await import("../lib/caphub/registry/runtime");
  const resolved = loadControlHostConfig();
  const runtime = await loadControlHostRegistryRuntime({ resolved });
  const requests = new AnalysisRequests(runtime.pool);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    if (mode === "dry-run") {
      process.stdout.write(`${JSON.stringify({ autoStart: resolved.config.caphub?.analysis.autoStart ?? false, requests: await requests.summary() })}\n`);
      return;
    }
    if (!resolved.config.caphub?.enabled || !resolved.config.caphub.analysis.enabled || !resolved.config.caphub.analysis.autoStart) {
      process.stdout.write(' {"state":"disabled"}\n'.trimStart());
      return;
    }
    const { loadControlHostProductionWorkflow } = await import("../lib/caphub/service/production-workflow");
    const workflow = await loadControlHostProductionWorkflow();
    do {
      try {
        const result = await runAnalysisTick({ requests, workflow, clock: () => new Date(), ownerToken: randomUUID }, controller.signal);
        if (mode === "once") process.stdout.write(`${JSON.stringify({ state: result })}\n`);
      } catch {
        process.stderr.write("CAPHUB_WORKER_TICK_UNAVAILABLE\n");
        if (mode === "once") { process.exitCode = 1; break; }
      }
      if (mode !== "daemon" || controller.signal.aborted) break;
      await delay(2000, undefined, { signal: controller.signal }).catch(() => {});
    } while (!controller.signal.aborted);
  } finally {
    process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop);
    await runtime.pool.end();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(() => { process.stderr.write("CAPHUB_WORKER_UNAVAILABLE\n"); process.exitCode = 1; });
}
