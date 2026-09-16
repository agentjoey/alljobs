import { describe, expect, it } from "vitest";
import type { CaptureRecord } from "../domain/types";
import type { CaptureStore } from "../storage/contracts";

export interface CaptureStoreContractFixture {
  store: CaptureStore;
  record(overrides?: Partial<CaptureRecord>): CaptureRecord;
}

export function defineCaptureStoreContract(
  name: string,
  createFixture: () => CaptureStoreContractFixture | Promise<CaptureStoreContractFixture>
): void {
  describe(`${name} CaptureStore contract`, () => {
    it("creates, reads, and replays one exact immutable Capture", async () => {
      const { store, record } = await createFixture();
      const input = record();

      await expect(store.create(input)).resolves.toBe("created");
      await expect(store.create(input)).resolves.toBe("conflict");
      await expect(store.get(input.id)).resolves.toEqual(input);
      await expect(store.findByIdempotencyKey(input.idempotency_key)).resolves.toEqual(input);
    });

    it("rejects the same ID or idempotency key when immutable content differs", async () => {
      const { store, record } = await createFixture();
      const input = record();
      await store.create(input);

      const changed = record({ note: "different immutable Capture content" });
      await expect(store.create(changed)).resolves.toBe("conflict");
      await expect(store.get(input.id)).resolves.toEqual(input);

      const contender = record({ id: `cap_${"e".repeat(32)}`, note: "same key, different ID" });
      await expect(store.create(contender)).resolves.toBe("conflict");
      await expect(store.findByIdempotencyKey(input.idempotency_key)).resolves.toEqual(input);
    });
  });
}
