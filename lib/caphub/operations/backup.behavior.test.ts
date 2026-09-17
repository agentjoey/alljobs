import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import type { ParsedRegistryConnection } from "../registry/connection";
import { applyRegistryMigrations } from "../registry/migrate";
import { resolvePostgres17Binary } from "../registry/operations";
import { PostgresCaptureAuditLog, PostgresCaptureStore } from "../registry/postgres/caphub-stores";
import { captureReceivedEventId } from "../storage/audit-log";
import type { CaptureRecord } from "../storage/contracts";
import { createCaphubBackup, startTemporaryRestorePostgres, verifyCaphubBackup } from "./backup";

const execFileAsync = promisify(execFile);

describe.sequential("Caphub backup and isolated restore boundary", () => {
  let postgres: CaphubTestPostgres;
  let fixtureRoot: string;
  let home: string;
  let state: string;
  let connection: ParsedRegistryConnection;

  beforeAll(async () => {
    postgres = await startCaphubTestPostgres();
    await applyRegistryMigrations(postgres.pool);
    fixtureRoot = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "caphub-backup-behavior-")));
    chmodSync(fixtureRoot, 0o700);
    home = join(fixtureRoot, "home");
    state = join(home, "state", "caphub");
    mkdirSync(state, { recursive: true, mode: 0o700 });
    for (const path of [home, join(home, "state"), state]) chmodSync(path, 0o700);
    writeFileSync(join(state, "source.txt"), "filesystem-state\n", { mode: 0o600 });

    const capture: CaptureRecord = {
      schema_version: 1,
      id: `cap_${"a".repeat(32)}`,
      source: { kind: "web", original_filename: "backup.png" },
      note: "backup behavior",
      mime_type: "image/png",
      object: {
        algorithm: "sha256",
        digest: "b".repeat(64),
        key: `sha256/bb/${"b".repeat(64)}`,
        bytes: 10
      },
      idempotency_key: "capture.request-20260917:backup",
      status: "received",
      human_review_required: true,
      created_at: "2026-09-17T16:00:00.000Z"
    };
    await new PostgresCaptureStore(postgres.pool).create(capture);
    await new PostgresCaptureAuditLog(postgres.pool).ensure({
      schema_version: 1,
      event_id: captureReceivedEventId(capture.id),
      capture_id: capture.id,
      type: "capture.received",
      actor: "web:user",
      occurred_at: capture.created_at,
      object_digest: capture.object.digest
    });
    connection = {
      host: postgres.socketDir,
      port: postgres.port,
      database: "caphub",
      user: "caphub_migrator",
      ssl: false
    };
  }, 30_000);

  afterAll(async () => {
    await postgres?.stop();
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  }, 30_000);

  it("creates a real custom-format dump and restores it into a new owned cluster", async () => {
    const pgDump = await resolvePostgres17Binary("pg_dump");
    const manifest = await createCaphubBackup({
      resolvedHome: home,
      stateRoot: state,
      migrationConnection: connection,
      clock: () => new Date("2026-09-17T16:30:00.000Z"),
      generationId: "20260917T163000000Z-behavior",
      runPgDump: async (args) => {
        const rewritten = [...args];
        rewritten[rewritten.indexOf("caphub_migrator")] = "caphub_test";
        rewritten[rewritten.indexOf("caphub")] = "postgres";
        await execFileAsync(pgDump, rewritten, { timeout: 120_000, maxBuffer: 1_048_576 });
      },
      queryRegistrySnapshot: async () => {
        const [counts, migrations] = await Promise.all([
          postgres.pool.query<{ capture: string; audit_events: string }>(`
            SELECT
              (SELECT count(*) FROM caphub.registry_records WHERE kind = 'capture')::text AS capture,
              (SELECT count(*) FROM caphub.audit_events)::text AS audit_events
          `),
          postgres.pool.query<{ id: string; checksum: string }>(
            "SELECT version AS id, checksum FROM caphub.schema_migrations ORDER BY version"
          )
        ]);
        return {
          counts: {
            capture: Number(counts.rows[0]?.capture ?? 0),
            audit_events: Number(counts.rows[0]?.audit_events ?? 0),
            registry_lineage: 0,
            review_requests: 0,
            review_decisions: 0
          },
          migrations: migrations.rows
        };
      }
    });
    expect(manifest.database_dump_bytes).toBeGreaterThan(0);
    expect(manifest.registry_counts.capture).toBe(1);
    await expect(verifyCaphubBackup({
      resolvedHome: home,
      generationId: manifest.generation_id,
      startTemporaryPostgres: startTemporaryRestorePostgres
    })).resolves.toEqual(manifest);
  }, 60_000);
});
