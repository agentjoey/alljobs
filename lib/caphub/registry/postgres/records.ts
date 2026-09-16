import type { Pool, PoolClient } from "pg";
import type { z } from "zod";
import { canonicalJson, digestCanonicalJson } from "../../analysis/digest";
import {
  registryLineageEdgeSchema,
  registryRecordIdSchema,
  registryVersionSchemaFor,
  type RegistryJsonValue
} from "../schemas";
import type { RegistryLineageStore, RegistryRecordStore } from "../contracts";
import type { RegistryLineageEdge, RegistryRecordKind, RegistryVersion } from "../types";
import {
  mapRegistryDatabaseError,
  RegistryError,
  withSerializableRegistryTransaction
} from "./database";

export type RegistryPayloadSchemas = Partial<Record<RegistryRecordKind, z.ZodType>>;

export function validateRegistryVersion(
  version: RegistryVersion,
  payloadSchemas: RegistryPayloadSchemas
): RegistryVersion {
  const payloadSchema = payloadSchemas[version.kind];
  if (!payloadSchema) throw new RegistryError("INVALID_REGISTRY_RECORD");
  const parsed = registryVersionSchemaFor(payloadSchema).safeParse(version);
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === "previous_version")) {
      throw new RegistryError("STALE_WRITE");
    }
    throw new RegistryError("INVALID_REGISTRY_RECORD");
  }
  if (digestCanonicalJson(parsed.data.payload) !== parsed.data.payload_digest) {
    throw new RegistryError("REGISTRY_DIGEST_CONFLICT");
  }
  return {
    ...parsed.data,
    created_at: isoTimestamp(parsed.data.created_at)
  } as RegistryVersion;
}

export interface RegistryRecordStoreHooks {
  afterVersionInserted?(version: RegistryVersion): Promise<void>;
}

interface VersionRow {
  record_id: string;
  version: number;
  kind: RegistryRecordKind;
  schema_version: number;
  payload: RegistryJsonValue;
  payload_digest: string;
  previous_version: number | null;
  created_at: Date | string;
}

function isoTimestamp(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new RegistryError("INVALID_REGISTRY_RECORD");
  return parsed.toISOString();
}

function rawVersion(row: VersionRow): RegistryVersion {
  return {
    record_id: row.record_id,
    version: row.version,
    kind: row.kind,
    schema_version: 1,
    payload: row.payload,
    payload_digest: row.payload_digest,
    previous_version: row.previous_version,
    created_at: isoTimestamp(row.created_at)
  };
}

export class PostgresRegistryRecordStore implements RegistryRecordStore {
  constructor(
    private readonly pool: Pool,
    private readonly payloadSchemas: RegistryPayloadSchemas,
    private readonly hooks: RegistryRecordStoreHooks = {}
  ) {}

  private validate(version: RegistryVersion): RegistryVersion {
    return validateRegistryVersion(version, this.payloadSchemas);
  }

  private parseRow(row: VersionRow): RegistryVersion {
    return this.validate(rawVersion(row));
  }

  async putVersion<T extends RegistryJsonValue>(
    input: RegistryVersion<T>
  ): Promise<{ kind: "created" | "existing"; version: number }> {
    const version = this.validate(input as RegistryVersion);
    try {
      return await withSerializableRegistryTransaction(this.pool, async (client) => {
        const current = await client.query<{ current_version: number; kind: RegistryRecordKind }>(
          "SELECT current_version, kind FROM caphub.registry_records WHERE record_id = $1 FOR UPDATE",
          [version.record_id]
        );
        if (current.rowCount === 0) {
          if (version.version !== 1 || version.previous_version !== null) {
            throw new RegistryError("STALE_WRITE");
          }
          await client.query(
            `INSERT INTO caphub.registry_records
              (record_id, kind, current_version, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $4)`,
            [version.record_id, version.kind, version.version, version.created_at]
          );
          await this.insertVersion(client, version);
          return { kind: "created", version: version.version };
        }

        if (current.rows[0]?.kind !== version.kind) throw new RegistryError("REGISTRY_DIGEST_CONFLICT");
        const existing = await this.selectVersion(client, version.record_id, version.version);
        if (existing) {
          if (canonicalJson(existing) !== canonicalJson(version)) {
            throw new RegistryError("REGISTRY_DIGEST_CONFLICT");
          }
          return { kind: "existing", version: version.version };
        }

        const currentVersion = current.rows[0]?.current_version;
        if (version.version !== currentVersion + 1 || version.previous_version !== currentVersion) {
          throw new RegistryError("STALE_WRITE");
        }
        await this.insertVersion(client, version);
        await client.query(
          `UPDATE caphub.registry_records
           SET current_version = $2, updated_at = $3
           WHERE record_id = $1 AND current_version = $4`,
          [version.record_id, version.version, version.created_at, currentVersion]
        );
        return { kind: "created", version: version.version };
      });
    } catch (error) {
      throw mapRegistryDatabaseError(error, "REGISTRY_DIGEST_CONFLICT");
    }
  }

  private async insertVersion(client: PoolClient, version: RegistryVersion): Promise<void> {
    await client.query(
      `INSERT INTO caphub.registry_versions
        (record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        version.record_id,
        version.version,
        version.kind,
        version.schema_version,
        canonicalJson(version.payload),
        version.payload_digest,
        version.previous_version,
        version.created_at
      ]
    );
    await this.hooks.afterVersionInserted?.(version);
  }

  private async selectVersion(
    client: PoolClient,
    recordId: string,
    version: number
  ): Promise<RegistryVersion | null> {
    const result = await client.query<VersionRow>(
      `SELECT record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at
       FROM caphub.registry_versions WHERE record_id = $1 AND version = $2`,
      [recordId, version]
    );
    return result.rows[0] ? this.parseRow(result.rows[0]) : null;
  }

  async getVersion(recordId: string, version: number): Promise<RegistryVersion | null> {
    if (!registryRecordIdSchema.safeParse(recordId).success || !Number.isInteger(version) || version <= 0) {
      throw new RegistryError("INVALID_REGISTRY_RECORD");
    }
    try {
      const result = await this.pool.query<VersionRow>(
        `SELECT record_id, version, kind, schema_version, payload, payload_digest, previous_version, created_at
         FROM caphub.registry_versions WHERE record_id = $1 AND version = $2`,
        [recordId, version]
      );
      return result.rows[0] ? this.parseRow(result.rows[0]) : null;
    } catch (error) {
      throw mapRegistryDatabaseError(error);
    }
  }

  async getCurrent(recordId: string): Promise<RegistryVersion | null> {
    if (!registryRecordIdSchema.safeParse(recordId).success) {
      throw new RegistryError("INVALID_REGISTRY_RECORD");
    }
    try {
      const result = await this.pool.query<VersionRow>(
        `SELECT v.record_id, v.version, v.kind, v.schema_version, v.payload,
                v.payload_digest, v.previous_version, v.created_at
         FROM caphub.registry_records r
         JOIN caphub.registry_versions v
           ON v.record_id = r.record_id AND v.version = r.current_version
         WHERE r.record_id = $1`,
        [recordId]
      );
      return result.rows[0] ? this.parseRow(result.rows[0]) : null;
    } catch (error) {
      throw mapRegistryDatabaseError(error);
    }
  }
}

interface LineageRow {
  from_node_id: string;
  from_kind: RegistryLineageEdge["from_kind"];
  from_version: number;
  from_digest: string;
  relationship: RegistryLineageEdge["relationship"];
  to_node_id: string;
  to_kind: RegistryLineageEdge["to_kind"];
  to_version: number;
  to_digest: string;
  created_at: Date | string;
}

export function lineageRowToDomain(row: LineageRow): RegistryLineageEdge {
  const parsed = registryLineageEdgeSchema.safeParse({
    schema_version: 1,
    from_record_id: row.from_node_id,
    from_kind: row.from_kind,
    from_version: row.from_version,
    from_digest: row.from_digest,
    relationship: row.relationship,
    to_record_id: row.to_node_id,
    to_kind: row.to_kind,
    to_version: row.to_version,
    to_digest: row.to_digest,
    created_at: isoTimestamp(row.created_at)
  });
  if (!parsed.success) throw new RegistryError("LINEAGE_CONFLICT");
  return parsed.data;
}

export class PostgresRegistryLineageStore implements RegistryLineageStore {
  constructor(private readonly pool: Pool) {}

  async put(input: RegistryLineageEdge): Promise<"created" | "existing"> {
    const parsed = registryLineageEdgeSchema.safeParse(input);
    if (!parsed.success) throw new RegistryError("LINEAGE_CONFLICT");
    const edge = parsed.data;
    try {
      const inserted = await this.pool.query(
        `INSERT INTO caphub.registry_lineage
          (from_node_id, from_kind, from_version, from_digest, relationship,
           to_node_id, to_kind, to_version, to_digest, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT DO NOTHING
         RETURNING from_node_id`,
        [edge.from_record_id, edge.from_kind, edge.from_version, edge.from_digest, edge.relationship,
          edge.to_record_id, edge.to_kind, edge.to_version, edge.to_digest, edge.created_at]
      );
      if (inserted.rowCount === 1) return "created";
      const existing = await this.findExact(edge);
      if (!existing || canonicalJson(existing) !== canonicalJson(edge)) {
        throw new RegistryError("LINEAGE_CONFLICT");
      }
      return "existing";
    } catch (error) {
      throw mapRegistryDatabaseError(error, "LINEAGE_CONFLICT");
    }
  }

  private async findExact(edge: RegistryLineageEdge): Promise<RegistryLineageEdge | null> {
    const result = await this.pool.query<LineageRow>(
      `SELECT * FROM caphub.registry_lineage
       WHERE from_node_id=$1 AND from_version=$2 AND relationship=$3
         AND to_node_id=$4 AND to_version=$5`,
      [edge.from_record_id, edge.from_version, edge.relationship, edge.to_record_id, edge.to_version]
    );
    return result.rows[0] ? lineageRowToDomain(result.rows[0]) : null;
  }

  async listFrom(recordId: string, version: number): Promise<RegistryLineageEdge[]> {
    if (!registryRecordIdSchema.safeParse(recordId).success || !Number.isInteger(version) || version <= 0) {
      throw new RegistryError("LINEAGE_CONFLICT");
    }
    try {
      const result = await this.pool.query<LineageRow>(
        `SELECT * FROM caphub.registry_lineage
         WHERE from_node_id=$1 AND from_version=$2
         ORDER BY relationship, to_node_id, to_version`,
        [recordId, version]
      );
      return result.rows.map(lineageRowToDomain);
    } catch (error) {
      throw mapRegistryDatabaseError(error, "LINEAGE_CONFLICT");
    }
  }
}
