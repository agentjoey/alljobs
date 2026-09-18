import { chmodSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { startCaphubTestPostgres } from "../../../tests/helpers/caphub-postgres";
import { applyRegistryMigrations } from "./migrate";
import { loadControlHostRegistryRuntime } from "./runtime";
import { NeonS3CaptureObjectStore } from "../storage/neon-s3";

const registryConfig = {
  enabled: true,
  databaseUrlEnv: "CAPHUB_DATABASE_URL",
  migrationDatabaseUrlEnv: "CAPHUB_MIGRATION_DATABASE_URL",
  connectionMode: "tls_verify_full" as const,
  managedHosts: ["registry.example.test"],
  maxConnections: 4,
  statementTimeoutMs: 5_000
};

describe.sequential("Control Host Registry runtime", () => {
  let postgres: CaphubTestPostgres;
  let root: string;

  beforeAll(async () => {
    postgres = await startCaphubTestPostgres();
    await applyRegistryMigrations(postgres.pool);
    root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "alljobs-caphub-review-e2e-")));
    mkdirSync(join(root, "home", "state", "caphub"), { recursive: true, mode: 0o700 });
    chmodSync(join(root, "home"), 0o700);
    chmodSync(join(root, "home", "state", "caphub"), 0o700);
  }, 30_000);

  afterAll(async () => {
    await postgres?.stop();
    if (dirname(root) !== realpathSync(tmpdir())
      || !basename(root).startsWith("alljobs-caphub-review-e2e-")
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
    const objectRoot = join(root, "home", "state", "caphub");
    let options: ConstructorParameters<typeof import("pg").Pool>[0] | undefined;
    const runtime = await loadControlHostRegistryRuntime({
      config: { caphubEnabled: true, registry: registryConfig },
      homeDir: join(root, "home"),
      objectRoot,
      env: { CAPHUB_DATABASE_URL: "postgresql://caphub_app:fixture-secret@registry.example.test/caphub" },
      poolFactory: (value) => { options = value; return postgres.pool; }
    });
    expect(options).toMatchObject({
      host: "registry.example.test",
      port: 5_432,
      database: "caphub",
      user: "caphub_app",
      password: "fixture-secret",
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 15_000
    });
    expect(options).not.toHaveProperty("connectionString");
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

  it("uses the configured Neon object adapter without a local fallback", async () => {
    const objectRoot = join(root, "home", "state", "caphub");
    let constructed = 0;
    const runtime = await loadControlHostRegistryRuntime({
      config: {
        caphubEnabled: true,
        registry: registryConfig,
        storage: {
          mode: "neon_s3",
          bucket: "caphub-objects",
          accessKeyIdEnv: "CAPHUB_S3_ACCESS_KEY_ID",
          secretAccessKeyEnv: "CAPHUB_S3_SECRET_ACCESS_KEY",
          endpointEnv: "CAPHUB_S3_ENDPOINT",
          regionEnv: "CAPHUB_S3_REGION",
          managedEndpointHosts: ["storage.example.test"]
        }
      },
      homeDir: join(root, "home"),
      objectRoot,
      env: {
        CAPHUB_DATABASE_URL: "postgresql://caphub_app:fixture-secret@registry.example.test/caphub",
        CAPHUB_S3_ACCESS_KEY_ID: "fixture-access",
        CAPHUB_S3_SECRET_ACCESS_KEY: "fixture-secret",
        CAPHUB_S3_ENDPOINT: "https://storage.example.test",
        CAPHUB_S3_REGION: "aws-ap-southeast-1"
      },
      poolFactory: () => postgres.pool,
      objectPortFactory: () => {
        constructed += 1;
        return {
          head: async () => null,
          putIfAbsent: async () => undefined,
          get: async () => new Uint8Array(),
          list: async () => []
        };
      }
    });
    expect(constructed).toBe(1);
    expect(runtime.objects).toBeInstanceOf(NeonS3CaptureObjectStore);
  });

  it("rejects unsafe Neon storage before constructing a database pool or S3 command port", async () => {
    let poolConstructed = false;
    let portConstructed = false;
    await expect(loadControlHostRegistryRuntime({
      config: {
        caphubEnabled: true,
        registry: registryConfig,
        storage: {
          mode: "neon_s3",
          bucket: "caphub-objects",
          accessKeyIdEnv: "CAPHUB_S3_ACCESS_KEY_ID",
          secretAccessKeyEnv: "CAPHUB_S3_SECRET_ACCESS_KEY",
          endpointEnv: "CAPHUB_S3_ENDPOINT",
          regionEnv: "CAPHUB_S3_REGION",
          managedEndpointHosts: ["storage.example.test"]
        }
      },
      homeDir: join(root, "home"),
      objectRoot: join(root, "home", "state", "caphub"),
      env: {
        CAPHUB_DATABASE_URL: "postgresql://caphub_app:fixture-secret@registry.example.test/caphub",
        CAPHUB_S3_ACCESS_KEY_ID: "fixture-access",
        CAPHUB_S3_SECRET_ACCESS_KEY: "fixture-secret",
        CAPHUB_S3_ENDPOINT: "http://storage.example.test",
        CAPHUB_S3_REGION: "aws-ap-southeast-1"
      },
      poolFactory: () => { poolConstructed = true; return postgres.pool; },
      objectPortFactory: () => {
        portConstructed = true;
        return { head: async () => null, putIfAbsent: async () => undefined, get: async () => new Uint8Array(), list: async () => [] };
      }
    })).rejects.toMatchObject({ code: "REGISTRY_UNAVAILABLE" });
    expect(poolConstructed).toBe(false);
    expect(portConstructed).toBe(false);
  });

  it("rejects connection-string attempts to downgrade the required production TLS policy", async () => {
    let constructed = false;
    await expect(loadControlHostRegistryRuntime({
      config: { caphubEnabled: true, registry: registryConfig },
      homeDir: join(root, "home"),
      objectRoot: join(root, "home", "state", "caphub"),
      env: { CAPHUB_DATABASE_URL: "postgresql://caphub_app:fixture-secret@registry.example.test/caphub?sslmode=disable" },
      poolFactory: () => { constructed = true; return postgres.pool; }
    })).rejects.toMatchObject({ code: "REGISTRY_UNAVAILABLE" });
    expect(constructed).toBe(false);
  });

  it("uses only the fixed private Control Host socket in local mode", async () => {
    const homeDir = join(root, "home");
    const socketDir = join(homeDir, "run", "caphub-postgres");
    mkdirSync(socketDir, { recursive: true, mode: 0o700 });
    chmodSync(join(homeDir, "run"), 0o700);
    chmodSync(socketDir, 0o700);
    let options: ConstructorParameters<typeof import("pg").Pool>[0] | undefined;
    const runtime = await loadControlHostRegistryRuntime({
      config: {
        caphubEnabled: true,
        registry: { ...registryConfig, connectionMode: "local_socket" }
      },
      homeDir,
      objectRoot: join(homeDir, "state", "caphub"),
      env: {
        CAPHUB_DATABASE_URL: `postgresql://caphub_app@localhost/caphub?host=${encodeURIComponent(socketDir)}&port=54329`
      },
      poolFactory: (value) => { options = value; return postgres.pool; }
    });
    expect(runtime.pool).toBe(postgres.pool);
    expect(options).toMatchObject({
      host: socketDir,
      port: 54_329,
      database: "caphub",
      user: "caphub_app",
      ssl: false
    });
    expect(options).not.toHaveProperty("connectionString");
  });

  it("allows only an owner-checked E2E socket seam to disable TLS", async () => {
    const token = "runtime-owner-token";
    writeFileSync(join(root, ".alljobs-caphub-review-e2e-fixture.json"), `${JSON.stringify({ token, ownerPid: process.pid })}\n`, { mode: 0o600 });
    let options: ConstructorParameters<typeof import("pg").Pool>[0] | undefined;
    const runtime = await loadControlHostRegistryRuntime({
      config: {
        caphubEnabled: true,
        registry: { ...registryConfig, databaseUrlEnv: "CAPHUB_E2E_DATABASE_URL" }
      },
      homeDir: join(root, "home"),
      objectRoot: join(root, "home", "state", "caphub"),
      env: {
        CAPHUB_E2E_DATABASE_URL: `postgresql://caphub_app@localhost/postgres?host=${encodeURIComponent(postgres.socketDir)}&port=${postgres.port}&sslmode=disable`,
        ALLJOBS_CAPHUB_REVIEW_E2E_ROOT: root,
        ALLJOBS_CAPHUB_REVIEW_E2E_TOKEN: token,
        ALLJOBS_CAPHUB_REVIEW_E2E_OWNER_PID: String(process.pid)
      },
      poolFactory: (value) => { options = value; return postgres.pool; }
    });
    expect(runtime.pool).toBe(postgres.pool);
    expect(options).toMatchObject({
      ssl: false,
      application_name: "alljobs-caphub-registry",
      idleTimeoutMillis: 30_000
    });
  });
});
