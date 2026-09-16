import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "./migrate";
import { digestCanonicalJson } from "../analysis/digest";
import { testCapabilityPackage } from "../packages/fixtures";
import { createRegistryQueries } from "./queries";

const CREATED_AT = "2026-09-16T12:00:00.000Z";

describe.sequential("Registry queue keyset pagination", () => {
  let fixture: CaphubTestPostgres;

  beforeAll(async () => {
    fixture = await startCaphubTestPostgres();
    await applyRegistryMigrations(fixture.pool);

    const rows = [
      { suffix: "f", risk: 5 },
      { suffix: "1", risk: 3 },
      { suffix: "3", risk: 3 },
      { suffix: "2", risk: 1 }
    ];
    for (const { suffix, risk } of rows) {
      const candidateId = `cand_${suffix.repeat(32)}`;
      const packetId = `rvp_${suffix.repeat(32)}`;
      const requestId = `rev_${suffix.repeat(32)}`;
      const candidateDigest = suffix.repeat(64);
      const packetDigest = (risk + 3).toString(16).repeat(64);
      const client = await fixture.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`
          INSERT INTO caphub.registry_records
            (record_id, kind, current_version, created_at, updated_at)
          VALUES ($1, 'candidate', 1, $3, $3), ($2, 'review_packet', 1, $3, $3)
        `, [candidateId, packetId, CREATED_AT]);
        await client.query(`
          INSERT INTO caphub.registry_versions
            (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
          VALUES
            ($1, 1, 'candidate', 1, $5::jsonb, $3, NULL, $4),
            ($2, 1, 'review_packet', 1, $6::jsonb, $7, NULL, $4)
        `, [candidateId, packetId, candidateDigest, CREATED_AT,
          JSON.stringify({ name: `Risk ${risk}` }),
          JSON.stringify({ dimensions: { security_risk: { score: risk } } }), packetDigest]);
        await client.query(`
          INSERT INTO caphub.registry_lineage
            (from_node_id, from_kind, from_version, from_digest, relationship,
             to_node_id, to_kind, to_version, to_digest, created_at)
          VALUES ($2, 'review_packet', 1, $5, 'proposes', $1, 'candidate', 1, $3, $4)
        `, [candidateId, packetId, candidateDigest, CREATED_AT, packetDigest]);
        await client.query(`
          INSERT INTO caphub.review_requests
            (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
             lock_version, state, approve_confirmation, reject_confirmation, created_at, updated_at)
          VALUES ($1, 'candidate', 'candidate', $2, 1, $3, 1, 'WAITING_FOR_REVIEW',
                  $5, $6, $4, $4)
        `, [
          requestId,
          candidateId,
          candidateDigest,
          CREATED_AT,
          `APPROVE CANDIDATE ${suffix.repeat(8)}`,
          `REJECT CANDIDATE ${suffix.repeat(8)}`
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  }, 30_000);

  afterAll(async () => {
    await fixture?.stop();
  }, 30_000);

  it("does not duplicate or skip equal-timestamp rows across risk-ordered pages", async () => {
    const queries = createRegistryQueries(fixture.appPool);
    const first = await queries.getReviewQueue({ limit: 2 });
    const second = await queries.getReviewQueue({ limit: 2, cursor: first.nextCursor });

    expect(first.items.map(({ riskScore }) => riskScore)).toEqual([5, 3]);
    expect(second.items.map(({ riskScore }) => riskScore)).toEqual([3, 1]);
    expect(second.items[0]?.request.id).toBe(`rev_${"3".repeat(32)}`);
    expect(new Set([...first.items, ...second.items].map(({ request }) => request.id)).size).toBe(4);
  });
});

describe.sequential("getCapabilityExportState (real PostgreSQL)", () => {
  let fixture: CaphubTestPostgres;
  const NOW = "2026-09-16T12:00:00.000Z";
  const CANDIDATE_ID = `cand_${"e5".repeat(16)}`;
  const RELEASE_ID = `rel_${"e6".repeat(16)}`;
  const PLAN_ID = `dpl_${"e7".repeat(16)}`;

  beforeAll(async () => {
    fixture = await startCaphubTestPostgres();
    await applyRegistryMigrations(fixture.pool);
  }, 30_000);

  afterAll(async () => {
    await fixture?.stop();
  }, 30_000);

  async function insertRecordAndVersion(recordId: string, kind: string, payload: unknown, digest: string): Promise<void> {
    const client = await fixture.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO caphub.registry_records (record_id, kind, current_version, created_at, updated_at) VALUES ($1,$2,1,$3,$3)",
        [recordId, kind, NOW]
      );
      await client.query(
        `INSERT INTO caphub.registry_versions (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
         VALUES ($1,1,$2,1,$3::jsonb,$4,NULL,$5)`,
        [recordId, kind, JSON.stringify(payload), digest, NOW]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function insertLineage(
    fromId: string,
    fromKind: string,
    fromDigest: string,
    relationship: string,
    toId: string,
    toKind: string,
    toDigest: string
  ): Promise<void> {
    await fixture.pool.query(
      `INSERT INTO caphub.registry_lineage
        (from_node_id, from_kind, from_version, from_digest, relationship, to_node_id, to_kind, to_version, to_digest, created_at)
       VALUES ($1,$2,1,$3,$4,$5,$6,1,$7,$8)`,
      [fromId, fromKind, fromDigest, relationship, toId, toKind, toDigest, NOW]
    );
  }

  it("returns no_release before lineage and a full safe DTO after the P4 chain", async () => {
    const queries = createRegistryQueries(fixture.appPool);
    const candidateDigest = "e9".repeat(32);
    await insertRecordAndVersion(CANDIDATE_ID, "candidate", { name: "Fixture" }, candidateDigest);
    expect((await queries.getCapabilityExportState(CANDIDATE_ID, { exportsEnabled: true })).kind)
      .toBe("no_release");

    const pkg = testCapabilityPackage({ release_id: RELEASE_ID, dependencies: [] });
    const releaseDigest = digestCanonicalJson(pkg);
    await insertRecordAndVersion(RELEASE_ID, "release", pkg, releaseDigest);
    await insertLineage(CANDIDATE_ID, "candidate", candidateDigest, "realized_as", RELEASE_ID, "release", releaseDigest);

    const requestId = `rev_${"ea".repeat(16)}`;
    const shortId = RELEASE_ID.slice(RELEASE_ID.indexOf("_") + 1, RELEASE_ID.indexOf("_") + 9);
    await fixture.pool.query(
      `INSERT INTO caphub.review_requests
        (request_id, review_kind, subject_kind, subject_id, subject_version, subject_digest,
         lock_version, state, approve_confirmation, reject_confirmation, created_at, updated_at)
       VALUES ($1,'release','release',$2,1,$3,1,'WAITING_FOR_REVIEW',$4,$5,$6,$6)`,
      [requestId, RELEASE_ID, releaseDigest, `APPROVE RELEASE ${shortId}`, `REJECT RELEASE ${shortId}`, NOW]
    );

    const plan = {
      schema_version: 1,
      action: "publish",
      target: "codex",
      target_alias: "codex-primary",
      release: { record_id: RELEASE_ID, version: 1, digest: releaseDigest },
      adapter: { name: "codex", version: "1.0.0", digest: "eb".repeat(32) },
      preview_manifest_digest: "ec".repeat(32),
      preview_diff_digest: "ed".repeat(32),
      expected_current_pointer: null,
      target_preimage_digest: "ee".repeat(32),
      created_at: NOW
    };
    const planDigest = digestCanonicalJson(plan);
    await insertRecordAndVersion(PLAN_ID, "deployment_plan", plan, planDigest);
    await insertLineage(RELEASE_ID, "release", releaseDigest, "proposes", PLAN_ID, "deployment_plan", planDigest);

    const result = await queries.getCapabilityExportState(CANDIDATE_ID, { exportsEnabled: true });
    if (result.kind !== "ready") throw new Error(`unexpected ${result.kind}`);
    expect(result.release.state).toBe("waiting");
    expect(result.release.recordId).toBe(RELEASE_ID);
    expect(result.deployment.plans).toEqual([expect.objectContaining({
      planId: PLAN_ID,
      targetAlias: "codex-primary",
      reviewState: "WAITING_FOR_REVIEW"
    })]);
    expect(result.deployment.history).toEqual([]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/\/Users\/|postgres:\/\//);
  });
});
