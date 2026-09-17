import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { captureReceivedEventId, FilesystemCaptureAuditLog } from "../storage/audit-log";
import { FilesystemCaptureStore } from "../storage/filesystem";
import { LocalCaptureObjectStore } from "../storage/local-objects";
import type { CaptureRecord } from "../storage/contracts";
import { applyRegistryMigrations } from "./migrate";
import { PostgresCaptureAuditLog, PostgresCaptureStore } from "./postgres/caphub-stores";
import { applyFilesystemCaptureImport, planFilesystemCaptureImport } from "./filesystem-import";

describe.sequential("filesystem Capture to PostgreSQL import boundary", () => {
  let postgres: CaphubTestPostgres;
  let fixtureRoot: string;
  let sourceRoot: string;

  beforeAll(async () => {
    postgres = await startCaphubTestPostgres();
    await applyRegistryMigrations(postgres.pool);
    fixtureRoot = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "caphub-import-behavior-")));
    chmodSync(fixtureRoot, 0o700);
    sourceRoot = join(fixtureRoot, "home", "state", "caphub");
    mkdirSync(sourceRoot, { recursive: true, mode: 0o700 });
    for (const path of [join(fixtureRoot, "home"), join(fixtureRoot, "home", "state"), sourceRoot]) chmodSync(path, 0o700);

    const objects = new LocalCaptureObjectStore(sourceRoot);
    const captures = new FilesystemCaptureStore(sourceRoot);
    const audits = new FilesystemCaptureAuditLog(sourceRoot);
    for (const [digit, hour] of [["1", "01"], ["2", "02"]] as const) {
      const object = await objects.putImmutable({ bytes: new TextEncoder().encode(`capture-${digit}`), mimeType: "image/png" });
      const capture: CaptureRecord = {
        schema_version: 1,
        id: `cap_${digit.repeat(32)}`,
        source: { kind: "web", original_filename: `${digit}.png` },
        note: "existing filesystem capture",
        mime_type: "image/png",
        object,
        idempotency_key: `capture.request-20260917:behavior-${digit}`,
        status: "received",
        human_review_required: true,
        created_at: `2026-09-17T${hour}:00:00.000Z`
      };
      await captures.create(capture);
      await audits.ensure({
        schema_version: 1,
        event_id: captureReceivedEventId(capture.id),
        capture_id: capture.id,
        type: "capture.received",
        actor: "web:user",
        occurred_at: capture.created_at,
        object_digest: capture.object.digest
      });
    }
  }, 30_000);

  afterAll(async () => {
    await postgres?.stop();
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  }, 30_000);

  it("imports exactly once, reruns idempotently, and never mutates source bytes", async () => {
    const before = readFileSync(join(sourceRoot, "events", "2026-09.jsonl"));
    const manifest = await planFilesystemCaptureImport({ root: sourceRoot });
    const input = {
      root: sourceRoot,
      expectedSourceDigest: manifest.source_digest,
      captures: new PostgresCaptureStore(postgres.pool),
      audit: new PostgresCaptureAuditLog(postgres.pool)
    };
    await expect(applyFilesystemCaptureImport(input)).resolves.toEqual({
      created: 2,
      existing: 0,
      sourceDigest: manifest.source_digest
    });
    await expect(applyFilesystemCaptureImport(input)).resolves.toEqual({
      created: 0,
      existing: 2,
      sourceDigest: manifest.source_digest
    });
    expect(readFileSync(join(sourceRoot, "events", "2026-09.jsonl"))).toEqual(before);
    const rows = await postgres.pool.query<{ captures: string; audits: string }>(`
      SELECT
        (SELECT count(*) FROM caphub.registry_records WHERE kind = 'capture')::text AS captures,
        (SELECT count(*) FROM caphub.audit_events WHERE event_type = 'capture.received')::text AS audits
    `);
    expect(rows.rows[0]).toEqual({ captures: "2", audits: "2" });
  });

  it("aborts on a real PostgreSQL digest conflict before adding rows", async () => {
    const conflictRoot = join(fixtureRoot, "conflict-home", "state", "caphub");
    mkdirSync(conflictRoot, { recursive: true, mode: 0o700 });
    for (const path of [
      join(fixtureRoot, "conflict-home"),
      join(fixtureRoot, "conflict-home", "state"),
      conflictRoot
    ]) chmodSync(path, 0o700);
    const object = await new LocalCaptureObjectStore(conflictRoot).putImmutable({
      bytes: new TextEncoder().encode("capture-1"),
      mimeType: "image/png"
    });
    const conflicting: CaptureRecord = {
      schema_version: 1,
      id: `cap_${"1".repeat(32)}`,
      source: { kind: "web", original_filename: "1.png" },
      note: "conflicting immutable content",
      mime_type: "image/png",
      object,
      idempotency_key: "capture.request-20260917:behavior-1",
      status: "received",
      human_review_required: true,
      created_at: "2026-09-17T01:00:00.000Z"
    };
    await new FilesystemCaptureStore(conflictRoot).create(conflicting);
    await new FilesystemCaptureAuditLog(conflictRoot).ensure({
      schema_version: 1,
      event_id: captureReceivedEventId(conflicting.id),
      capture_id: conflicting.id,
      type: "capture.received",
      actor: "web:user",
      occurred_at: conflicting.created_at,
      object_digest: conflicting.object.digest
    });
    const manifest = await planFilesystemCaptureImport({ root: conflictRoot });
    await expect(applyFilesystemCaptureImport({
      root: conflictRoot,
      expectedSourceDigest: manifest.source_digest,
      captures: new PostgresCaptureStore(postgres.pool),
      audit: new PostgresCaptureAuditLog(postgres.pool)
    })).rejects.toThrow(/conflict/i);
    const count = await postgres.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM caphub.registry_records WHERE kind = 'capture'"
    );
    expect(count.rows[0]?.count).toBe("2");
  });
});
