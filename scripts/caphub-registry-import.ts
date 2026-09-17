import { pathToFileURL } from "node:url";

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export type CaphubRegistryImportCommand =
  | { action: "dry-run" }
  | { action: "apply"; expectedSourceDigest: string };

export interface CaphubRegistryImportDependencies {
  plan(): Promise<unknown>;
  apply(expectedSourceDigest: string): Promise<unknown>;
}

export interface RegistryImportConfig {
  enabled: boolean;
  databaseUrlEnv: string;
  migrationDatabaseUrlEnv: string;
  connectionMode: "local_socket" | "tls_verify_full";
  managedHosts: string[];
  maxConnections: number;
  statementTimeoutMs: number;
}

export function resolveRegistryImportConfig(config: {
  caphub?: { enabled: boolean; registry?: RegistryImportConfig };
}): RegistryImportConfig {
  const registry = config.caphub?.registry;
  if (!registry?.enabled) throw new Error("Caphub Registry must be enabled for import");
  return registry;
}

export function parseCaphubRegistryImportArgs(args: readonly string[]): CaphubRegistryImportCommand {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) return { action: "dry-run" };
  if (args.length === 5 && args[0] === "--apply" && args[1] === "--digest"
    && DIGEST_PATTERN.test(args[2] ?? "") && args[3] === "--confirm" && args[4] === "IMPORT-CAPHUB-CAPTURES") {
    return { action: "apply", expectedSourceDigest: args[2] as string };
  }
  throw new Error(
    "Usage: caphub:registry-import [--dry-run] | --apply --digest SHA256 --confirm IMPORT-CAPHUB-CAPTURES"
  );
}

export async function runCaphubRegistryImport(
  args: readonly string[],
  dependencies: CaphubRegistryImportDependencies
): Promise<unknown> {
  const command = parseCaphubRegistryImportArgs(args);
  return command.action === "dry-run"
    ? dependencies.plan()
    : dependencies.apply(command.expectedSourceDigest);
}

async function loadFixedDependencies(): Promise<CaphubRegistryImportDependencies> {
  const [{ loadControlHostConfig }, importer] = await Promise.all([
    import("../lib/planning/config"),
    import("../lib/caphub/registry/filesystem-import")
  ]);
  const resolved = loadControlHostConfig();
  return {
    plan: () => importer.planFilesystemCaptureImport({ root: resolved.caphubStateDir as string }),
    apply: async (expectedSourceDigest) => {
      const [{ Pool }, connection, stores] = await Promise.all([
        import("pg"),
        import("../lib/caphub/registry/connection"),
        import("../lib/caphub/registry/postgres/caphub-stores")
      ]);
      const registry = resolveRegistryImportConfig(resolved.config);
      const databaseUrl = process.env[registry.databaseUrlEnv];
      if (!databaseUrl) throw new Error("Caphub application database environment reference is unavailable");
      const pool = new Pool({
        ...connection.parseRegistryConnection({
          databaseUrl,
          mode: registry.connectionMode,
          role: "application",
          resolvedHome: resolved.homeDir,
          managedHosts: registry.managedHosts
        }),
        max: registry.maxConnections,
        statement_timeout: registry.statementTimeoutMs,
        application_name: "alljobs-caphub-registry-import",
        idleTimeoutMillis: 30_000
      });
      try {
        return await importer.applyFilesystemCaptureImport({
          root: resolved.caphubStateDir as string,
          expectedSourceDigest,
          captures: new stores.PostgresCaptureStore(pool),
          audit: new stores.PostgresCaptureAuditLog(pool)
        });
      } finally {
        await pool.end();
      }
    }
  };
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  loadDependencies: () => Promise<CaphubRegistryImportDependencies> = loadFixedDependencies,
  write: (value: string) => void = (value) => process.stdout.write(value)
): Promise<void> {
  const result = await runCaphubRegistryImport(args, await loadDependencies());
  write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Caphub Registry import failed"}\n`);
    process.exitCode = 1;
  });
}
