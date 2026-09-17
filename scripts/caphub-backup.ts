import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GENERATION_PATTERN = /^\d{8}T\d{9}Z-[a-z0-9][a-z0-9-]{3,63}$/;

export type CaphubBackupCommand =
  | { action: "create" }
  | { action: "verify"; generationId: string };

export interface CaphubBackupDependencies {
  create(): Promise<unknown>;
  verify(generationId: string): Promise<unknown>;
}

export function parseCaphubBackupArgs(args: readonly string[]): CaphubBackupCommand {
  if (args.length === 1 && args[0] === "--create") return { action: "create" };
  if (args.length === 2 && args[0] === "--verify" && GENERATION_PATTERN.test(args[1] ?? "")) {
    return { action: "verify", generationId: args[1] as string };
  }
  throw new Error("Usage: caphub:backup --create | --verify GENERATION_ID");
}

export async function runCaphubBackup(
  args: readonly string[],
  dependencies: CaphubBackupDependencies
): Promise<unknown> {
  const command = parseCaphubBackupArgs(args);
  return command.action === "create"
    ? dependencies.create()
    : dependencies.verify(command.generationId);
}

async function loadFixedDependencies(): Promise<CaphubBackupDependencies> {
  const [{ loadControlHostConfig }, connection, operations, backup] = await Promise.all([
    import("../lib/planning/config"),
    import("../lib/caphub/registry/connection"),
    import("../lib/caphub/registry/operations"),
    import("../lib/caphub/operations/backup")
  ]);
  const resolved = loadControlHostConfig();
  const registry = resolved.config.caphub?.registry;
  if (!registry) throw new Error("Caphub Registry configuration is unavailable");
  const databaseUrl = process.env[registry.migrationDatabaseUrlEnv];
  if (!databaseUrl) throw new Error("Caphub migration database environment reference is unavailable");
  const migrationConnection = connection.parseRegistryConnection({
    databaseUrl,
    mode: registry.connectionMode,
    role: "migration",
    resolvedHome: resolved.homeDir
  });
  return {
    create: async () => {
      const pgDump = await operations.resolvePostgres17Binary("pg_dump");
      return backup.createCaphubBackup({
        resolvedHome: resolved.homeDir,
        stateRoot: resolved.caphubStateDir as string,
        migrationConnection,
        clock: () => new Date(),
        runPgDump: async (args) => {
          await execFileAsync(pgDump, [...args], {
            timeout: 120_000,
            maxBuffer: 1_048_576,
            env: migrationConnection.password
              ? { ...process.env, PGPASSWORD: migrationConnection.password }
              : process.env
          });
        }
      });
    },
    verify: (generationId) => backup.verifyCaphubBackup({
      resolvedHome: resolved.homeDir,
      generationId,
      startTemporaryPostgres: backup.startTemporaryRestorePostgres
    })
  };
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  loadDependencies: () => Promise<CaphubBackupDependencies> = loadFixedDependencies,
  write: (value: string) => void = (value) => process.stdout.write(value)
): Promise<void> {
  const result = await runCaphubBackup(args, await loadDependencies());
  write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Caphub backup operation failed"}\n`);
    process.exitCode = 1;
  });
}
