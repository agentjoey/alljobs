import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { registryMigrationManifest, sha256MigrationSql } from "./migration-manifest";
import { applyRegistryMigrations } from "./migrate";

const DIGEST = "a".repeat(64);
const SECOND_DIGEST = "b".repeat(64);
const CANDIDATE_ID = `cand_${"1".repeat(32)}`;
const REQUEST_ID = `rev_${"2".repeat(32)}`;
const DECISION_ID = `dec_${"3".repeat(32)}`;

describe.sequential("Caphub Registry migrations", () => {
  let fixture: CaphubTestPostgres;

  beforeAll(async () => {
    fixture = await startCaphubTestPostgres();
  }, 30_000);

  afterAll(async () => {
    await fixture?.stop();
  }, 30_000);

  it("starts PostgreSQL 17 on a private Unix socket with sentinel ownership", async () => {
    const version = await fixture.pool.query<{ server_version: string }>("SHOW server_version");
    expect(version.rows[0]?.server_version).toMatch(/^17\./);
    expect((await fixture.pool.query<{ listen_addresses: string }>("SHOW listen_addresses")).rows[0]?.listen_addresses)
      .toBe("");
    expect((await fixture.pool.query<{ unix_socket_directories: string }>("SHOW unix_socket_directories")).rows[0]?.unix_socket_directories)
      .toBe(fixture.socketDir);
    expect(fixture.postmasterPid).toBeGreaterThan(1);
    expect(existsSync(fixture.sentinelPath)).toBe(true);
  });

  it("rolls back the entire empty migration when a later statement fails", async () => {
    const rollbackFixture = await startCaphubTestPostgres();
    try {
      const broken = registryMigrationManifest.map((migration, index) => index === 1
        ? { ...migration, sql: `${migration.sql}\nSELECT missing_registry_function();` }
        : migration);
      broken[1] = { ...broken[1], checksum: sha256MigrationSql(broken[1].sql) };
      await expect(applyRegistryMigrations(rollbackFixture.pool, { migrations: broken })).rejects.toThrow();
      const schema = await rollbackFixture.pool.query<{ present: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'caphub') AS present"
      );
      expect(schema.rows[0]?.present).toBe(false);
    } finally {
      await rollbackFixture.stop();
    }
  }, 30_000);

  it("serializes concurrent migration attempts and records each checksum once", async () => {
    const concurrentFixture = await startCaphubTestPostgres();
    try {
      const results = await Promise.all([
        applyRegistryMigrations(concurrentFixture.pool),
        applyRegistryMigrations(concurrentFixture.pool)
      ]);
      expect(results.map(({ applied }) => applied).sort((left, right) => right.length - left.length)).toEqual([
        ["001_registry", "002_read_models", "003_exports"],
        []
      ]);
      const ledger = await concurrentFixture.pool.query<{ version: string }>(
        "SELECT version FROM caphub.schema_migrations ORDER BY version"
      );
      expect(ledger.rows.map(({ version }) => version)).toEqual(["001_registry", "002_read_models", "003_exports"]);
    } finally {
      await concurrentFixture.stop();
    }
  }, 30_000);

  it("applies the checksum-bound manifest once and reruns idempotently", async () => {
    await expect(applyRegistryMigrations(fixture.pool)).resolves.toEqual({
      applied: ["001_registry", "002_read_models", "003_exports"]
    });
    await expect(applyRegistryMigrations(fixture.pool)).resolves.toEqual({ applied: [] });

    const ledger = await fixture.pool.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM caphub.schema_migrations ORDER BY version"
    );
    expect(ledger.rows).toEqual(registryMigrationManifest.map(({ id, checksum }) => ({ version: id, checksum })));
  });

  it("keeps the P3-approved 001 and 002 checksums byte-identical", async () => {
    const byId = new Map(registryMigrationManifest.map((migration) => [migration.id, migration]));
    expect(byId.get("001_registry")?.checksum)
      .toBe("d48b33929743342b2fcfe11726a45653e06c0cc39a84949dcbf1ae9ec80e5fa8");
    expect(byId.get("002_read_models")?.checksum)
      .toBe("fa8fefdef331966fdcb67db911ace73eca2d2f54702028acaa6735de1e8716c7");
    expect(registryMigrationManifest.map((migration) => migration.id))
      .toEqual(["001_registry", "002_read_models", "003_exports"]);
  });

  it("enforces P4 deployment_plan and deployment review constraints at the SQL boundary", async () => {
    const planId = `dpl_${"7".repeat(32)}`;
    const wrongPrefix = `dep_${"7".repeat(32)}`;
    const releaseId = `rel_${"8".repeat(32)}`;
    const deploymentId = `dep_${"9".repeat(32)}`;

    const insertRecordAndVersion = async (recordId: string, kind: string, payload: unknown): Promise<void> => {
      const client = await fixture.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO caphub.registry_records
            (record_id, kind, current_version, created_at, updated_at)
           VALUES ($1, $2, 1, now(), now())`,
          [recordId, kind]
        );
        await client.query(
          `INSERT INTO caphub.registry_versions
            (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
           VALUES ($1, 1, $2, 1, $3::jsonb, $4, NULL, now())`,
          [recordId, kind, JSON.stringify(payload ?? {}), DIGEST]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    };
    await insertRecordAndVersion(releaseId, "release", {});

    await expect(fixture.pool.query(
      `INSERT INTO caphub.registry_records
        (record_id, kind, current_version, created_at, updated_at)
       VALUES ($1, 'deployment_plan', 1, now(), now())`,
      [wrongPrefix]
    )).rejects.toThrow();
    await insertRecordAndVersion(planId, "deployment_plan", { action: "publish" });
    await expect(fixture.pool.query(
      `INSERT INTO caphub.registry_versions
        (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
       VALUES ($1, 2, 'release', 1, '{}'::jsonb, $2, 1, now())`,
      [planId, DIGEST]
    )).rejects.toThrow();

    await expect(fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation,
         superseded_by_request_id, created_at, updated_at)
       VALUES ($1, 'deployment', 'release', $2, 1, $3, 1, 'WAITING_FOR_REVIEW',
         'APPROVE DEPLOYMENT 77777777', 'REJECT DEPLOYMENT 77777777', NULL, now(), now())`,
      [`rev_${"a".repeat(32)}`, planId, DIGEST]
    )).rejects.toThrow();
    await expect(fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation,
         superseded_by_request_id, created_at, updated_at)
       VALUES ($1, 'release', 'deployment_plan', $2, 1, $3, 1, 'WAITING_FOR_REVIEW',
         'APPROVE RELEASE 77777777', 'REJECT RELEASE 77777777', NULL, now(), now())`,
      [`rev_${"b".repeat(32)}`, planId, DIGEST]
    )).rejects.toThrow();
    await fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation,
         superseded_by_request_id, created_at, updated_at)
       VALUES ($1, 'deployment', 'deployment_plan', $2, 1, $3, 1, 'WAITING_FOR_REVIEW',
         'APPROVE DEPLOYMENT 77777777', 'REJECT DEPLOYMENT 77777777', NULL, now(), now())`,
      [`rev_${"c".repeat(32)}`, planId, DIGEST]
    );

    const proposesEdge = `
      INSERT INTO caphub.registry_lineage
        (from_node_id, from_kind, from_version, from_digest, relationship,
         to_node_id, to_kind, to_version, to_digest, created_at)
       VALUES ($1, 'release', 1, $2, 'proposes', $3, 'deployment_plan', 1, $2, now())`;
    await fixture.pool.query(proposesEdge, [releaseId, DIGEST, planId]);
    await expect(fixture.pool.query(
      proposesEdge.replace("'proposes'", "'contains'"),
      [releaseId, DIGEST, planId]
    )).rejects.toThrow();
    await expect(fixture.pool.query(
      proposesEdge.replace("'deployment_plan'", "'release'"),
      [releaseId, DIGEST, planId]
    )).rejects.toThrow();

    await insertRecordAndVersion(deploymentId, "deployment", {});
    await fixture.pool.query(
      `INSERT INTO caphub.registry_lineage
        (from_node_id, from_kind, from_version, from_digest, relationship,
         to_node_id, to_kind, to_version, to_digest, created_at)
       VALUES ($1, 'deployment_plan', 1, $2, 'realized_as', $3, 'deployment', 1, $2, now())`,
      [planId, DIGEST, deploymentId]
    );
    await expect(fixture.pool.query(
      `UPDATE caphub.registry_versions SET payload = '{"action":"rollback"}'::jsonb
       WHERE record_id = $1`,
      [planId]
    )).rejects.toMatchObject({ code: "55000", message: expect.stringMatching(/append-only/i) });
  });

  it("rejects edited migration content before writing", async () => {
    const tampered = registryMigrationManifest.map((migration, index) => index === 0
      ? { ...migration, sql: `${migration.sql}\n-- edited after approval` }
      : migration);
    await expect(applyRegistryMigrations(fixture.pool, { migrations: tampered })).rejects.toThrow(/checksum/i);
    const ledger = await fixture.pool.query<{ count: string }>("SELECT count(*) FROM caphub.schema_migrations");
    expect(ledger.rows[0]?.count).toBe("3");
  });

  it("enforces append-only versions, lineage, decisions, consumers, imports, and audits", async () => {
    const client = await fixture.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO caphub.registry_records
          (record_id, kind, current_version, created_at, updated_at)
         VALUES ($1, 'candidate', 1, now(), now())`,
        [CANDIDATE_ID]
      );
      await client.query(
        `INSERT INTO caphub.registry_versions
          (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
         VALUES ($1, 1, 'candidate', 1, '{}'::jsonb, $2, NULL, now())`,
        [CANDIDATE_ID, DIGEST]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation,
         superseded_by_request_id, created_at, updated_at)
       VALUES ($1, 'candidate', 'candidate', $2, 1, $3, 1, 'WAITING_FOR_REVIEW',
         'APPROVE CANDIDATE 11111111', 'REJECT CANDIDATE 11111111', NULL, now(), now())`,
      [REQUEST_ID, CANDIDATE_ID, DIGEST]
    );
    await fixture.pool.query(
      `INSERT INTO caphub.review_decisions
        (decision_id, request_id, idempotency_key, expected_lock_version, expected_subject_digest,
         action, confirmation, rationale, disposition, review_kind, subject_id, subject_version,
         subject_digest, actor, confirmation_digest, original_approval_decision_id,
         revokes_decision_id, recorded_at)
       VALUES ($1, $2, 'intent-approved-0001', 1, $3, 'approve',
         'APPROVE CANDIDATE 11111111', '', 'build', 'candidate', $4, 1, $3,
         'human:owner', $5, NULL, NULL, now())`,
      [DECISION_ID, REQUEST_ID, DIGEST, CANDIDATE_ID, SECOND_DIGEST]
    );

    const reviewLineage = {
      text: `INSERT INTO caphub.registry_lineage
        (from_node_id, from_kind, from_version, from_digest, relationship,
         to_node_id, to_kind, to_version, to_digest, created_at)
       VALUES ($1, 'review_request', 1, $2, $3, $4, 'review_decision', 1, $5, now())`,
      values: [REQUEST_ID, DIGEST, "decided_by", DECISION_ID, SECOND_DIGEST]
    };
    await expect(fixture.pool.query({
      ...reviewLineage,
      values: [REQUEST_ID, SECOND_DIGEST, "decided_by", DECISION_ID, SECOND_DIGEST]
    })).rejects.toThrow();
    await expect(fixture.pool.query({
      ...reviewLineage,
      values: [REQUEST_ID, DIGEST, "contains", DECISION_ID, SECOND_DIGEST]
    })).rejects.toThrow();
    await fixture.pool.query(reviewLineage);

    await expect(fixture.pool.query(
      "UPDATE caphub.registry_versions SET payload_digest = $1 WHERE record_id = $2",
      [SECOND_DIGEST, CANDIDATE_ID]
    )).rejects.toMatchObject({ code: "55000", message: expect.stringMatching(/append-only/i) });
    await expect(fixture.pool.query(
      "DELETE FROM caphub.review_decisions WHERE decision_id = $1",
      [DECISION_ID]
    )).rejects.toMatchObject({ code: "55000", message: expect.stringMatching(/append-only/i) });
    await expect(fixture.pool.query(
      "UPDATE caphub.registry_lineage SET created_at = now() WHERE from_node_id = $1",
      [REQUEST_ID]
    )).rejects.toThrow(/append-only/i);

    const immutableTables = await fixture.pool.query<{ table_name: string }>(`
      SELECT event_object_table AS table_name
      FROM information_schema.triggers
      WHERE trigger_schema = 'caphub' AND trigger_name LIKE '%append_only'
      ORDER BY event_object_table
    `);
    expect(new Set(immutableTables.rows.map(({ table_name }) => table_name))).toEqual(new Set([
      "audit_events",
      "capture_idempotency",
      "decision_consumers",
      "lineage_nodes",
      "registry_imports",
      "registry_lineage",
      "registry_versions",
      "review_decisions",
      "schema_migrations"
    ]));
  });

  it("gives the app role bounded data access but no schema, extension, or role authority", async () => {
    await expect(fixture.appPool.query("SELECT count(*) FROM caphub.registry_records")).resolves.toBeDefined();
    await expect(fixture.appPool.query(
      `INSERT INTO caphub.lineage_nodes
        (node_id, node_kind, node_version, node_digest, created_at)
       VALUES ($1, 'candidate', 1, $2, now())`,
      [`cand_${"9".repeat(32)}`, DIGEST]
    )).rejects.toThrow();
    await expect(fixture.appPool.query(
      "UPDATE caphub.registry_records SET created_at = created_at WHERE record_id = $1",
      [CANDIDATE_ID]
    )).rejects.toThrow();
    await expect(fixture.appPool.query("CREATE SCHEMA forbidden_app_schema")).rejects.toThrow();
    await expect(fixture.appPool.query("CREATE EXTENSION IF NOT EXISTS hstore")).rejects.toThrow();
    await expect(fixture.appPool.query("CREATE ROLE forbidden_app_role")).rejects.toThrow();
  });

  it("uses only RESTRICT foreign keys, no cascading deletion, and non-updatable read views", async () => {
    const foreignKeys = await fixture.pool.query<{ delete_action: string }>(`
      SELECT confdeltype AS delete_action
      FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'caphub'::regnamespace
    `);
    expect(foreignKeys.rows.length).toBeGreaterThan(0);
    expect(new Set(foreignKeys.rows.map(({ delete_action }) => delete_action))).toEqual(new Set(["r"]));
    await expect(fixture.pool.query("DELETE FROM caphub.review_queue")).rejects.toThrow();
    await expect(fixture.pool.query("DELETE FROM caphub.registry_lineage_read")).rejects.toThrow();
  });

  it("refuses cleanup when its sentinel no longer matches, then removes its owned cluster", async () => {
    const owned = await startCaphubTestPostgres();
    const sentinel = await readFile(owned.sentinelPath, "utf8");
    await writeFile(owned.sentinelPath, sentinel.replace(owned.rootDir, `${owned.rootDir}-other`), { mode: 0o600 });
    await expect(owned.stop()).rejects.toThrow(/sentinel/i);
    expect(existsSync(owned.rootDir)).toBe(true);
    await writeFile(owned.sentinelPath, sentinel, { mode: 0o600 });
    const postmasterPid = owned.postmasterPid;
    await owned.stop();
    expect(existsSync(owned.rootDir)).toBe(false);
    expect(() => process.kill(postmasterPid, 0)).toThrow();
  }, 30_000);

  it("stops and removes an owned cluster when startup fails after the sentinel is written", async () => {
    let observed: { rootDir: string; postmasterPid: number } | undefined;
    await expect(startCaphubTestPostgres({
      afterSentinel: ({ rootDir, postmasterPid }) => {
        observed = { rootDir, postmasterPid };
        throw new Error("injected post-sentinel startup failure");
      }
    })).rejects.toThrow(/injected post-sentinel/);
    expect(observed).toBeDefined();
    expect(existsSync(observed?.rootDir ?? "missing")).toBe(false);
    expect(() => process.kill(observed?.postmasterPid ?? -1, 0)).toThrow();
  }, 30_000);
});
