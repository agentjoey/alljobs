import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { loadControlHostConfig } from "../lib/planning/config";
import { loadControlHostRegistryRuntime } from "../lib/caphub/registry/runtime";
import { applyAutomationBackfill, inspectAutomationBackfill } from "../lib/caphub/automation/backfill";

export function parseBackfillArguments(args: string[]) {
  if (!args.length) return { apply: false };
  if (args.length === 1 && ["--dry-run", "--apply"].includes(args[0])) return { apply: args[0] === "--apply" };
  if (args.length === 3 && args[0] === "--apply" && args[1] === "--resolutions" && args[2] && !args[2].startsWith("--")) return { apply: true, resolutionsPath: args[2] };
  throw new Error("Usage: caphub:automation-backfill [--dry-run|--apply [--resolutions FILE]]");
}

export async function main(args = process.argv.slice(2)) {
  const options = parseBackfillArguments(args);
  const resolutions = options.resolutionsPath ? z.array(z.object({
    filenameKey: z.string().min(1).max(255), expectedGroupDigest: z.string().regex(/^[a-f0-9]{64}$/),
    currentCaptureId: z.string().regex(/^cap_[a-f0-9]{32}$/)
  }).strict()).parse(JSON.parse(await readFile(options.resolutionsPath, "utf8"))) : [];
  const runtime = await loadControlHostRegistryRuntime({ resolved: loadControlHostConfig() });
  try {
    const result = options.apply ? await applyAutomationBackfill(runtime.pool, resolutions) : await inspectAutomationBackfill(runtime.pool);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await runtime.pool.end(); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(() => { process.stderr.write("AUTOMATION_BACKFILL_UNAVAILABLE\n"); process.exitCode = 1; });
}
