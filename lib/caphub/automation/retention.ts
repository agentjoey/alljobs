import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { objectRefSchema } from "../domain/schemas";
import type { ObjectRef } from "../domain/types";

export interface ExactObjectDeletion { deleteExactObject(ref: ObjectRef): Promise<void> }
export async function withObjectLock<T>(pool: Pool, digest: string, operation: (db: PoolClient) => Promise<T>): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("INVALID_OBJECT_DIGEST");
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext('caphub.object'),hashtext($1))", [digest]);
    const result = await operation(db);
    await db.query("COMMIT");
    return result;
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}

export async function markImportedRetention(db: Pool | PoolClient, captureId: string, importedAt: Date) {
  await db.query(`INSERT INTO caphub.capture_object_retention (capture_id,digest,imported_at,eligible_at)
    SELECT r.record_id,v.payload #>> '{object,digest}',$2::timestamptz,$2::timestamptz+interval '30 days'
      FROM caphub.registry_records r JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
      WHERE r.kind='capture' AND (r.record_id=$1 OR r.record_id IN (
        SELECT capture_id FROM caphub.capture_filename_versions WHERE canonical_capture_id=$1))
    ON CONFLICT (capture_id) DO UPDATE SET imported_at=excluded.imported_at,eligible_at=excluded.eligible_at
      WHERE caphub.capture_object_retention.imported_at IS NULL`, [captureId,importedAt.toISOString()]);
}

export async function sweepRetention(deps: { pool: Pool; objects: ExactObjectDeletion; afterDelete?(): Promise<void> }, options: { now: Date; dryRun: boolean; limit?: number }) {
  const limit = options.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error("INVALID_RETENTION_LIMIT");
  const now = options.now.toISOString();
  const candidates = await deps.pool.query<{ digest: string }>(`SELECT DISTINCT t.digest FROM caphub.capture_object_retention t
    WHERE t.purged_at IS NULL AND t.eligible_at <= $1 AND NOT EXISTS (
      SELECT 1 FROM caphub.registry_records r JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
      LEFT JOIN caphub.capture_object_retention x ON x.capture_id=r.record_id
      WHERE r.kind='capture' AND v.payload #>> '{object,digest}'=t.digest AND x.purged_at IS NULL
        AND (x.eligible_at IS NULL OR x.eligible_at>$1)
    ) ORDER BY t.digest LIMIT $2`, [now,limit]);
  const outcomes: { digest: string; state: "eligible" | "purged" | "failed" }[] = [];
  for (const { digest } of candidates.rows) {
    const outcome = await withObjectLock(deps.pool,digest,async db => {
      const references = await db.query<{ capture_id: string; eligible_at: Date | null; purged_at: Date | null; object: ObjectRef }>(`
        SELECT r.record_id AS capture_id,t.eligible_at,t.purged_at,v.payload->'object' AS object
        FROM caphub.registry_records r JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
        LEFT JOIN caphub.capture_object_retention t ON t.capture_id=r.record_id
        WHERE r.kind='capture' AND v.payload #>> '{object,digest}'=$1`, [digest]);
      const live = references.rows.filter(row => !row.purged_at);
      if (!live.length || live.some(row => !row.eligible_at || row.eligible_at > options.now)) return null;
      const object = objectRefSchema.parse(live[0].object);
      if (object.key !== `sha256/${digest.slice(0,2)}/${digest}`) throw new Error("INVALID_OBJECT_KEY");
      if (options.dryRun) return { digest, state: "eligible" as const };
      try { await deps.objects.deleteExactObject(object); }
      catch {
        await db.query("UPDATE caphub.capture_object_retention SET error_code='OBJECT_DELETE_FAILED' WHERE digest=$1 AND purged_at IS NULL", [digest]);
        return { digest, state: "failed" as const };
      }
      await deps.afterDelete?.();
      const captures = live.map(row => row.capture_id).sort();
      await db.query("UPDATE caphub.capture_object_retention SET purged_at=$2,error_code=NULL WHERE capture_id=ANY($1::text[])", [captures,now]);
      const eventId = `evt_${createHash("sha256").update(`retention\0${digest}\0${captures.join("\0")}`).digest("hex").slice(0,32)}`;
      await db.query(`INSERT INTO caphub.audit_events (event_id,event_type,actor,subject_id,subject_version,metadata,occurred_at)
        VALUES ($1,'capture.object.retention_deleted','system:caphub',$2,1,$3,$4) ON CONFLICT DO NOTHING`,
      [eventId,captures[0],JSON.stringify({ digest,capture_ids: captures }),now]);
      return { digest, state: "purged" as const };
    });
    if (outcome) outcomes.push(outcome);
  }
  return outcomes;
}
