import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { createReviewPacketImporter } from "./import-review-packet";
import { applyRegistryMigrations } from "./migrate";

describe.sequential("ReviewPacket import boundary", () => {
  let postgres: CaphubTestPostgres;

  beforeAll(async () => {
    postgres = await startCaphubTestPostgres();
    await applyRegistryMigrations(postgres.pool);
  }, 30_000);

  afterAll(async () => {
    await postgres?.stop();
  }, 30_000);

  it("fails closed before storage, network, provider, or Linear work when the job is absent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const captures = { get: vi.fn() };
    const artifacts = {
      get: vi.fn(),
      findByJobStage: vi.fn(),
      create: vi.fn(),
      readPayload: vi.fn()
    };
    const jobs = { get: vi.fn().mockResolvedValue(null), put: vi.fn() };
    const importer = createReviewPacketImporter({
      pool: postgres.pool,
      captures,
      jobs,
      artifacts,
      clock: () => "2026-09-16T10:00:00.000Z"
    });

    await expect(importer.importReviewPacket({ jobId: `job_${"f".repeat(32)}` }))
      .rejects.toMatchObject({ code: "IMPORT_NOT_READY" });
    expect(captures.get).not.toHaveBeenCalled();
    expect(artifacts.get).not.toHaveBeenCalled();
    expect(artifacts.readPayload).not.toHaveBeenCalled();
    expect(jobs.put).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    const writes = await postgres.pool.query<{ count: string }>(
      "SELECT count(*) FROM caphub.registry_records"
    );
    expect(writes.rows[0]?.count).toBe("0");
    fetchSpy.mockRestore();
  });
});
