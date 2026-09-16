import { chmodSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "./migrate";
import { loadControlHostRegistryRuntime } from "./runtime";

const registryConfig = {
  enabled: true,
  databaseUrlEnv: "CAPHUB_DATABASE_URL",
  sslMode: "require" as const,
  maxConnections: 4,
  statementTimeoutMs: 5_000
};

describe.sequential("Control Host Registry runtime", () => {
  let postgres: CaphubTestPostgres;
  let root: string;

  beforeAll(async () => {
    postgres = await startCaphubTestPostgres();
    await applyRegistryMigrations(postgres.pool);
    root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "caphub-runtime-")));
    mkdirSync(join(root, "state", "caphub"), { recursive: true, mode: 0o700 });
    chmodSync(join(root, "state", "caphub"), 0o700);
  }, 30_000);

  afterAll(async () => {
    await postgres?.stop();
    if (dirname(root) !== realpathSync(tmpdir())
      || !basename(root).startsWith("caphub-runtime-")
      || lstatSync(root).isSymbolicLink()) throw new Error("unsafe runtime fixture cleanup");
    rmSync(root, { recursive: true, force: true });
  }, 30_000);

  it("rejects disabled configuration before reading the database secret", async () => {
    const reads: PropertyKey[] = [];
    const env = new Proxy({}, { get: (_target, key) => { reads.push(key); return undefined; } });
    await expect(loadControlHostRegistryRuntime({
      config: { caphubEnabled: true, registry: { ...registryConfig, enabled: false } },
      env
    })).rejects.toMatchObject({ code: "REGISTRY_DISABLED" });
    expect(reads).toEqual([]);
  });

  it("composes PostgreSQL metadata ports while raw bytes remain in the local object store", async () => {
    const objectRoot = join(root, "state", "caphub");
    const runtime = await loadControlHostRegistryRuntime({
      config: { caphubEnabled: true, registry: registryConfig },
      objectRoot,
      env: { CAPHUB_DATABASE_URL: "postgresql://fixture.invalid/caphub" },
      poolFactory: () => postgres.pool
    });
    const bytes = new TextEncoder().encode("immutable screenshot bytes");
    const object = await runtime.objects.putImmutable({ bytes, mimeType: "image/png" });
    const capture = {
      schema_version: 1 as const,
      id: `cap_${"a".repeat(32)}`,
      source: { kind: "web" as const, original_filename: "runtime.png" },
      note: "Runtime fixture",
      mime_type: "image/png" as const,
      object,
      idempotency_key: "capture.request-20260916:runtime",
      status: "received" as const,
      human_review_required: true as const,
      created_at: "2026-09-16T11:00:00.000Z"
    };
    await expect(runtime.captures.create(capture)).resolves.toBe("created");
    await expect(runtime.captures.get(capture.id)).resolves.toEqual(capture);
    expect(Array.from(await runtime.objects.readImmutable(object))).toEqual(Array.from(bytes));
    const database = await postgres.pool.query<{ count: string }>(
      "SELECT count(*) FROM caphub.registry_records WHERE kind = 'capture'"
    );
    expect(database.rows[0]?.count).toBe("1");
  });
});
