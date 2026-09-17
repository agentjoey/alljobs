import "server-only";

import { execFile } from "node:child_process";
import {
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { access } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Pool } from "pg";
import type { RegistryConnectionMode } from "./connection";
import { registryMigrationManifest } from "./migration-manifest";
import { applyRegistryMigrations } from "./migrate";

const execFileAsync = promisify(execFile);
const UNSAFE_DIRECTORY_WRITE_BITS = 0o022;
const LOCAL_REGISTRY_PORT = 54_329;
const APPEND_ONLY_TABLES = [
  "schema_migrations",
  "registry_versions",
  "lineage_nodes",
  "registry_lineage",
  "capture_idempotency",
  "registry_imports",
  "review_decisions",
  "decision_consumers",
  "audit_events"
] as const;

export interface RegistryReadinessReport {
  postgresVersion: string;
  connectionMode: RegistryConnectionMode;
  tcpListenAddresses: string;
  database: "caphub";
  appRole: "caphub_app";
  migratorRole: "caphub_migrator";
  appliedMigrations: Array<{ id: string; checksum: string }>;
  pendingMigrations: string[];
  appCanMigrate: boolean;
  appCanUpdateAppendOnly: boolean;
  ready: boolean;
}

function assertPrivateOwnedCanonicalDirectory(path: string): void {
  const metadata = lstatSync(path);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== currentUid
    || (metadata.mode & UNSAFE_DIRECTORY_WRITE_BITS) !== 0 || realpathSync(path) !== path) {
    throw new Error("Registry bootstrap directories must be private owned canonical directories, not symlinks");
  }
}

function ensurePrivateDirectory(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  assertPrivateOwnedCanonicalDirectory(path);
}

function ensureEmptyBootstrapTarget(path: string): void {
  ensurePrivateDirectory(path);
  if (readdirSync(path).length !== 0) {
    throw new Error("Registry bootstrap target must be empty");
  }
}

export function prepareRegistryBootstrapDirectories(resolvedHome: string): {
  dataDir: string;
  socketDir: string;
  port: 54_329;
} {
  assertPrivateOwnedCanonicalDirectory(resolvedHome);
  const postgresRoot = join(resolvedHome, "postgres");
  const runRoot = join(resolvedHome, "run");
  ensurePrivateDirectory(postgresRoot);
  ensurePrivateDirectory(runRoot);
  const dataDir = join(postgresRoot, "caphub");
  const socketDir = join(runRoot, "caphub-postgres");
  ensureEmptyBootstrapTarget(dataDir);
  ensureEmptyBootstrapTarget(socketDir);
  return { dataDir, socketDir, port: LOCAL_REGISTRY_PORT };
}

async function queryBoolean(pool: Pool, sql: string): Promise<boolean> {
  try {
    const result = await pool.query<{ allowed: boolean }>(sql);
    return result.rows[0]?.allowed === true;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01" || (error as { code?: string }).code === "3F000") {
      return false;
    }
    throw error;
  }
}

async function readMigrationLedger(pool: Pool): Promise<Array<{ id: string; checksum: string }>> {
  try {
    const result = await pool.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM caphub.schema_migrations ORDER BY version"
    );
    return result.rows.map(({ version, checksum }) => ({ id: version, checksum }));
  } catch (error) {
    if ((error as { code?: string }).code === "42P01" || (error as { code?: string }).code === "3F000") return [];
    throw error;
  }
}

export async function migrateRegistry(input: { migrationPool: Pool }): Promise<{ applied: string[] }> {
  const identity = await input.migrationPool.query<{ user_name: string; database_name: string }>(
    "SELECT current_user AS user_name, current_database() AS database_name"
  );
  if (identity.rows[0]?.user_name !== "caphub_migrator" || identity.rows[0]?.database_name !== "caphub") {
    throw new Error("Registry migrations require caphub_migrator on database caphub");
  }
  return applyRegistryMigrations(input.migrationPool);
}

export async function checkRegistryReadiness(input: {
  appPool: Pool;
  migrationPool: Pool;
  connectionMode: RegistryConnectionMode;
  expectedSocketDir: string;
}): Promise<RegistryReadinessReport> {
  const [version, listen, transport, appIdentity, migratorIdentity, roles, databaseOwner, membership, ledger] = await Promise.all([
    input.migrationPool.query<{ server_version: string }>("SHOW server_version"),
    input.migrationPool.query<{ listen_addresses: string }>("SHOW listen_addresses"),
    input.migrationPool.query<{ unix_socket: boolean }>("SELECT inet_server_addr() IS NULL AS unix_socket"),
    input.appPool.query<{ user_name: string; database_name: string }>(
      "SELECT current_user AS user_name, current_database() AS database_name"
    ),
    input.migrationPool.query<{ user_name: string; database_name: string }>(
      "SELECT current_user AS user_name, current_database() AS database_name"
    ),
    input.migrationPool.query<{
      rolname: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolinherit: boolean;
      rolcanlogin: boolean;
    }>(
      `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin
       FROM pg_roles WHERE rolname IN ('caphub_app', 'caphub_migrator') ORDER BY rolname`
    ),
    input.migrationPool.query<{ owner: string }>(
      "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = 'caphub'"
    ),
    input.migrationPool.query<{ app_is_migrator: boolean; migrator_is_app: boolean }>(
      `SELECT
         pg_has_role('caphub_app', 'caphub_migrator', 'member') AS app_is_migrator,
         pg_has_role('caphub_migrator', 'caphub_app', 'member') AS migrator_is_app`
    ),
    readMigrationLedger(input.migrationPool)
  ]);

  const [appCanMigrate, appCanUpdateAppendOnly, requiredAppPrivileges, appendOnlyTriggers] = await Promise.all([
    queryBoolean(input.appPool, `
      SELECT has_schema_privilege(current_user, 'caphub', 'CREATE')
        OR has_table_privilege(current_user, 'caphub.schema_migrations', 'INSERT')
        OR has_table_privilege(current_user, 'caphub.schema_migrations', 'UPDATE')
        OR has_table_privilege(current_user, 'caphub.schema_migrations', 'DELETE') AS allowed
    `),
    queryBoolean(input.appPool, `
      SELECT ${APPEND_ONLY_TABLES
        .map((table) => `has_table_privilege(current_user, 'caphub.${table}', 'UPDATE') OR has_table_privilege(current_user, 'caphub.${table}', 'DELETE')`)
        .join(" OR ")} AS allowed
    `),
    queryBoolean(input.appPool, `
      SELECT has_schema_privilege(current_user, 'caphub', 'USAGE')
        AND has_table_privilege(current_user, 'caphub.registry_records', 'SELECT')
        AND has_table_privilege(current_user, 'caphub.registry_records', 'INSERT')
        AND has_column_privilege(current_user, 'caphub.registry_records', 'current_version', 'UPDATE')
        AND has_table_privilege(current_user, 'caphub.registry_versions', 'INSERT')
        AND has_table_privilege(current_user, 'caphub.review_requests', 'INSERT')
        AND has_column_privilege(current_user, 'caphub.review_requests', 'state', 'UPDATE') AS allowed
    `),
    input.migrationPool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM pg_trigger AS inspected_trigger
      JOIN pg_class AS relation ON relation.oid = inspected_trigger.tgrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'caphub'
        AND NOT inspected_trigger.tgisinternal AND inspected_trigger.tgenabled = 'O'
        AND tgname IN (${APPEND_ONLY_TABLES.map((_, index) => `$${index + 1}`).join(", ")})
    `, APPEND_ONLY_TABLES.map((table) => `${table}_append_only`)).catch((error: { code?: string }) => {
      if (error.code === "42P01" || error.code === "3F000") return { rows: [{ count: "0" }] };
      throw error;
    })
  ]);

  const expectedMigrations = new Map(registryMigrationManifest.map(({ id, checksum }) => [id, checksum]));
  const appliedExact = ledger.length === registryMigrationManifest.length
    && ledger.every(({ id, checksum }) => expectedMigrations.get(id) === checksum);
  const appliedIds = new Set(ledger.filter(({ id, checksum }) => expectedMigrations.get(id) === checksum).map(({ id }) => id));
  const pendingMigrations = registryMigrationManifest.filter(({ id }) => !appliedIds.has(id)).map(({ id }) => id);
  const exactRoles = roles.rows.length === 2 && roles.rows.every((role) => role.rolcanlogin
    && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole && !role.rolinherit);
  const exactIdentities = appIdentity.rows[0]?.user_name === "caphub_app"
    && appIdentity.rows[0]?.database_name === "caphub"
    && migratorIdentity.rows[0]?.user_name === "caphub_migrator"
    && migratorIdentity.rows[0]?.database_name === "caphub";
  const noRoleInheritance = membership.rows[0]?.app_is_migrator === false
    && membership.rows[0]?.migrator_is_app === false;
  const tcpListenAddresses = listen.rows[0]?.listen_addresses ?? "";
  const transportReady = input.connectionMode === "local_socket"
    ? tcpListenAddresses === "" && transport.rows[0]?.unix_socket === true
      && input.appPool.options.host === input.expectedSocketDir
      && input.migrationPool.options.host === input.expectedSocketDir
    : true;
  const ready = (version.rows[0]?.server_version ?? "").startsWith("17.")
    && transportReady && exactIdentities && exactRoles && noRoleInheritance
    && databaseOwner.rows[0]?.owner === "caphub_migrator"
    && appliedExact && pendingMigrations.length === 0
    && !appCanMigrate && !appCanUpdateAppendOnly && requiredAppPrivileges
    && Number(appendOnlyTriggers.rows[0]?.count ?? 0) === APPEND_ONLY_TABLES.length;

  return {
    postgresVersion: version.rows[0]?.server_version ?? "unknown",
    connectionMode: input.connectionMode,
    tcpListenAddresses,
    database: "caphub",
    appRole: "caphub_app",
    migratorRole: "caphub_migrator",
    appliedMigrations: ledger,
    pendingMigrations,
    appCanMigrate,
    appCanUpdateAppendOnly,
    ready
  };
}

export async function resolvePostgres17Binary(name: "initdb" | "pg_ctl" | "postgres" | "psql" | "createdb" | "pg_dump" | "pg_restore"): Promise<string> {
  const candidates = [
    `/opt/homebrew/opt/postgresql@17/bin/${name}`,
    `/usr/local/opt/postgresql@17/bin/${name}`
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue to the other fixed PostgreSQL 17 installation prefix.
    }
  }
  throw new Error(`PostgreSQL 17 binary is unavailable: ${name}`);
}

export async function runPostgres17(file: string, args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(file, [...args], { timeout: 30_000, maxBuffer: 1_048_576 });
}

export interface BootstrapLocalRegistryOptions {
  resolvedHome: string;
  controlHostUser?: string;
  run?: (file: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;
}

export async function bootstrapLocalRegistry(
  input: BootstrapLocalRegistryOptions
): Promise<{
  initialized: true;
  database: "caphub";
  roles: ["caphub_app", "caphub_migrator"];
  port: 54_329;
  serviceRunning: false;
}> {
  const paths = prepareRegistryBootstrapDirectories(input.resolvedHome);
  const controlHostUser = input.controlHostUser ?? userInfo().username;
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(controlHostUser)
    || paths.dataDir.includes("'") || paths.socketDir.includes("'")) {
    throw new Error("Control Host identity or Registry path cannot be represented safely");
  }
  const logsDir = join(input.resolvedHome, "logs");
  ensurePrivateDirectory(logsDir);
  const logPath = join(logsDir, "caphub-postgres-bootstrap.log");
  const run = input.run ?? runPostgres17;
  const [initdb, pgCtl, psql, createdb] = await Promise.all([
    resolvePostgres17Binary("initdb"),
    resolvePostgres17Binary("pg_ctl"),
    resolvePostgres17Binary("psql"),
    resolvePostgres17Binary("createdb")
  ]);

  await run(initdb, [
    "-D", paths.dataDir,
    "--auth-local=peer",
    "--auth-host=reject",
    "-U", controlHostUser,
    "--no-locale",
    "--encoding=UTF8"
  ]);

  const templateRoot = join(process.cwd(), "deploy", "caphub-postgres");
  const postgresqlConf = readFileSync(join(templateRoot, "postgresql.conf.example"), "utf8")
    .replaceAll("__SOCKET_DIR__", paths.socketDir);
  const pgHbaConf = readFileSync(join(templateRoot, "pg_hba.conf.example"), "utf8")
    .replaceAll("__CONTROL_HOST_USER__", controlHostUser);
  const pgIdentConf = readFileSync(join(templateRoot, "pg_ident.conf.example"), "utf8")
    .replaceAll("__CONTROL_HOST_USER__", controlHostUser);
  for (const [filename, contents] of [
    ["postgresql.conf", postgresqlConf],
    ["pg_hba.conf", pgHbaConf],
    ["pg_ident.conf", pgIdentConf]
  ] as const) {
    const output = join(paths.dataDir, filename);
    writeFileSync(output, contents, { encoding: "utf8", mode: 0o600 });
    chmodSync(output, 0o600);
  }

  let started = false;
  try {
    await run(pgCtl, ["-D", paths.dataDir, "-l", logPath, "-w", "start"]);
    started = true;
    const connectionArgs = [
      "-h", paths.socketDir,
      "-p", String(paths.port),
      "-U", controlHostUser,
      "-d", "postgres",
      "-v", "ON_ERROR_STOP=1"
    ] as const;
    await run(psql, [...connectionArgs, "-c", `
      CREATE ROLE caphub_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      CREATE ROLE caphub_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    `]);
    await run(createdb, [
      "-h", paths.socketDir,
      "-p", String(paths.port),
      "-U", controlHostUser,
      "-O", "caphub_migrator",
      "caphub"
    ]);
    await run(pgCtl, ["-D", paths.dataDir, "-m", "fast", "-w", "stop"]);
    started = false;
  } catch (error) {
    if (started) {
      try {
        await run(pgCtl, ["-D", paths.dataDir, "-m", "fast", "-w", "stop"]);
      } catch {
        // Preserve the primary failure and all partial state for operator inspection.
      }
    }
    throw error;
  }

  return {
    initialized: true,
    database: "caphub",
    roles: ["caphub_app", "caphub_migrator"],
    port: LOCAL_REGISTRY_PORT,
    serviceRunning: false
  };
}
