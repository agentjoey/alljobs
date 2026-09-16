import { Pool, type PoolClient, type QueryResult } from "pg";
import {
  registryMigrationManifest,
  sha256MigrationSql,
  type RegistryMigration
} from "./migration-manifest";

interface MigrationQueryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<R>>;
}

export interface ApplyRegistryMigrationsOptions {
  migrations?: readonly RegistryMigration[];
}

function validateManifest(migrations: readonly RegistryMigration[]): void {
  const ids = new Set<string>();
  let previous = "";
  for (const migration of migrations) {
    if (!/^\d{3}_[a-z][a-z0-9_]*$/.test(migration.id)) {
      throw new Error(`invalid Registry migration ID: ${migration.id}`);
    }
    if (ids.has(migration.id) || migration.id <= previous) {
      throw new Error(`Registry migrations must have unique ascending IDs: ${migration.id}`);
    }
    if (sha256MigrationSql(migration.sql) !== migration.checksum) {
      throw new Error(`Registry migration checksum mismatch: ${migration.filename}`);
    }
    ids.add(migration.id);
    previous = migration.id;
  }
}

async function acquireClient(database: Pool | PoolClient): Promise<{
  client: MigrationQueryable;
  release: () => void;
}> {
  if (database instanceof Pool) {
    const client = await database.connect();
    return { client, release: () => client.release() };
  }
  return { client: database, release: () => undefined };
}

export async function applyRegistryMigrations(
  database: Pool | PoolClient,
  options: ApplyRegistryMigrationsOptions = {}
): Promise<{ applied: string[] }> {
  const migrations = options.migrations ?? registryMigrationManifest;
  validateManifest(migrations);
  const { client, release } = await acquireClient(database);
  const applied: string[] = [];

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('caphub.registry.migrations'))");
    await client.query("CREATE SCHEMA IF NOT EXISTS caphub");
    await client.query(`
      CREATE TABLE IF NOT EXISTS caphub.schema_migrations (
        version text PRIMARY KEY,
        checksum character(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);

    const ledger = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM caphub.schema_migrations ORDER BY version FOR UPDATE"
    );
    const expectedById = new Map(migrations.map((migration) => [migration.id, migration]));
    const appliedById = new Map(ledger.rows.map((row) => [row.version, row.checksum]));

    for (const row of ledger.rows) {
      const expected = expectedById.get(row.version);
      if (!expected) throw new Error(`unknown applied Registry migration: ${row.version}`);
      if (row.checksum !== expected.checksum) {
        throw new Error(`applied Registry migration checksum mismatch: ${row.version}`);
      }
    }

    for (const migration of migrations) {
      if (appliedById.has(migration.id)) continue;
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO caphub.schema_migrations (version, checksum) VALUES ($1, $2)",
        [migration.id, migration.checksum]
      );
      applied.push(migration.id);
    }

    await client.query("COMMIT");
    return { applied };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the migration error; the client is discarded by its pool if needed.
    }
    throw error;
  } finally {
    release();
  }
}
