import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { CaphubTestPostgres } from "../../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../../tests/helpers/caphub-postgres";
import { digestCanonicalJson } from "../../analysis/digest";
import type { RegistryVersion } from "../types";
import { applyRegistryMigrations } from "../migrate";
import { PostgresRegistryRecordStore } from "./records";

const NOW = "2026-09-16T06:30:00.000Z";
const candidatePayloadSchema = z.object({ schema_version: z.literal(1), name: z.string().min(1) }).strict();

function candidateVersion(
  suffix: string,
  version: number,
  name: string,
  previousVersion: number | null = version === 1 ? null : version - 1
): RegistryVersion {
  const payload = { schema_version: 1 as const, name };
  return {
    record_id: `cand_${suffix.repeat(32)}`,
    kind: "candidate",
    version,
    schema_version: 1,
    payload,
    payload_digest: digestCanonicalJson(payload),
    previous_version: previousVersion,
    created_at: NOW
  };
}

describe.sequential("PostgresRegistryRecordStore", () => {
  let fixture: CaphubTestPostgres;
  let store: PostgresRegistryRecordStore;

  beforeAll(async () => {
    fixture = await startCaphubTestPostgres();
    await applyRegistryMigrations(fixture.pool);
    store = new PostgresRegistryRecordStore(fixture.pool, { candidate: candidatePayloadSchema });
  }, 30_000);

  afterAll(async () => {
    await fixture?.stop();
  }, 30_000);

  it("creates, replays, and reads exact immutable versions", async () => {
    const first = candidateVersion("1", 1, "Hostile '); DROP TABLE caphub.registry_records; -- text");
    await expect(store.putVersion(first)).resolves.toEqual({ kind: "created", version: 1 });
    await expect(store.putVersion(first)).resolves.toEqual({ kind: "existing", version: 1 });
    await expect(store.getVersion(first.record_id, 1)).resolves.toEqual(first);
    await expect(store.getCurrent(first.record_id)).resolves.toEqual(first);

    const second = candidateVersion("1", 2, "Safe second version");
    await expect(store.putVersion(second)).resolves.toEqual({ kind: "created", version: 2 });
    await expect(store.getCurrent(first.record_id)).resolves.toEqual(second);
    await expect(store.getVersion(first.record_id, 1)).resolves.toEqual(first);
  });

  it("treats equivalent timestamp offsets as the same immutable version", async () => {
    const offset = {
      ...candidateVersion("8", 1, "Offset timestamp"),
      created_at: "2026-09-16T14:30:00.000+08:00"
    };
    await expect(store.putVersion(offset)).resolves.toEqual({ kind: "created", version: 1 });
    await expect(store.putVersion(offset)).resolves.toEqual({ kind: "existing", version: 1 });
    await expect(store.getCurrent(offset.record_id)).resolves.toMatchObject({ created_at: NOW });
  });

  it("rejects same-version digest conflicts and stale previous versions", async () => {
    const first = candidateVersion("2", 1, "Original");
    await store.putVersion(first);
    await expect(store.putVersion({ ...first, payload_digest: "f".repeat(64) }))
      .rejects.toMatchObject({ code: "REGISTRY_DIGEST_CONFLICT" });
    await expect(store.putVersion(candidateVersion("2", 2, "Stale", 9)))
      .rejects.toMatchObject({ code: "STALE_WRITE" });
    await expect(store.getCurrent(first.record_id)).resolves.toEqual(first);
  });

  it("allows only one concurrent next version", async () => {
    const first = candidateVersion("3", 1, "First");
    await store.putVersion(first);
    const attempts = await Promise.allSettled([
      store.putVersion(candidateVersion("3", 2, "Writer A")),
      store.putVersion(candidateVersion("3", 2, "Writer B"))
    ]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: expect.stringMatching(/^(?:STALE_WRITE|REGISTRY_DIGEST_CONFLICT)$/) }
    });
  });

  it("rolls back both identity and version when the transaction fails after insert", async () => {
    const failing = new PostgresRegistryRecordStore(fixture.pool, { candidate: candidatePayloadSchema }, {
      afterVersionInserted: async () => { throw new Error("injected rollback"); }
    });
    const record = candidateVersion("4", 1, "Rollback");
    await expect(failing.putVersion(record)).rejects.toMatchObject({ code: "REGISTRY_UNAVAILABLE" });
    await expect(store.getCurrent(record.record_id)).resolves.toBeNull();
  });

  it("validates kind-specific payloads before write and after read", async () => {
    const invalid = candidateVersion("5", 1, "Valid");
    await expect(store.putVersion({ ...invalid, payload: {} }))
      .rejects.toMatchObject({ code: "INVALID_REGISTRY_RECORD" });

    const id = `cand_${"6".repeat(32)}`;
    const client = await fixture.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO caphub.registry_records (record_id, kind, current_version, created_at, updated_at) VALUES ($1, 'candidate', 1, now(), now())",
        [id]
      );
      await client.query(
        `INSERT INTO caphub.registry_versions
          (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
         VALUES ($1, 1, 'candidate', 1, '{}'::jsonb, $2, NULL, now())`,
        [id, digestCanonicalJson({})]
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    await expect(store.getCurrent(id)).rejects.toMatchObject({ code: "INVALID_REGISTRY_RECORD" });
  });

  it("maps database failures to a safe error without connection or SQL leakage", async () => {
    const unavailablePool = new Pool({
      host: fixture.socketDir,
      port: fixture.port + 1,
      user: "caphub_test",
      database: "postgres",
      connectionTimeoutMillis: 100
    });
    const unavailable = new PostgresRegistryRecordStore(unavailablePool, { candidate: candidatePayloadSchema });
    try {
      await expect(unavailable.getCurrent(`cand_${"7".repeat(32)}`)).rejects.toMatchObject({
        code: "REGISTRY_UNAVAILABLE",
        message: "Registry storage is unavailable"
      });
    } finally {
      await unavailablePool.end();
    }
  });
});
