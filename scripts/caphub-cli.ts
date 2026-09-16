import type { CapabilityPackage } from "../lib/caphub/packages/types";
import type { RegistryVersion } from "../lib/caphub/registry/types";
import type { ExportRuntime, ExportTargetName } from "../lib/caphub/exports/runtime";
import type { ProjectionPlan } from "../lib/caphub/projection/planner";

export interface CliIo {
  log(message: string): void;
  error(message: string): void;
}

export const consoleIo: CliIo = {
  log: (message) => console.log(message),
  error: (message) => console.error(message)
};

export function parseFlags(argv: string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`unexpected positional argument: ${argument}`);
    }
    const name = argument.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(name, next);
      index += 1;
    } else {
      flags.set(name, true);
    }
  }
  return flags;
}

export function requireDryRun(flags: Map<string, string | true>): void {
  if (flags.get("dry-run") !== true) {
    throw new Error("refusing to run: the first mode must be --dry-run (read-only)");
  }
}

export function rejectForbiddenArgs(flags: Map<string, string | true>, forbidden: string[]): void {
  for (const name of forbidden) {
    if (flags.has(name)) {
      throw new Error(`refusing to run: --${name} is not accepted here; targets resolve from server configuration only`);
    }
  }
}

export function reportError(io: CliIo, error: unknown): number {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "FAILED";
  const message = error instanceof Error ? error.message : String(error);
  io.error(`${code}: ${message}`);
  return 1;
}

export interface ProjectCliDeps {
  loadRuntime(): ExportRuntime;
  loadReleaseSnapshot(recordId: string): Promise<RegistryVersion | null>;
  planProjection(input: {
    release: RegistryVersion;
    pkg: CapabilityPackage;
  }): Promise<ProjectionPlan>;
}

export async function caphubProjectMain(
  argv: string[],
  deps: ProjectCliDeps,
  io: CliIo = consoleIo
): Promise<number> {
  try {
    const flags = parseFlags(argv);
    requireDryRun(flags);
    rejectForbiddenArgs(flags, ["root", "path", "vault", "target-root"]);
    const releaseId = flags.get("release");
    if (typeof releaseId !== "string" || releaseId.length === 0) {
      throw new Error("missing --release <record-id>");
    }

    const runtime = deps.loadRuntime();
    runtime.assertEnabled("obsidian");
    const release = await deps.loadReleaseSnapshot(releaseId);
    if (!release) {
      throw new Error(`release ${releaseId} not found`);
    }
    const pkg = release.payload as CapabilityPackage;
    const plan = await deps.planProjection({ release, pkg });
    io.log(JSON.stringify({
      schema_version: 1,
      release: { record_id: release.record_id, version: release.version, digest: release.payload_digest },
      counts: {
        create: plan.entries.filter((entry) => entry.action === "create").length,
        update: plan.entries.filter((entry) => entry.action === "update").length,
        conflict: plan.entries.filter((entry) => entry.action === "conflict").length,
        orphan: plan.entries.filter((entry) => entry.action === "orphan").length
      },
      preimage_digest: plan.preimage_digest,
      postimage_digest: plan.postimage_digest,
      diff: plan.diff,
      truncated: plan.truncated,
      entries: plan.entries.map((entry) => ({
        path: entry.relative_path,
        action: entry.action,
        managed_digest: entry.managed_digest,
        postimage_digest: entry.postimage_digest
      }))
    }, null, 2));
    return 0;
  } catch (error) {
    return reportError(io, error);
  }
}


// --- Control Host composition (server-side only) -------------------------

export async function loadControlHostExportContext(): Promise<{
  runtime: ExportRuntime;
  releaseSnapshot(recordId: string): Promise<RegistryVersion | null>;
}> {
  const { loadControlHostConfig } = await import("../lib/planning/config");
  const { ExportRuntime } = await import("../lib/caphub/exports/runtime");
  const { loadControlHostRegistryRuntime } = await import("../lib/caphub/registry/runtime");
  const { PostgresRegistryRecordStore } = await import("../lib/caphub/registry/postgres/records");
  const { capabilityPackageSchema } = await import("../lib/caphub/packages/schemas");

  const resolved = loadControlHostConfig();
  const runtime = new ExportRuntime(resolved.config);
  const registry = await loadControlHostRegistryRuntime({ resolved });
  const records = new PostgresRegistryRecordStore(registry.pool, {
    release: capabilityPackageSchema,
    deployment_plan: (await import("../lib/caphub/packages/schemas")).deploymentPlanSchema
  });
  return {
    runtime,
    releaseSnapshot: async (recordId) => records.getCurrent(recordId)
  };
}
