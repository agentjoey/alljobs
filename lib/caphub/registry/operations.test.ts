import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { registryMigrationManifest } from "./migration-manifest";
import {
  checkRegistryReadiness,
  bootstrapLocalRegistry,
  isSupportedRegistryPostgresVersion,
  migrateRegistry,
  prepareRegistryBootstrapDirectories
} from "./operations";

const tempRoots: string[] = [];
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

function privateHome(): string {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "caphub-operations-")));
  tempRoots.push(root);
  chmodSync(root, 0o700);
  const home = join(root, "home");
  mkdirSync(home, { mode: 0o700 });
  return home;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Registry PostgreSQL compatibility policy", () => {
  it("accepts PostgreSQL 17 locally and PostgreSQL 17 or 18 through managed TLS only", () => {
    expect(isSupportedRegistryPostgresVersion("17.6", "local_socket")).toBe(true);
    expect(isSupportedRegistryPostgresVersion("18.0", "local_socket")).toBe(false);
    expect(isSupportedRegistryPostgresVersion("17.6", "tls_verify_full")).toBe(true);
    expect(isSupportedRegistryPostgresVersion("18.0", "tls_verify_full")).toBe(true);
    expect(isSupportedRegistryPostgresVersion("19.0", "tls_verify_full")).toBe(false);
  });
});

describe("local Registry bootstrap paths", () => {
  it("derives and creates only empty private data and socket directories", () => {
    const home = privateHome();
    expect(prepareRegistryBootstrapDirectories(home)).toEqual({
      dataDir: join(home, "postgres", "caphub"),
      socketDir: join(home, "run", "caphub-postgres"),
      port: 54_329
    });
  });

  it("refuses non-empty, symlinked, and broadly writable targets without deleting contents", () => {
    const nonemptyHome = privateHome();
    const nonemptyData = join(nonemptyHome, "postgres", "caphub");
    mkdirSync(nonemptyData, { recursive: true, mode: 0o700 });
    writeFileSync(join(nonemptyData, "keep.txt"), "keep", { mode: 0o600 });
    expect(() => prepareRegistryBootstrapDirectories(nonemptyHome)).toThrow(/empty/i);
    expect(readFileSync(join(nonemptyData, "keep.txt"), "utf8")).toBe("keep");

    const symlinkHome = privateHome();
    const actual = join(symlinkHome, "actual");
    mkdirSync(actual, { mode: 0o700 });
    mkdirSync(join(symlinkHome, "postgres"), { mode: 0o700 });
    symlinkSync(actual, join(symlinkHome, "postgres", "caphub"));
    expect(() => prepareRegistryBootstrapDirectories(symlinkHome)).toThrow(/symlink|canonical/i);

    const writableHome = privateHome();
    const socket = join(writableHome, "run", "caphub-postgres");
    mkdirSync(socket, { recursive: true, mode: 0o700 });
    chmodSync(socket, 0o770);
    expect(() => prepareRegistryBootstrapDirectories(writableHome)).toThrow(/private/i);
  });

  it("uses only fixed PostgreSQL 17 argument arrays and retains partial state on failure", async () => {
    const home = privateHome();
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    await expect(bootstrapLocalRegistry({
      resolvedHome: home,
      controlHostUser: "control-host-user",
      run: async (file, args) => {
        calls.push({ file, args });
        return { stdout: "", stderr: "" };
      }
    })).resolves.toMatchObject({
      initialized: true,
      database: "caphub",
      port: 54_329,
      serviceRunning: false
    });
    expect(calls.map(({ file }) => file.split("/").at(-1)))
      .toEqual(["initdb", "pg_ctl", "psql", "createdb", "pg_ctl"]);
    expect(calls[0]?.args).toContain("--auth-host=reject");
    expect(calls[1]?.args).toEqual(expect.arrayContaining(["-D", join(home, "postgres", "caphub"), "start"]));
    expect(calls[4]?.args).toEqual([
      "-D", join(home, "postgres", "caphub"), "-m", "fast", "-w", "stop"
    ]);
    expect(readFileSync(join(home, "postgres", "caphub", "postgresql.conf"), "utf8"))
      .toContain("listen_addresses = ''");

    const failedHome = privateHome();
    await expect(bootstrapLocalRegistry({
      resolvedHome: failedHome,
      controlHostUser: "control-host-user",
      run: async (file) => {
        if (file.endsWith("/pg_ctl")) throw new Error("fixture startup failure");
        return { stdout: "", stderr: "" };
      }
    })).rejects.toThrow(/fixture startup failure/);
    expect(readFileSync(join(failedHome, "postgres", "caphub", "postgresql.conf"), "utf8"))
      .toContain("port = 54329");
  });
});

describe.sequential("Registry migration and readiness operations", () => {
  let postgres: CaphubTestPostgres;
  let migrationPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    postgres = await startCaphubTestPostgres();
    await postgres.pool.query(
      "CREATE ROLE caphub_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"
    );
    await postgres.pool.query("CREATE DATABASE caphub OWNER caphub_migrator");
    migrationPool = new Pool({
      host: postgres.socketDir,
      port: postgres.port,
      database: "caphub",
      user: "caphub_migrator",
      ssl: false,
      max: 1
    });
    appPool = new Pool({
      host: postgres.socketDir,
      port: postgres.port,
      database: "caphub",
      user: "caphub_app",
      ssl: false,
      max: 1
    });
  }, 30_000);

  afterAll(async () => {
    await Promise.allSettled([appPool?.end(), migrationPool?.end()]);
    await postgres?.stop();
  }, 30_000);

  it("reports the exact pending checksum-bound manifest before migration", async () => {
    const report = await checkRegistryReadiness({
      appPool,
      migrationPool,
      connectionMode: "local_socket",
      expectedSocketDir: postgres.socketDir
    });
    expect(report.ready).toBe(false);
    expect(report.appliedMigrations).toEqual([]);
    expect(report.pendingMigrations).toEqual(registryMigrationManifest.map(({ id }) => id));
    expect(report.appCanMigrate).toBe(false);
    expect(report.appCanUpdateAppendOnly).toBe(false);
  });

  it("allows migrations only through the fixed migrator identity", async () => {
    await expect(migrateRegistry({ migrationPool: postgres.pool })).rejects.toThrow(/caphub_migrator/i);
    await expect(migrateRegistry({ migrationPool })).resolves.toEqual({
      applied: registryMigrationManifest.map(({ id }) => id)
    });
    await expect(migrateRegistry({ migrationPool })).resolves.toEqual({ applied: [] });
  });

  it("reports PostgreSQL 17, local-only transport, exact roles, checksums, and least privilege", async () => {
    const report = await checkRegistryReadiness({
      appPool,
      migrationPool,
      connectionMode: "local_socket",
      expectedSocketDir: postgres.socketDir
    });
    expect(report).toEqual({
      postgresVersion: expect.stringMatching(/^17\./),
      connectionMode: "local_socket",
      tcpListenAddresses: "",
      database: "caphub",
      appRole: "caphub_app",
      migratorRole: "caphub_migrator",
      appliedMigrations: registryMigrationManifest.map(({ id, checksum }) => ({ id, checksum })),
      pendingMigrations: [],
      appCanMigrate: false,
      appCanUpdateAppendOnly: false,
      databasePrivilegeBoundary: "database_role_least_privilege",
      ready: true
    });
  });

  it("rejects inherited administration in local socket mode", async () => {
    await postgres.pool.query("CREATE ROLE neon_superuser NOLOGIN");
    await postgres.pool.query("ALTER ROLE caphub_app INHERIT");
    await postgres.pool.query("GRANT neon_superuser TO caphub_app");
    await migrationPool.query("GRANT CREATE ON SCHEMA caphub TO neon_superuser");
    await migrationPool.query("GRANT INSERT, UPDATE, DELETE ON caphub.schema_migrations TO neon_superuser");
    await migrationPool.query(
      `GRANT UPDATE, DELETE ON ${APPEND_ONLY_TABLES.map((table) => `caphub.${table}`).join(", ")} TO neon_superuser`
    );
    await appPool.end();
    appPool = new Pool({
      host: postgres.socketDir,
      port: postgres.port,
      database: "caphub",
      user: "caphub_app",
      ssl: false,
      max: 1
    });
    const report = await checkRegistryReadiness({
      appPool,
      migrationPool,
      connectionMode: "local_socket",
      expectedSocketDir: postgres.socketDir
    });

    expect(report).toMatchObject({
      databasePrivilegeBoundary: "database_role_least_privilege",
      appCanMigrate: true,
      appCanUpdateAppendOnly: true,
      ready: false
    });
  });

  it("reports the accepted Neon project-admin boundary for managed TLS", async () => {
    const report = await checkRegistryReadiness({
      appPool,
      migrationPool,
      connectionMode: "tls_verify_full",
      expectedSocketDir: postgres.socketDir
    });

    expect(report).toMatchObject({
      connectionMode: "tls_verify_full",
      tcpListenAddresses: "managed_tls",
      databasePrivilegeBoundary: "neon_project_admin_accepted",
      appCanMigrate: true,
      appCanUpdateAppendOnly: true,
      ready: true
    });
  });
});
