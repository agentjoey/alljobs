import { afterAll, beforeAll, expect, it } from "vitest";
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "../registry/migrate";

let fixture: CaphubTestPostgres;
beforeAll(async () => { fixture = await startCaphubTestPostgres(); await applyRegistryMigrations(fixture.pool); }, 30000);
afterAll(async () => { await fixture?.stop(); });
it("installs automation tables with application privileges and retains immutable evidence guards", async () => {
  const result = await fixture.appPool.query(`SELECT to_regclass('caphub.analysis_requests')::text AS requests,
    to_regclass('caphub.capture_filename_heads')::text AS heads,
    to_regclass('caphub.capture_filename_versions')::text AS versions,
    to_regclass('caphub.capture_object_retention')::text AS retention`);
  expect(Object.values(result.rows[0]).every(Boolean)).toBe(true);
  await expect(fixture.appPool.query("SELECT * FROM caphub.analysis_requests")).resolves.toHaveProperty("rowCount", 0);
  await expect(fixture.appPool.query("DELETE FROM caphub.registry_versions")).rejects.toThrow();
});
