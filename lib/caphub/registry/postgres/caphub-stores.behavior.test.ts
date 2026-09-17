import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaptureRecord } from "../../domain/types";
import { applyRegistryMigrations } from "../migrate";
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../../../../tests/helpers/caphub-postgres";
import { PostgresCaptureStore } from "./caphub-stores";

describe("application-role Capture writes", () => {
  let postgres: CaphubTestPostgres;

  beforeAll(async () => {
    postgres = await startCaphubTestPostgres();
    await applyRegistryMigrations(postgres.pool);
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  it("creates and deduplicates through the least-privileged app role", async () => {
    const capture: CaptureRecord = {
      schema_version: 1,
      id: `cap_${"a".repeat(32)}`,
      source: { kind: "web", original_filename: "fixture.png" },
      note: "Application-role boundary",
      mime_type: "image/png",
      object: {
        algorithm: "sha256",
        digest: "b".repeat(64),
        key: `sha256/bb/${"b".repeat(64)}`,
        bytes: 68
      },
      idempotency_key: "capture.app-role-boundary-0001",
      status: "received",
      human_review_required: true,
      created_at: "2026-09-17T12:00:00.000Z"
    };
    const store = new PostgresCaptureStore(postgres.appPool);
    await expect(postgres.appPool.query(
      "SELECT capture_id FROM caphub.capture_idempotency WHERE idempotency_key=$1 FOR UPDATE",
      [capture.idempotency_key]
    )).rejects.toMatchObject({ code: "42501" });
    await expect(store.create(capture)).resolves.toBe("created");
    await expect(store.create(capture)).resolves.toBe("conflict");
    await expect(store.findByIdempotencyKey(capture.idempotency_key)).resolves.toEqual(capture);
  });
});
