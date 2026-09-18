import { afterAll, beforeAll, expect, it } from "vitest";
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "../registry/migrate";
import { PostgresCaptureStore } from "../registry/postgres/caphub-stores";
import { AnalysisRequests } from "../registry/postgres/analysis-requests";
import { runAnalysisTick } from "./worker";
let fixture: CaphubTestPostgres;
const now = new Date("2026-09-18T00:00:00Z");
const captureId = `cap_${"1".repeat(32)}`;
beforeAll(async () => {
  fixture = await startCaphubTestPostgres(); await applyRegistryMigrations(fixture.pool);
  await new PostgresCaptureStore(fixture.pool).create({ schema_version: 1, id: captureId,
    source: { kind: "web", original_filename: "worker.png" }, note: "", mime_type: "image/png",
    object: { algorithm: "sha256", digest: "a".repeat(64), key: `sha256/aa/${"a".repeat(64)}`, bytes: 1 },
    idempotency_key: "worker-fixture-key", status: "received", human_review_required: true, created_at: now.toISOString() });
}, 30000);
afterAll(async () => { await fixture?.stop(); });

it("durably ensures one request, claims once across connections, and prevents a stale owner finishing", async () => {
  const requests = new AnalysisRequests(fixture.appPool);
  await Promise.all([requests.ensure(captureId, now), requests.ensure(captureId, now)]);
  const claims = await Promise.all([requests.claim("one", now), requests.claim("two", now)]);
  const lease = claims.find(Boolean)!;
  expect(claims.filter(Boolean)).toHaveLength(1);
  const later = new Date(now.getTime() + 121000);
  const replacement = await requests.claim("replacement", later);
  expect(replacement?.captureId).toBe(captureId);
  expect(await requests.finish(lease, { state: "needs_attention" }, later)).toBe(false);
  expect(await requests.heartbeat(replacement!, later)).toBe(true);
  expect(await requests.finish(replacement!, { state: "needs_attention", errorCode: "INTERRUPTED_PROVIDER_CALL" }, later)).toBe(true);
  await requests.ensure(captureId, later);
  expect(await requests.claim("no-replay", later)).toBeNull();
});

it("runs one workflow and records a terminal outcome; never retries a stopped provider automatically", async () => {
  await fixture.pool.query("UPDATE caphub.analysis_requests SET state='queued',error_code=NULL");
  const requests = new AnalysisRequests(fixture.appPool);
  let calls = 0;
  const deps = { requests, clock: () => now, ownerToken: () => "tick", workflow: { startAndImport: async () => {
    calls++;
    return { captureId, jobId: `job_${"2".repeat(32)}`, analysisStatus: "HUMAN_REVIEW_REQUIRED", reviewPacketArtifactId: null, reviewRequestId: null };
  } } };
  expect(await runAnalysisTick(deps, new AbortController().signal)).toBe("processed");
  expect(await runAnalysisTick(deps, new AbortController().signal)).toBe("idle");
  expect(calls).toBe(1);
});
