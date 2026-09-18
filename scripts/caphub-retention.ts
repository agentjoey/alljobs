import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import type { loadControlHostConfig } from "../lib/planning/config";
import { sweepRetention } from "../lib/caphub/automation/retention";
import { createNeonS3DeletionPort, parseNeonS3Environment } from "../lib/caphub/storage/neon-s3";

export function parseRetentionArgs(args: readonly string[]) {
  if (!args.length || (args.length === 1 && args[0] === "--dry-run")) return { dryRun: true };
  if (args.length === 1 && args[0] === "--apply") return { dryRun: false };
  throw new Error("Usage: caphub:retention [--dry-run|--apply]");
}
export async function runConfiguredRetention(resolved: ReturnType<typeof loadControlHostConfig>, pool: Pool, dryRun: boolean) {
  const caphub = resolved.config.caphub;
  if (!caphub?.enabled || !caphub.registry.enabled) throw new Error("RETENTION_DISABLED");
  if (!dryRun && !caphub.retention.enabled) throw new Error("RETENTION_DISABLED");
  const storage = caphub.storage;
  const objects = dryRun ? { deleteExactObject: async () => { throw new Error("DRY_RUN_NO_DELETE"); } }
    : storage.mode === "neon_s3" ? createNeonS3DeletionPort(parseNeonS3Environment({ bucket: storage.bucket, refs: storage, env: process.env })) : null;
  if (!objects) throw new Error("RETENTION_STORAGE_UNSUPPORTED");
  return sweepRetention({ pool, objects }, { now: new Date(), dryRun, limit: 25 });
}
export async function main(args = process.argv.slice(2)) {
  const { dryRun } = parseRetentionArgs(args);
  const { loadControlHostConfig } = await import("../lib/planning/config");
  const { loadControlHostRegistryRuntime } = await import("../lib/caphub/registry/runtime");
  const resolved = loadControlHostConfig();
  const runtime = await loadControlHostRegistryRuntime({ resolved });
  try { process.stdout.write(`${JSON.stringify(await runConfiguredRetention(resolved,runtime.pool,dryRun))}\n`); }
  finally { await runtime.pool.end(); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(() => { process.stderr.write("CAPHUB_RETENTION_UNAVAILABLE\n"); process.exitCode = 1; });
}
