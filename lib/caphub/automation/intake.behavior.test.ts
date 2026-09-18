// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "../registry/migrate";
import { createAutomatedIntake } from "./intake";
import type { CaptureMimeType } from "../domain/types";
import { createCapturePostRoute } from "../../../app/api/caphub/captures/route-factory";

let fixture: CaphubTestPostgres;
beforeAll(async () => { fixture = await startCaphubTestPostgres(); await applyRegistryMigrations(fixture.pool); }, 30000);
afterAll(async () => { await fixture?.stop(); });
const putImmutable = vi.fn(async ({ bytes }: { bytes: Uint8Array; mimeType: CaptureMimeType }) => {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return { algorithm: "sha256" as const, digest, key: `sha256/${digest.slice(0, 2)}/${digest}`, bytes: bytes.length };
});
const receive = (input: Parameters<ReturnType<typeof createAutomatedIntake>>[0]) => createAutomatedIntake({
  pool: fixture.appPool, objects: { putImmutable }, maxUploadBytes: 1000,
  idFactory: () => `cap_${randomUUID().replaceAll("-", "")}`, clock: () => new Date("2026-09-18T00:00:00Z")
})(input);
const input = (filename: string, key: string, text = "same") => ({ filename, idempotencyKey: `intake-fixture-${key}`, mimeType: "image/png", bytes: new TextEncoder().encode(text) });

it("receives actual multipart uploads through the route and returns the same public canonical receipt", async () => {
  const route = createCapturePostRoute({ receive, maxUploadBytes: 1000, allowedOrigins: ["http://localhost"] });
  async function upload(key: string) {
    const form = new FormData();
    form.set("image", new File(["multipart-image"], "Browser.PNG", { type: "image/png" }));
    form.set("idempotency_key", `browser-test-${key}`);
    return route(new Request("http://localhost/api/caphub/captures", { method: "POST", body: form, headers: { origin: "http://localhost", "content-length": "1024" } }));
  }
  const first = await upload("one");
  const second = await upload("two");
  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect((await first.json()).capture.id).toBe((await second.json()).capture.id);
});

it("recovers an object-write failure without a partial Capture or consumed request key", async () => {
  putImmutable.mockRejectedValueOnce(new Error("object edge unavailable"));
  const attempt = input("recover.png", "recover");
  await expect(receive(attempt)).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  expect((await fixture.pool.query("SELECT * FROM caphub.capture_filename_heads WHERE filename_key='recover.png'")).rowCount).toBe(0);
  expect((await receive(attempt)).kind).toBe("created");
});

it("serializes concurrent same-name/content uploads into one Capture/object while binding both request keys", async () => {
  const start = putImmutable.mock.calls.length;
  const [a, b] = await Promise.all([receive(input("A.PNG", "a")), receive(input(" a.png ", "b"))]);
  expect(a.capture.id).toBe(b.capture.id);
  expect(putImmutable.mock.calls.length - start).toBe(1);
  expect((await receive(input(" a.png ", "b"))).capture.id).toBe(a.capture.id);
  await expect(receive({ ...input(" a.png ", "b"), note: "changed" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});

it("requires explicit confirmation before writing different bytes and rejects stale concurrent confirmation", async () => {
  const first = await receive(input("Conflict.png", "conflict-first"));
  const start = putImmutable.mock.calls.length;
  const second = input("Conflict.png", "conflict-second", "different");
  await expect(receive(second)).rejects.toMatchObject({ code: "FILENAME_CONFLICT", existing: { id: first.capture.id } });
  expect(putImmutable.mock.calls.length).toBe(start);
  const confirmation = { expectedCurrentCaptureId: first.capture.id, expectedCurrentObjectDigest: first.capture.object.digest };
  const outcomes = await Promise.allSettled([receive({ ...second, ...confirmation }), receive({ ...input("Conflict.png", "conflict-third", "third"), ...confirmation })]);
  expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.find(row => row.status === "rejected")).toMatchObject({ reason: { code: "FILENAME_CONFLICT_STALE" } });
  expect(putImmutable.mock.calls.length).toBe(start + 1);
  expect((await fixture.pool.query("SELECT version FROM caphub.capture_filename_heads WHERE filename_key='conflict.png'")).rows[0].version).toBe(2);
});
