import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import type { RegistryReadinessReport } from "../lib/caphub/registry/operations";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BUILD_SHA_PATTERN = /^[a-f0-9]{40,64}$/;
const MIGRATION_ID_PATTERN = /^\d{3}_[a-z][a-z0-9_]*$/;
const GENERATION_ID_PATTERN = /^\d{8}T\d{9}Z-[a-z0-9][a-z0-9-]{3,63}$/;
const SAFE_POSTGRES_VERSION_PATTERN = /^(?:17\.\d+(?:\.\d+)?|unknown|unavailable)$/;
const ZERO_DIGEST = "0".repeat(64);
const TARGETS = ["obsidian", "packageRepository", "codex", "claude", "hermes"] as const;

type LiveCompatibility = "pending" | "passed" | "failed";
type ReadyFor = "PA_B" | "PA_C" | "PA_D" | "S3" | "S4";

export interface ProductionPreflightReport {
  buildSha: string;
  nextVersion: "16.3.3";
  appLoopbackOnly: boolean;
  postgres: RegistryReadinessReport;
  captureImport: { sourceDigest: string; captureCount: number; matchesRegistry: boolean };
  backup: { generationId: string | null; verified: boolean };
  providers: {
    minimaxConfigured: boolean;
    kimiConfigured: boolean;
    kimiLiveCompatibility: LiveCompatibility;
  };
  exports: { masterEnabled: boolean; enabledTargets: string[] };
  readyFor: ReadyFor;
}

export interface ProductionPreflightSnapshot extends Omit<ProductionPreflightReport, "readyFor"> {
  runtime: { registryEnabled: boolean; analysisEnabled: boolean };
  postCutoverVerified?: boolean;
}

export interface ProductionPreflightDependencies {
  collect(): Promise<ProductionPreflightSnapshot>;
}

export class ProductionPreflightError extends Error {
  constructor(readonly code: "PREFLIGHT_READ_ONLY" | "PREFLIGHT_UNSAFE_REPORT" | "PREFLIGHT_TARGETS_ENABLED") {
    super(code);
    this.name = "ProductionPreflightError";
  }
}

function unsafe(): never {
  throw new ProductionPreflightError("PREFLIGHT_UNSAFE_REPORT");
}

function assertBoolean(value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") unsafe();
}

function assertCount(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) unsafe();
}

function assertPostgres(report: RegistryReadinessReport): RegistryReadinessReport {
  if (!SAFE_POSTGRES_VERSION_PATTERN.test(report.postgresVersion)
    || !["local_socket", "tls_verify_full"].includes(report.connectionMode)
    || !["", "unavailable"].includes(report.tcpListenAddresses)
    || report.database !== "caphub"
    || report.appRole !== "caphub_app"
    || report.migratorRole !== "caphub_migrator") unsafe();
  assertBoolean(report.appCanMigrate);
  assertBoolean(report.appCanUpdateAppendOnly);
  assertBoolean(report.ready);
  for (const migration of report.appliedMigrations) {
    if (!MIGRATION_ID_PATTERN.test(migration.id) || !SHA256_PATTERN.test(migration.checksum)) unsafe();
  }
  if (report.pendingMigrations.some((id) => !MIGRATION_ID_PATTERN.test(id))) unsafe();
  return {
    postgresVersion: report.postgresVersion,
    connectionMode: report.connectionMode,
    tcpListenAddresses: report.tcpListenAddresses,
    database: "caphub",
    appRole: "caphub_app",
    migratorRole: "caphub_migrator",
    appliedMigrations: report.appliedMigrations.map(({ id, checksum }) => ({ id, checksum })),
    pendingMigrations: [...report.pendingMigrations],
    appCanMigrate: report.appCanMigrate,
    appCanUpdateAppendOnly: report.appCanUpdateAppendOnly,
    ready: report.ready
  };
}

function deriveReadyFor(snapshot: ProductionPreflightSnapshot): ReadyFor {
  if (!snapshot.postgres.ready) return "PA_B";
  if (!snapshot.captureImport.matchesRegistry || !snapshot.backup.verified) return "PA_B";
  if (!snapshot.postCutoverVerified) return "PA_D";
  if (!snapshot.runtime.registryEnabled || snapshot.runtime.analysisEnabled) return "PA_D";
  if (snapshot.providers.kimiLiveCompatibility === "pending") return "PA_C";
  if (snapshot.providers.kimiLiveCompatibility === "failed") return "S3";
  return "S4";
}

export function createProductionPreflightReport(snapshot: ProductionPreflightSnapshot): ProductionPreflightReport {
  if (!BUILD_SHA_PATTERN.test(snapshot.buildSha) || snapshot.nextVersion !== "16.3.3") unsafe();
  assertBoolean(snapshot.appLoopbackOnly);
  if (!SHA256_PATTERN.test(snapshot.captureImport.sourceDigest)) unsafe();
  assertCount(snapshot.captureImport.captureCount);
  assertBoolean(snapshot.captureImport.matchesRegistry);
  if (snapshot.backup.generationId !== null && !GENERATION_ID_PATTERN.test(snapshot.backup.generationId)) unsafe();
  assertBoolean(snapshot.backup.verified);
  assertBoolean(snapshot.providers.minimaxConfigured);
  assertBoolean(snapshot.providers.kimiConfigured);
  if (!["pending", "passed", "failed"].includes(snapshot.providers.kimiLiveCompatibility)) unsafe();
  assertBoolean(snapshot.exports.masterEnabled);
  if (snapshot.exports.enabledTargets.length > 0) {
    throw new ProductionPreflightError("PREFLIGHT_TARGETS_ENABLED");
  }
  assertBoolean(snapshot.runtime.registryEnabled);
  assertBoolean(snapshot.runtime.analysisEnabled);
  if (snapshot.postCutoverVerified !== undefined) assertBoolean(snapshot.postCutoverVerified);

  const report: ProductionPreflightReport = {
    buildSha: snapshot.buildSha,
    nextVersion: "16.3.3",
    appLoopbackOnly: snapshot.appLoopbackOnly,
    postgres: assertPostgres(snapshot.postgres),
    captureImport: {
      sourceDigest: snapshot.captureImport.sourceDigest,
      captureCount: snapshot.captureImport.captureCount,
      matchesRegistry: snapshot.captureImport.matchesRegistry
    },
    backup: { generationId: snapshot.backup.generationId, verified: snapshot.backup.verified },
    providers: {
      minimaxConfigured: snapshot.providers.minimaxConfigured,
      kimiConfigured: snapshot.providers.kimiConfigured,
      kimiLiveCompatibility: snapshot.providers.kimiLiveCompatibility
    },
    exports: { masterEnabled: snapshot.exports.masterEnabled, enabledTargets: [] },
    readyFor: deriveReadyFor(snapshot)
  };
  return report;
}

function unavailableRegistry(connectionMode: "local_socket" | "tls_verify_full"): RegistryReadinessReport {
  return {
    postgresVersion: "unavailable",
    connectionMode,
    tcpListenAddresses: "unavailable",
    database: "caphub",
    appRole: "caphub_app",
    migratorRole: "caphub_migrator",
    appliedMigrations: [],
    pendingMigrations: ["001_registry", "002_read_models", "003_exports"],
    appCanMigrate: false,
    appCanUpdateAppendOnly: false,
    ready: false
  };
}

function latestBackupGeneration(homeDir: string): string | null {
  const root = join(homeDir, "backups", "caphub");
  if (!existsSync(root)) return null;
  const generations = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && GENERATION_ID_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  return generations.at(-1) ?? null;
}

function configuredTargets(config: {
  obsidian: { enabled: boolean };
  packageRepository: { enabled: boolean };
  targets: { codex: { enabled: boolean }; claude: { enabled: boolean }; hermes: { enabled: boolean } };
}): string[] {
  const values = {
    obsidian: config.obsidian.enabled,
    packageRepository: config.packageRepository.enabled,
    codex: config.targets.codex.enabled,
    claude: config.targets.claude.enabled,
    hermes: config.targets.hermes.enabled
  };
  return TARGETS.filter((target) => values[target]);
}

async function collectRegistry(input: {
  homeDir: string;
  registry: {
    enabled: boolean;
    databaseUrlEnv: string;
    migrationDatabaseUrlEnv: string;
    connectionMode: "local_socket" | "tls_verify_full";
    managedHosts: string[];
    maxConnections: number;
    statementTimeoutMs: number;
  };
  captures: Array<{ capture_id: string; capture_digest: string }>;
}): Promise<{ report: RegistryReadinessReport; matches: boolean }> {
  if (!input.registry.enabled) return { report: unavailableRegistry(input.registry.connectionMode), matches: false };
  const appUrl = process.env[input.registry.databaseUrlEnv];
  const migrationUrl = process.env[input.registry.migrationDatabaseUrlEnv];
  if (!appUrl || !migrationUrl) return { report: unavailableRegistry(input.registry.connectionMode), matches: false };

  let appPool: Pool | undefined;
  let migrationPool: Pool | undefined;
  try {
    const [{ Pool: PgPool }, connection, operations] = await Promise.all([
      import("pg"),
      import("../lib/caphub/registry/connection"),
      import("../lib/caphub/registry/operations")
    ]);
    const appConnection = connection.parseRegistryConnection({
      databaseUrl: appUrl,
      mode: input.registry.connectionMode,
      role: "application",
      resolvedHome: input.homeDir,
      managedHosts: input.registry.managedHosts
    });
    const migrationConnection = connection.parseRegistryConnection({
      databaseUrl: migrationUrl,
      mode: input.registry.connectionMode,
      role: "migration",
      resolvedHome: input.homeDir,
      managedHosts: input.registry.managedHosts
    });
    const shared = {
      max: input.registry.maxConnections,
      statement_timeout: input.registry.statementTimeoutMs,
      idleTimeoutMillis: 30_000
    };
    appPool = new PgPool({ ...appConnection, ...shared, application_name: "alljobs-caphub-preflight" });
    migrationPool = new PgPool({ ...migrationConnection, ...shared, application_name: "alljobs-caphub-preflight-migration" });
    const report = await operations.checkRegistryReadiness({
      appPool,
      migrationPool,
      connectionMode: input.registry.connectionMode,
      expectedSocketDir: appConnection.host
    });
    const rows = await appPool.query<{ record_id: string; payload_digest: string }>(`
      SELECT r.record_id, v.payload_digest
      FROM caphub.registry_records r
      JOIN caphub.registry_versions v
        ON v.record_id = r.record_id AND v.version = r.current_version
      WHERE r.kind = 'capture'
      ORDER BY r.record_id
    `);
    const expected = [...input.captures].sort((left, right) => left.capture_id.localeCompare(right.capture_id));
    const matches = rows.rows.length === expected.length && rows.rows.every((row, index) => (
      row.record_id === expected[index]?.capture_id && row.payload_digest === expected[index]?.capture_digest
    ));
    return { report, matches };
  } catch {
    return { report: unavailableRegistry(input.registry.connectionMode), matches: false };
  } finally {
    await Promise.allSettled([
      appPool?.end() ?? Promise.resolve(),
      migrationPool?.end() ?? Promise.resolve()
    ]);
  }
}

async function collectFixedSnapshot(): Promise<ProductionPreflightSnapshot> {
  const [{ controlHostConfigSchema }, importer] = await Promise.all([
    import("../lib/planning/config"),
    import("../lib/caphub/registry/filesystem-import")
  ]);
  const homeDir = resolve(process.env.ALLJOBS_HOME ?? join(homedir(), ".alljobs"));
  const config = controlHostConfigSchema.parse(JSON.parse(readFileSync(join(homeDir, "config.json"), "utf8")));
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
    dependencies?: { next?: string };
    scripts?: { "start:prod"?: string };
  };
  const buildSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const startCommand = packageJson.scripts?.["start:prod"] ?? "";
  const appLoopbackOnly = /(?:^|\s)-H\s+127\.0\.0\.1(?:\s|$)/.test(startCommand)
    && !startCommand.includes("0.0.0.0");
  const caphubStateDir = join(homeDir, "state", "caphub");
  let sourceDigest = ZERO_DIGEST;
  let captureCount = 0;
  let captures: Array<{ capture_id: string; capture_digest: string }> = [];
  if (existsSync(caphubStateDir)) {
    const manifest = await importer.planFilesystemCaptureImport({ root: caphubStateDir });
    sourceDigest = manifest.source_digest;
    captureCount = manifest.counts.captures;
    captures = manifest.captures.map(({ capture_id, capture_digest }) => ({ capture_id, capture_digest }));
  }
  const caphub = config.caphub;
  const registry = caphub?.registry ?? {
    enabled: false,
    databaseUrlEnv: "CAPHUB_DATABASE_URL",
    migrationDatabaseUrlEnv: "CAPHUB_MIGRATION_DATABASE_URL",
    connectionMode: "tls_verify_full" as const,
    managedHosts: ["registry.example.test"],
    maxConnections: 4,
    statementTimeoutMs: 5_000
  };
  const registryState = await collectRegistry({ homeDir, registry, captures });
  const exportsConfig = caphub?.exports;
  const enabledTargets = exportsConfig ? configuredTargets(exportsConfig) : [];
  const miniMaxEnv = caphub?.analysis.miniMaxSecretEnv ?? "MINIMAX_API_KEY";
  const kimiEnv = caphub?.analysis.kimiApiSecretEnv ?? "KIMI_CODE_API_KEY";

  return {
    buildSha,
    nextVersion: packageJson.dependencies?.next as "16.3.3",
    appLoopbackOnly,
    postgres: registryState.report,
    captureImport: { sourceDigest, captureCount, matchesRegistry: registryState.matches },
    backup: { generationId: latestBackupGeneration(homeDir), verified: false },
    providers: {
      minimaxConfigured: Boolean(process.env[miniMaxEnv]),
      kimiConfigured: Boolean(process.env[kimiEnv]),
      kimiLiveCompatibility: "pending"
    },
    exports: { masterEnabled: Boolean(caphub?.enabled && registry.enabled && exportsConfig?.enabled), enabledTargets },
    runtime: {
      registryEnabled: Boolean(caphub?.enabled && registry.enabled),
      analysisEnabled: Boolean(caphub?.enabled && registry.enabled && caphub?.analysis.enabled)
    },
    postCutoverVerified: false
  };
}

export async function runProductionPreflight(
  args: readonly string[],
  dependencies: ProductionPreflightDependencies,
  write: (value: string) => void
): Promise<ProductionPreflightReport> {
  if (args.length !== 0) throw new ProductionPreflightError("PREFLIGHT_READ_ONLY");
  const report = createProductionPreflightReport(await dependencies.collect());
  write(`${JSON.stringify(report)}\n`);
  return report;
}

export async function main(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  await runProductionPreflight(args, { collect: collectFixedSnapshot }, (value) => process.stdout.write(value));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    const code = error instanceof ProductionPreflightError ? error.code : "PREFLIGHT_UNAVAILABLE";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
