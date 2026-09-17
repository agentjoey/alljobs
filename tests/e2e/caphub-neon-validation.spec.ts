import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PostgresCaptureAuditLog, PostgresCaptureStore } from "../../lib/caphub/registry/postgres/caphub-stores";
import { createCaptureService } from "../../lib/caphub/service/capture";
import { NeonS3CaptureObjectStore } from "../../lib/caphub/storage/neon-s3";
import {
  createNeonValidationFixture,
  readNeonValidationFixture,
  validationEvidence
} from "./caphub-neon-validation-fixtures";

const fixture = readNeonValidationFixture();

test.describe("Caphub Neon non-Production validation", () => {
  test.skip(!fixture, "requires explicit non-Production Neon validation references");

  test("writes one synthetic Capture immutably, verifies idempotency, and proves a recovery child snapshot", async ({}, testInfo) => {
    const validation = createNeonValidationFixture(fixture!);
    const bytes = new TextEncoder().encode("caphub-neon-validation-synthetic-image-v1");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const captureId = `cap_${digest.slice(0, 32)}`;
    const idempotencyKey = `caphub-neon-validation-${digest.slice(0, 24)}`;
    const objects = new NeonS3CaptureObjectStore({ port: validation.source.objectPort });
    const service = createCaptureService({
      store: new PostgresCaptureStore(validation.source.pool),
      audit: new PostgresCaptureAuditLog(validation.source.pool),
      objects,
      clock: () => new Date("2026-09-17T00:00:00.000Z"),
      idFactory: () => captureId,
      eventIdFactory: (id) => `evt_${createHash("sha256").update(`capture.received:${id}`).digest("hex").slice(0, 32)}`,
      maxUploadBytes: 1_024 * 1_024
    });
    try {
      const first = await service.receive({
        idempotencyKey,
        filename: "synthetic-validation.png",
        mimeType: "image/png",
        bytes,
        note: "Synthetic non-production validation fixture.",
        sourceUrl: "https://validation.example.test/caphub"
      });
      const second = await service.receive({
        idempotencyKey,
        filename: "synthetic-validation.png",
        mimeType: "image/png",
        bytes,
        note: "Synthetic non-production validation fixture.",
        sourceUrl: "https://validation.example.test/caphub"
      });
      expect(first.capture.id).toBe(captureId);
      expect(second).toMatchObject({ kind: "duplicate", capture: { id: captureId } });
      expect(await objects.readImmutable(first.capture.object)).toEqual(bytes);
      await expect(objects.readImmutable({ ...first.capture.object, bytes: first.capture.object.bytes + 1 }))
        .rejects.toThrow();
      expect(Object.keys(validation.source.objectPort).sort()).toEqual(["get", "head", "list", "putIfAbsent"]);

      const recovered = await new PostgresCaptureStore(validation.recovery.pool).get(captureId);
      expect(recovered?.object.digest).toBe(digest);
      expect(await new NeonS3CaptureObjectStore({ port: validation.recovery.objectPort }).readImmutable(recovered!.object))
        .toEqual(bytes);
      await testInfo.attach("caphub-neon-validation-evidence.json", {
        body: JSON.stringify(validationEvidence(fixture!, { sourceDigest: digest, objectCount: 1, passed: true })),
        contentType: "application/json"
      });
    } finally {
      await Promise.allSettled([validation.source.pool.end(), validation.recovery.pool.end()]);
    }
  });
});
