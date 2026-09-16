import type { Pool, PoolClient } from "pg";

export type RegistryInternalErrorCode =
  | "REGISTRY_UNAVAILABLE"
  | "REGISTRY_DIGEST_CONFLICT"
  | "STALE_WRITE"
  | "INVALID_REGISTRY_RECORD"
  | "LINEAGE_CONFLICT";

const SAFE_MESSAGES: Record<RegistryInternalErrorCode, string> = {
  REGISTRY_UNAVAILABLE: "Registry storage is unavailable",
  REGISTRY_DIGEST_CONFLICT: "Registry record digest conflicts with immutable state",
  STALE_WRITE: "Registry record version is stale",
  INVALID_REGISTRY_RECORD: "Registry record is invalid",
  LINEAGE_CONFLICT: "Registry lineage is invalid"
};

export class RegistryError extends Error {
  readonly code: RegistryInternalErrorCode;

  constructor(code: RegistryInternalErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = "RegistryError";
    this.code = code;
  }
}
function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export function mapRegistryDatabaseError(
  error: unknown,
  constraintCode: RegistryInternalErrorCode = "REGISTRY_UNAVAILABLE"
): RegistryError {
  if (error instanceof RegistryError) return error;
  const code = postgresCode(error);
  if (code === "40001" || code === "40P01") return new RegistryError("STALE_WRITE");
  if (code?.startsWith("23")) return new RegistryError(constraintCode);
  return new RegistryError("REGISTRY_UNAVAILABLE");
}

export async function withSerializableRegistryTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect().catch((error) => {
    throw mapRegistryDatabaseError(error);
  });
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the safe operation error.
    }
    throw error;
  } finally {
    client.release();
  }
}
