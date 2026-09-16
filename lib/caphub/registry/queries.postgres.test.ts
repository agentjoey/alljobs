import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "./migrate";
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
