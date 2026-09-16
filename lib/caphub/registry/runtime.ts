import "server-only";

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
  constructor(readonly code: "REGISTRY_DISABLED" | "REGISTRY_UNAVAILABLE") {
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
    const poolOptions: ConstructorParameters<typeof Pool>[0] = {
      connectionString: databaseUrl,
      max: registry.maxConnections,
      statement_timeout: registry.statementTimeoutMs,
      ssl: registry.sslMode === "require" ? { rejectUnauthorized: true } : undefined
    };
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
  } catch {
    if (useSharedRuntime) sharedRuntime = null;
    throw new RegistryRuntimeError("REGISTRY_UNAVAILABLE");
  }
}
