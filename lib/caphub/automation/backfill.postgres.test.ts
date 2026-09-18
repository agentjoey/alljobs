import { afterAll, beforeAll, expect, it } from "vitest";
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "../registry/migrate";
import { PostgresCaptureStore } from "../registry/postgres/caphub-stores";
import { applyAutomationBackfill } from "./backfill";

let fixture: CaphubTestPostgres;
beforeAll(async () => { fixture = await startCaphubTestPostgres(); await applyRegistryMigrations(fixture.pool); }, 30000);
afterAll(async () => { await fixture?.stop(); });

it("backfills duplicate aliases idempotently without queuing legacy captures or resolving different bytes", async () => {
  const store = new PostgresCaptureStore(fixture.pool);
  for (const [seed, filename, digest] of [[1, "A.PNG", "a"], [2, "a.png", "a"], [3, "B.PNG", "b"], [4, "b.png", "c"]] as const) {
    await store.create({ schema_version: 1, id: `cap_${String(seed).repeat(32)}`,
      source: { kind: "web", original_filename: filename }, note: "", mime_type: "image/png",
      object: { algorithm: "sha256", digest: digest.repeat(64), key: `sha256/${digest.repeat(2)}/${digest.repeat(64)}`, bytes: 42 },
      idempotency_key: `backfill-fixture-${seed}`, status: "received", human_review_required: true,
      created_at: `2026-09-0${seed}T00:00:00.000Z` });
  }
  expect((await applyAutomationBackfill(fixture.pool)).conflicts).toHaveLength(1);
  await applyAutomationBackfill(fixture.pool);
  expect((await fixture.pool.query("SELECT * FROM caphub.capture_filename_heads")).rows).toHaveLength(1);
  expect((await fixture.pool.query("SELECT * FROM caphub.capture_filename_versions")).rows).toHaveLength(2);
  expect((await fixture.pool.query("SELECT * FROM caphub.capture_object_retention")).rows).toHaveLength(4);
  expect((await fixture.pool.query("SELECT * FROM caphub.analysis_requests")).rows).toHaveLength(0);
  const id = `cap_${"1".repeat(32)}`;
  await fixture.appPool.query(`INSERT INTO caphub.analysis_requests (capture_id,contract,state,created_at,updated_at)
    VALUES ($1,'caphub-analysis-v4','queued',now(),now())`, [id]);
  await expect(fixture.appPool.query(`INSERT INTO caphub.analysis_requests (capture_id,contract,state,created_at,updated_at)
    VALUES ($1,'caphub-analysis-v4','queued',now(),now())`, [id])).rejects.toMatchObject({ code: "23505" });
  await expect(fixture.appPool.query("UPDATE caphub.analysis_requests SET state='running' WHERE capture_id=$1", [id])).rejects.toMatchObject({ code: "23514" });
  await expect(fixture.appPool.query("UPDATE caphub.capture_object_retention SET imported_at=now(),eligible_at=now() WHERE capture_id=$1", [id])).rejects.toMatchObject({ code: "23514" });
  await expect(fixture.appPool.query("INSERT INTO caphub.capture_filename_heads VALUES ('missing', $1, $2, 1, now())", [`cap_${"f".repeat(32)}`, "a".repeat(64)])).rejects.toMatchObject({ code: "23503" });
});
