import { pathToFileURL } from "node:url";

export type CaphubPostgresAction = "check" | "bootstrap" | "migrate";

export interface CaphubPostgresCommand {
  action: CaphubPostgresAction;
}

export interface CaphubPostgresDependencies {
  check(): Promise<unknown>;
  bootstrap(): Promise<unknown>;
  migrate(): Promise<unknown>;
}

export function parseCaphubPostgresArgs(args: readonly string[]): CaphubPostgresCommand {
  if (args.length === 1 && args[0] === "--check") return { action: "check" };
  if (args.length === 3 && args[1] === "--confirm") {
    if (args[0] === "--bootstrap" && args[2] === "BOOTSTRAP-CAPHUB-POSTGRES") {
      return { action: "bootstrap" };
    }
    if (args[0] === "--migrate" && args[2] === "APPLY-CAPHUB-MIGRATIONS") {
      return { action: "migrate" };
    }
  }
  throw new Error(
    "Usage: caphub:postgres --check | --bootstrap --confirm BOOTSTRAP-CAPHUB-POSTGRES | --migrate --confirm APPLY-CAPHUB-MIGRATIONS"
  );
}

export async function runCaphubPostgres(
  args: readonly string[],
  dependencies: CaphubPostgresDependencies
): Promise<unknown> {
  const command = parseCaphubPostgresArgs(args);
  if (command.action === "check") return dependencies.check();
  if (command.action === "bootstrap") return dependencies.bootstrap();
  return dependencies.migrate();
}

async function loadFixedDependencies(): Promise<CaphubPostgresDependencies> {
  const [{ Pool }, { loadControlHostConfig }, connection, operations] = await Promise.all([
    import("pg"),
    import("../lib/planning/config"),
    import("../lib/caphub/registry/connection"),
    import("../lib/caphub/registry/operations")
  ]);

  const loadResolved = () => loadControlHostConfig();

  const withPools = async <T>(
    operation: (input: {
      appPool: InstanceType<typeof Pool>;
      migrationPool: InstanceType<typeof Pool>;
      connectionMode: "local_socket" | "tls_verify_full";
      expectedSocketDir: string;
    }) => Promise<T>
  ): Promise<T> => {
    const resolved = loadResolved();
    const registry = resolved.config.caphub?.registry;
    if (!registry) throw new Error("Caphub Registry configuration is unavailable");
    const appUrl = process.env[registry.databaseUrlEnv];
    const migrationUrl = process.env[registry.migrationDatabaseUrlEnv];
    if (!appUrl || !migrationUrl) throw new Error("Caphub Registry environment references are unavailable");
    const appConnection = connection.parseRegistryConnection({
      databaseUrl: appUrl,
      mode: registry.connectionMode,
      role: "application",
      resolvedHome: resolved.homeDir
    });
    const migrationConnection = connection.parseRegistryConnection({
      databaseUrl: migrationUrl,
      mode: registry.connectionMode,
      role: "migration",
      resolvedHome: resolved.homeDir
    });
    const shared = {
      max: registry.maxConnections,
      statement_timeout: registry.statementTimeoutMs,
      idleTimeoutMillis: 30_000
    };
    const appPool = new Pool({ ...appConnection, ...shared, application_name: "alljobs-caphub-registry-check" });
    const migrationPool = new Pool({
      ...migrationConnection,
      ...shared,
      application_name: "alljobs-caphub-registry-migration"
    });
    try {
      return await operation({
        appPool,
        migrationPool,
        connectionMode: registry.connectionMode,
        expectedSocketDir: appConnection.host
      });
    } finally {
      await Promise.allSettled([appPool.end(), migrationPool.end()]);
    }
  };

  return {
    check: () => withPools((input) => operations.checkRegistryReadiness(input)),
    bootstrap: async () => operations.bootstrapLocalRegistry({ resolvedHome: loadResolved().homeDir }),
    migrate: () => withPools(({ migrationPool }) => operations.migrateRegistry({ migrationPool }))
  };
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  loadDependencies: () => Promise<CaphubPostgresDependencies> = loadFixedDependencies,
  write: (value: string) => void = (value) => process.stdout.write(value)
): Promise<void> {
  const result = await runCaphubPostgres(args, await loadDependencies());
  write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Caphub PostgreSQL operation failed"}\n`);
    process.exitCode = 1;
  });
}
