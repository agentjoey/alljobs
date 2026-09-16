import "server-only";

import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Pool } from "pg";
import type { loadControlHostConfig } from "../../planning/config";
import { LocalCaptureObjectStore } from "../storage/local-objects";
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
  objects: LocalCaptureObjectStore;
  jobs: PostgresAnalysisJobStore;
  artifacts: PostgresStageArtifactStore;
  modelAudits: PostgresModelCallAuditStore;
  reviews: PostgresReviewStore;
}

export interface RegistryRuntimeOptions {
  resolved?: ResolvedControlHost;
  config?: { caphubEnabled: boolean; registry: RegistryConfig };
  objectRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  poolFactory?: (options: ConstructorParameters<typeof Pool>[0]) => Pool;
}

let sharedRuntime: Promise<ControlHostRegistryRuntime> | null = null;

const E2E_ROOT_ENV = "ALLJOBS_CAPHUB_REVIEW_E2E_ROOT";
const E2E_TOKEN_ENV = "ALLJOBS_CAPHUB_REVIEW_E2E_TOKEN";
const E2E_OWNER_ENV = "ALLJOBS_CAPHUB_REVIEW_E2E_OWNER_PID";
const E2E_DATABASE_ENV = "CAPHUB_E2E_DATABASE_URL";
const E2E_SENTINEL = ".alljobs-caphub-review-e2e-fixture.json";

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
  const root = env[E2E_ROOT_ENV];
  const token = env[E2E_TOKEN_ENV];
  const ownerPid = Number(env[E2E_OWNER_ENV]);
  if (!root || !token || !Number.isSafeInteger(ownerPid) || ownerPid <= 0) {
    throw new Error("missing Registry E2E fixture ownership");
  }
  const canonicalTmp = realpathSync(tmpdir());
  assertRegularOwnedPath(root, "directory");
  if (dirname(root) !== canonicalTmp || !basename(root).startsWith("alljobs-caphub-review-e2e-")
    || objectRoot !== join(root, "home", "state", "caphub")) {
    throw new Error("unsafe Registry E2E fixture root");
  }
  const sentinelPath = join(root, E2E_SENTINEL);
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
  objectRoot: string,
  env: Readonly<Record<string, string | undefined>>,
  databaseUrl: string
): ConstructorParameters<typeof Pool>[0] {
  const fixtureSocket = isOwnedE2eSocket(registry, objectRoot, env, databaseUrl);
  const parsed = new URL(databaseUrl);
  if (!fixtureSocket && [...parsed.searchParams.keys()].some((key) => key.startsWith("ssl") || key === "uselibpqcompat")) {
    throw new Error("database URL may not override the required Registry TLS policy");
  }
  return {
    connectionString: databaseUrl,
    max: registry.maxConnections,
    statement_timeout: registry.statementTimeoutMs,
    ssl: fixtureSocket ? false : { rejectUnauthorized: true }
  };
}

export async function loadControlHostRegistryRuntime(
  options: RegistryRuntimeOptions
): Promise<ControlHostRegistryRuntime> {
  const caphub = options.resolved?.config.caphub;
  const caphubEnabled = options.config?.caphubEnabled ?? caphub?.enabled ?? false;
  const registry = options.config?.registry ?? caphub?.registry;
  if (!caphubEnabled || !registry?.enabled) throw new RegistryRuntimeError("REGISTRY_DISABLED");

  const root = options.objectRoot ?? options.resolved?.caphubStateDir;
  if (!root) throw new RegistryRuntimeError("REGISTRY_UNAVAILABLE");
  const env = options.env ?? process.env;
  const databaseUrl = env[registry.databaseUrlEnv];
  if (!databaseUrl) throw new RegistryRuntimeError("REGISTRY_UNAVAILABLE");

  const useSharedRuntime = options.resolved !== undefined
    && options.config === undefined
    && options.objectRoot === undefined
    && options.poolFactory === undefined;
  if (useSharedRuntime && sharedRuntime) return sharedRuntime;

  const createRuntime = async (): Promise<ControlHostRegistryRuntime> => {
    const poolOptions = registryPoolOptions(registry, root, env, databaseUrl);
    const pool = (options.poolFactory ?? ((value) => new Pool(value)))(poolOptions);
    return {
      pool,
      captures: new PostgresCaptureStore(pool),
      captureAudit: new PostgresCaptureAuditLog(pool),
      objects: new LocalCaptureObjectStore(root),
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
