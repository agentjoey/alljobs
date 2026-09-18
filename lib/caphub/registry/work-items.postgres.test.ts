import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "./migrate";
import { PostgresCaptureStore } from "./postgres/caphub-stores";
import { applyAutomationBackfill } from "../automation/backfill";
import { getCaphubWorkItems } from "./work-items";
let fixture: CaphubTestPostgres;
beforeAll(async () => {
  fixture = await startCaphubTestPostgres(); await applyRegistryMigrations(fixture.pool);
  for (let n=1;n<=30;n++) {
    const digest = "a".repeat(64);
    await new PostgresCaptureStore(fixture.pool).create({ schema_version: 1,id: `cap_${n.toString(16).padStart(32,"0")}`,
      source: { kind: "web", original_filename: n===30 ? "FILE-01.PNG" : `file-${String(n).padStart(2,"0")}.png` }, note: "private note",
      mime_type: "image/png", object: { algorithm: "sha256",digest,key: `sha256/aa/${digest}`,bytes: 1 },
      idempotency_key: `work-items-fixture-${n}`,status: "received",human_review_required: true,created_at: "2026-09-18T00:00:00Z" });
  }
  await applyAutomationBackfill(fixture.pool);
},30000);
afterAll(async () => { await fixture?.stop(); });
it("returns one current row per filename, whole-result counts and stable pages in one query", async () => {
  const query = vi.spyOn(fixture.appPool,"query");
  const first = await getCaphubWorkItems(fixture.appPool,{});
  expect(query).toHaveBeenCalledTimes(1);
  expect(first.items).toHaveLength(25);
  expect(first.total).toBe(29);
  expect(first.nextCursor).toBeTruthy();
  expect(JSON.stringify(first)).not.toMatch(/private note|sha256\//);
  const next = await getCaphubWorkItems(fixture.appPool,{cursor: first.nextCursor!});
  expect(next.items).toHaveLength(4);
  expect(next.total).toBe(29);
  expect(new Set([...first.items,...next.items].map(row=>row.filenameKey)).size).toBe(29);
  query.mockRestore();
});
