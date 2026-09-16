
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

// --- Control Host composition (server-side only) -------------------------

export async function loadControlHostExportContext(): Promise<{
  runtime: import("../lib/caphub/exports/runtime").ExportRuntime;
  releaseSnapshot(recordId: string): Promise<import("../lib/caphub/registry/types").RegistryVersion | null>;
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
