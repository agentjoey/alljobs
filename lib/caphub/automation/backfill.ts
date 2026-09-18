import type { Pool, PoolClient } from "pg";
import { normalizeCaptureFilename } from "./filename";
import { digestCanonicalJson } from "../analysis/digest";

interface LegacyCapture { id: string; filename: string; digest: string; createdAt: string; priority: number }
export function selectCanonicalCaptures(records: LegacyCapture[]) {
  const groups = new Map<string, LegacyCapture[]>();
  for (const row of records) {
    const key = normalizeCaptureFilename(row.filename);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const ready: { filenameKey: string; canonical: LegacyCapture; members: LegacyCapture[] }[] = [];
  const conflicts: { filenameKey: string; members: LegacyCapture[]; groupDigest: string }[] = [];
  for (const [filenameKey, members] of groups) {
    if (new Set(members.map(row => row.digest)).size > 1) {
      const identity = members.map(({ id, digest }) => ({ id, digest })).sort((a, b) => a.id.localeCompare(b.id));
      conflicts.push({ filenameKey, members, groupDigest: digestCanonicalJson(identity) }); continue;
    }
    members.sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    ready.push({ filenameKey, canonical: members[0], members });
  }
  return { ready, conflicts };
}

export interface BackfillResolution { filenameKey: string; expectedGroupDigest: string; currentCaptureId: string }
export function resolveBackfillConflicts(report: ReturnType<typeof selectCanonicalCaptures>, resolutions: BackfillResolution[]) {
  const ready = [...report.ready];
  const resolved = new Set<string>();
  for (const resolution of resolutions) {
    const group = report.conflicts.find(row => row.filenameKey === resolution.filenameKey);
    if (!group || group.groupDigest !== resolution.expectedGroupDigest || resolved.has(resolution.filenameKey)) throw new Error("BACKFILL_CONFLICT_STALE");
    const current = group.members.find(row => row.id === resolution.currentCaptureId);
    if (!current) throw new Error("BACKFILL_SELECTION_INVALID");
    const digests = [...new Set(group.members.map(row => row.digest))].filter(digest => digest !== current.digest).sort();
    digests.push(current.digest);
    for (const digest of digests) {
      const members = group.members.filter(row => row.digest === digest);
      const canonical = digest === current.digest ? current : selectCanonicalCaptures(members).ready[0].canonical;
      ready.push({ filenameKey: group.filenameKey, canonical, members });
    }
    resolved.add(group.filenameKey);
  }
  return { ready, conflicts: report.conflicts.filter(row => !resolved.has(row.filenameKey)) };
}

export async function inspectAutomationBackfill(db: Pool | PoolClient) {
  const result = await db.query(`SELECT r.record_id AS id,
    v.payload #>> '{source,original_filename}' AS filename, v.payload #>> '{object,digest}' AS digest,
    r.created_at::text AS "createdAt",
    CASE WHEN EXISTS (SELECT 1 FROM caphub.registry_lineage l JOIN caphub.registry_imports i
      ON i.source_review_packet_id=l.to_node_id WHERE l.from_node_id=r.record_id AND l.relationship='derived_as') THEN 3
    WHEN EXISTS (SELECT 1 FROM caphub.registry_lineage l WHERE l.from_node_id=r.record_id AND l.relationship='derived_as') THEN 2
    WHEN EXISTS (SELECT 1 FROM caphub.registry_versions j WHERE j.kind='analysis_job' AND j.payload->>'capture_id'=r.record_id) THEN 1
    ELSE 0 END AS priority
    FROM caphub.registry_records r JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
    WHERE r.kind='capture'`);
  return selectCanonicalCaptures(result.rows as LegacyCapture[]);
}

export async function applyAutomationBackfill(pool: Pool, resolutions: BackfillResolution[] = []) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Deployment runs with intake disabled; lock heads to prevent accidental concurrent backfills.
    await client.query("LOCK TABLE caphub.capture_filename_heads IN EXCLUSIVE MODE");
    const result = resolveBackfillConflicts(await inspectAutomationBackfill(client), resolutions);
    const versions = new Map<string, number>();
    const existingHeads = new Set((await client.query<{filename_key: string}>("SELECT filename_key FROM caphub.capture_filename_heads")).rows.map(row => row.filename_key));
    for (const group of result.ready) {
      // A rerun must not reassign identities after browser intake has advanced a head.
      if (existingHeads.has(group.filenameKey)) continue;
      const row = group.canonical;
      const version = (versions.get(group.filenameKey) ?? 0) + 1;
      versions.set(group.filenameKey, version);
      await client.query(`INSERT INTO caphub.capture_filename_heads VALUES ($1,$2,$3,$5,$4)
        ON CONFLICT (filename_key) DO UPDATE SET capture_id=excluded.capture_id,digest=excluded.digest,
          version=excluded.version,updated_at=excluded.updated_at`, [group.filenameKey, row.id, row.digest, row.createdAt, version]);
      for (const member of group.members) {
        await client.query(`INSERT INTO caphub.capture_filename_versions VALUES ($1,$2,$6,$3,$4,$5)
          ON CONFLICT (capture_id) DO NOTHING`, [member.id, group.filenameKey, row.id, member.digest, member.createdAt, version]);
      }
    }
    // Every reference, even unresolved/unsuccessful, protects its shared object.
    await client.query(`INSERT INTO caphub.capture_object_retention (capture_id,digest)
      SELECT r.record_id,v.payload #>> '{object,digest}' FROM caphub.registry_records r
      JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
      WHERE r.kind='capture' ON CONFLICT DO NOTHING`);
    await client.query(`UPDATE caphub.capture_object_retention t SET imported_at=x.imported_at,
      eligible_at=x.imported_at + interval '30 days'
      FROM (SELECT fv.capture_id, min(i.imported_at) AS imported_at
        FROM caphub.capture_filename_versions fv
        JOIN caphub.registry_lineage l ON l.from_node_id=fv.canonical_capture_id AND l.relationship='derived_as'
        JOIN caphub.registry_imports i ON i.source_review_packet_id=l.to_node_id GROUP BY fv.capture_id) x
      WHERE t.capture_id=x.capture_id AND t.imported_at IS NULL`);
    await client.query("COMMIT");
    return { readyCount: result.ready.length, conflicts: result.conflicts };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
