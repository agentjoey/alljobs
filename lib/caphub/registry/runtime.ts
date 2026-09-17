import "server-only";

import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Pool } from "pg";
import type { loadControlHostConfig } from "../../planning/config";
import type { ReadableCaptureObjectStore } from "../storage/contracts";
import { LocalCaptureObjectStore } from "../storage/local-objects";
import {
  createNeonS3CommandPort,
  NeonS3CaptureObjectStore,
  parseNeonS3Environment,
  type NeonS3Environment,
  type S3ImmutableCommandPort
} from "../storage/neon-s3";
import { parseRegistryConnection } from "./connection";
import {
  PostgresAnalysisJobStore,
  PostgresCaptureAuditLog,
  PostgresCaptureStore,
  PostgresModelCallAuditStore,
  PostgresStageArtifactStore
} from "./postgres/caphub-stores";
import { PostgresReviewStore } from "./postgres/reviews";

type ResolvedControlHost = ReturnType<typeof loadControlHostConfig>;
type RegistryConfig = NonNullable<NonNullable<ResolvedControlHost["config"]["caphub"]>["registry"]>;
type StorageConfig = NonNullable<NonNullable<ResolvedControlHost["config"]["caphub"]>["storage"]>;

export class RegistryRuntimeError extends Error {
  constructor(
    readonly code: "REGISTRY_DISABLED" | "REGISTRY_UNAVAILABLE",
    readonly cause?: unknown
  ) {
    super(code === "REGISTRY_DISABLED" ? "Registry is disabled" : "Registry is unavailable");
    this.name = "RegistryRuntimeError";
  }
}

export interface ControlHostRegistryRuntime {
  pool: Pool;
  captures: PostgresCaptureStore;
  captureAudit: PostgresCaptureAuditLog;
  objects: ReadableCaptureObjectStore;
  jobs: PostgresAnalysisJobStore;
  artifacts: PostgresStageArtifactStore;
  modelAudits: PostgresModelCallAuditStore;
  reviews: PostgresReviewStore;
}

export interface RegistryRuntimeOptions {
  resolved?: ResolvedControlHost;
  config?: { caphubEnabled: boolean; registry: RegistryConfig; storage?: StorageConfig };
  homeDir?: string;
  objectRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  poolFactory?: (options: ConstructorParameters<typeof Pool>[0]) => Pool;
  objectPortFactory?: (environment: NeonS3Environment) => S3ImmutableCommandPort;
}

let sharedRuntime: Promise<ControlHostRegistryRuntime> | null = null;

const E2E_ROOT_ENV = "ALLJOBS_CAPHUB_REVIEW_E2E_ROOT";
const E2E_TOKEN_ENV = "ALLJOBS_CAPHUB_REVIEW_E2E_TOKEN";
const E2E_OWNER_ENV = "ALLJOBS_CAPHUB_REVIEW_E2E_OWNER_PID";
const P4_ROOT_ENV = "ALLJOBS_CAPHUB_P4_E2E_ROOT";
const P4_TOKEN_ENV = "ALLJOBS_CAPHUB_P4_E2E_TOKEN";
const P4_OWNER_ENV = "ALLJOBS_CAPHUB_P4_E2E_OWNER_PID";
const E2E_DATABASE_ENV = "CAPHUB_E2E_DATABASE_URL";
const E2E_SENTINEL = ".alljobs-caphub-review-e2e-fixture.json";
const P4_SENTINEL = ".alljobs-caphub-p4-e2e-fixture.json";

function assertRegularOwnedPath(path: string, kind: "file" | "directory"): void {
  const metadata = lstatSync(path);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : metadata.uid;
  const matchesKind = kind === "file" ? metadata.isFile() : metadata.isDirectory();
  if (!matchesKind || metadata.isSymbolicLink() || metadata.uid !== currentUid || realpathSync(path) !== path) {
    throw new Error("unsafe Registry E2E fixture path");
  }
}

function isOwnedE2eSocket(
  registry: RegistryConfig,
  objectRoot: string,
  env: Readonly<Record<string, string | undefined>>,
  databaseUrl: string
): boolean {
  if (registry.databaseUrlEnv !== E2E_DATABASE_ENV) return false;
  const root = env[E2E_ROOT_ENV] ?? env[P4_ROOT_ENV];
  const token = env[E2E_TOKEN_ENV] ?? env[P4_TOKEN_ENV];
  const ownerPid = Number(env[E2E_OWNER_ENV] ?? env[P4_OWNER_ENV]);
  if (!root || !token || !Number.isSafeInteger(ownerPid) || ownerPid <= 0) {
    throw new Error("missing Registry E2E fixture ownership");
  }
  const canonicalTmp = realpathSync(tmpdir());
  assertRegularOwnedPath(root, "directory");
  const ownedPrefix = basename(root).startsWith("alljobs-caphub-review-e2e-")
    || basename(root).startsWith("alljobs-caphub-p4-e2e-");
  if (dirname(root) !== canonicalTmp || !ownedPrefix
    || objectRoot !== join(root, "home", "state", "caphub")) {
    throw new Error("unsafe Registry E2E fixture root");
  }
  const sentinelName = basename(root).startsWith("alljobs-caphub-p4-e2e-") ? P4_SENTINEL : E2E_SENTINEL;
  const sentinelPath = join(root, sentinelName);
  assertRegularOwnedPath(sentinelPath, "file");
  const sentinel = JSON.parse(readFileSync(sentinelPath, "utf8")) as { token?: unknown; ownerPid?: unknown };
  if (sentinel.token !== token || sentinel.ownerPid !== ownerPid) {
    throw new Error("unowned Registry E2E fixture");
  }

  const parsed = new URL(databaseUrl);
  const socketDir = parsed.searchParams.get("host");
  const port = parsed.searchParams.get("port");
  const allowedParameters = new Set(["host", "port", "sslmode"]);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
    || parsed.username !== "caphub_app" || parsed.password !== ""
    || parsed.hostname !== "localhost" || parsed.pathname !== "/postgres"
    || !socketDir || !port || !/^\d{4,5}$/.test(port)
    || parsed.searchParams.get("sslmode") !== "disable"
    || [...parsed.searchParams.keys()].some((key) => !allowedParameters.has(key))) {
    throw new Error("invalid Registry E2E socket connection");
  }
  assertRegularOwnedPath(socketDir, "directory");
  const postgresRoot = dirname(socketDir);
  if (dirname(postgresRoot) !== realpathSync("/private/tmp") || !basename(postgresRoot).startsWith("caphub-pg-")) {
    throw new Error("unsafe Registry E2E PostgreSQL root");
  }
  assertRegularOwnedPath(postgresRoot, "directory");
  const postgresSentinelPath = join(postgresRoot, ".caphub-postgres-sentinel.json");
  assertRegularOwnedPath(postgresSentinelPath, "file");
  const postgresSentinel = JSON.parse(readFileSync(postgresSentinelPath, "utf8")) as {
    schemaVersion?: unknown;
    rootDir?: unknown;
    socketDir?: unknown;
    ownerUid?: unknown;
    postmasterPid?: unknown;
  };
  const currentUid = typeof process.getuid === "function" ? process.getuid() : postgresSentinel.ownerUid;
  const postmasterPid = Number(postgresSentinel.postmasterPid);
  const actualPostmasterPid = Number.parseInt(
    readFileSync(join(postgresRoot, "data", "postmaster.pid"), "utf8").split("\n", 1)[0] ?? "",
    10
  );
  if (postgresSentinel.schemaVersion !== 1 || postgresSentinel.rootDir !== postgresRoot
    || postgresSentinel.socketDir !== socketDir || postgresSentinel.ownerUid !== currentUid
    || !Number.isSafeInteger(postmasterPid) || postmasterPid <= 1 || postmasterPid !== actualPostmasterPid) {
    throw new Error("unowned Registry E2E PostgreSQL cluster");
  }
  process.kill(postmasterPid, 0);
  return true;
}

function registryPoolOptions(
  registry: RegistryConfig,
  resolvedHome: string,
  objectRoot: string,
  env: Readonly<Record<string, string | undefined>>,
  databaseUrl: string
): ConstructorParameters<typeof Pool>[0] {
  const fixtureSocket = isOwnedE2eSocket(registry, objectRoot, env, databaseUrl);
  const connection = fixtureSocket
    ? (() => {
      const fixture = new URL(databaseUrl);
      return {
        host: fixture.searchParams.get("host") as string,
        port: Number(fixture.searchParams.get("port")),
        database: "postgres",
        user: "caphub_app",
        ssl: false as const
      };
    })()
    : parseRegistryConnection({
      databaseUrl,
      mode: registry.connectionMode,
      role: "application",
      resolvedHome,
      managedHosts: registry.managedHosts
    });
  return {
    ...connection,
    max: registry.maxConnections,
    statement_timeout: registry.statementTimeoutMs,
    application_name: "alljobs-caphub-registry",
    idleTimeoutMillis: 30_000
  };
}

function registryObjectStore(input: {
  storage: StorageConfig | undefined;
  root: string;
  env: Readonly<Record<string, string | undefined>>;
  portFactory?: (environment: NeonS3Environment) => S3ImmutableCommandPort;
}): ReadableCaptureObjectStore {
  if (input.storage?.mode !== "neon_s3") return new LocalCaptureObjectStore(input.root);
  const environment = parseNeonS3Environment({
    bucket: input.storage.bucket,
    refs: input.storage,
    env: input.env
  });
  return new NeonS3CaptureObjectStore({
    port: (input.portFactory ?? createNeonS3CommandPort)(environment)
  });
}

export async function loadControlHostRegistryRuntime(
  options: RegistryRuntimeOptions
): Promise<ControlHostRegistryRuntime> {
  const caphub = options.resolved?.config.caphub;
  const caphubEnabled = options.config?.caphubEnabled ?? caphub?.enabled ?? false;
  const registry = options.config?.registry ?? caphub?.registry;
  const storage = options.config?.storage ?? caphub?.storage;
  if (!caphubEnabled || !registry?.enabled) throw new RegistryRuntimeError("REGISTRY_DISABLED");

  const root = options.objectRoot ?? options.resolved?.caphubStateDir;
  const homeDir = options.homeDir ?? options.resolved?.homeDir;
  if (!root || !homeDir) throw new RegistryRuntimeError("REGISTRY_UNAVAILABLE");
  const env = options.env ?? process.env;
  const databaseUrl = env[registry.databaseUrlEnv];
  if (!databaseUrl) throw new RegistryRuntimeError("REGISTRY_UNAVAILABLE");

  const useSharedRuntime = options.resolved !== undefined
    && options.config === undefined
    && options.homeDir === undefined
    && options.objectRoot === undefined
    && options.poolFactory === undefined
    && options.objectPortFactory === undefined;
  if (useSharedRuntime && sharedRuntime) return sharedRuntime;

  const createRuntime = async (): Promise<ControlHostRegistryRuntime> => {
    const objects = registryObjectStore({
      storage,
      root,
      env,
      portFactory: options.objectPortFactory
    });
    const poolOptions = registryPoolOptions(registry, homeDir, root, env, databaseUrl);
    const pool = (options.poolFactory ?? ((value) => new Pool(value)))(poolOptions);
    return {
      pool,
      captures: new PostgresCaptureStore(pool),
      captureAudit: new PostgresCaptureAuditLog(pool),
      objects,
      jobs: new PostgresAnalysisJobStore(pool),
      artifacts: new PostgresStageArtifactStore(pool),
      modelAudits: new PostgresModelCallAuditStore(pool),
      reviews: new PostgresReviewStore(pool)
    };
  };

  try {
    const pending = createRuntime();
    if (useSharedRuntime) sharedRuntime = pending;
    return await pending;
  } catch (error) {
    if (useSharedRuntime) sharedRuntime = null;
    throw new RegistryRuntimeError("REGISTRY_UNAVAILABLE", error);
  }
}
