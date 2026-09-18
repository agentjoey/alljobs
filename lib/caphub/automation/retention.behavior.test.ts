import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "../registry/migrate";
import { PostgresCaptureStore } from "../registry/postgres/caphub-stores";
import { markImportedRetention, sweepRetention } from "./retention";
let fixture: CaphubTestPostgres;
const imported = new Date("2026-09-18T00:00:00Z");
const due = new Date("2026-10-18T00:00:00Z");
const id = (n: number) => `cap_${n.toString(16).repeat(32)}`;
async function capture(n: number, digest = "a".repeat(64)) {
  await new PostgresCaptureStore(fixture.pool).create({ schema_version: 1, id: id(n), source: { kind: "web", original_filename: `${n}.png` },
    note: "", mime_type: "image/png", object: { algorithm: "sha256", digest, key: `sha256/${digest.slice(0,2)}/${digest}`, bytes: 42 },
    idempotency_key: `retention-fixture-${n}`, status: "received", human_review_required: true, created_at: imported.toISOString() });
}
beforeAll(async () => { fixture = await startCaphubTestPostgres(); await applyRegistryMigrations(fixture.pool); }, 30000);
afterAll(async () => { await fixture?.stop(); });

it("keeps images until exactly import+30 days and blocks all shared ineligible/missing references", async () => {
  await capture(1); await capture(2);
  await markImportedRetention(fixture.appPool, id(1), imported);
  const deleteExactObject = vi.fn(async () => {});
  const deps = { pool: fixture.appPool, objects: { deleteExactObject } };
  expect(await sweepRetention(deps, { now: due, dryRun: false })).toEqual([]);
  await markImportedRetention(fixture.appPool, id(2), imported);
  expect(await sweepRetention(deps, { now: new Date(due.getTime()-1), dryRun: false })).toEqual([]);
  expect((await sweepRetention(deps, { now: due, dryRun: true }))[0].state).toBe("eligible");
  expect(deleteExactObject).not.toHaveBeenCalled();
  expect((await sweepRetention(deps, { now: due, dryRun: false }))[0].state).toBe("purged");
  expect(deleteExactObject).toHaveBeenCalledTimes(1);
  expect(await sweepRetention(deps, { now: due, dryRun: false })).toEqual([]);
  expect((await fixture.pool.query("SELECT * FROM caphub.registry_records WHERE kind='capture'")).rowCount).toBe(2);
});

it("retries a failed delete and recovers a crash after object deletion without false receipts", async () => {
  await capture(3, "b".repeat(64)); await markImportedRetention(fixture.appPool, id(3), imported);
  const deleteExactObject = vi.fn().mockRejectedValueOnce(new Error("S3 unavailable")).mockResolvedValue(undefined);
  const deps = { pool: fixture.appPool, objects: { deleteExactObject } };
  expect((await sweepRetention(deps, { now: due, dryRun: false }))[0].state).toBe("failed");
  await expect(sweepRetention({ ...deps, afterDelete: async () => { throw new Error("crash"); } }, { now: due, dryRun: false })).rejects.toThrow("crash");
  expect((await fixture.pool.query("SELECT purged_at FROM caphub.capture_object_retention WHERE capture_id=$1", [id(3)])).rows[0].purged_at).toBeNull();
  expect((await sweepRetention(deps, { now: due, dryRun: false }))[0].state).toBe("purged");
  expect(deleteExactObject).toHaveBeenCalledTimes(3);
});
