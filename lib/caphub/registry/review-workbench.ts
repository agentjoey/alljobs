import "server-only";
import type { Pool } from "pg";
import { captureIdSchema } from "../domain/schemas";
import { reviewRequestIdSchema } from "./schemas";
import { createRegistryQueries } from "./queries";

export interface CaptureStatus {
  captureId: string; canonicalCaptureId: string; filename: string; createdAt: string;
  state: string; stage: string | null; reviewRequestId: string | null; jobId: string | null;
  eligibleAt: string | null; purgedAt: string | null; errorCode: string | null;
}
const iso = (value: Date | string | null) => value === null ? null : new Date(value).toISOString();
export async function getCaphubCaptureStatus(pool: Pick<Pool,"query">, captureId: string): Promise<CaptureStatus | null> {
  captureIdSchema.parse(captureId);
  const result = await pool.query(`SELECT r.record_id AS capture_id,COALESCE(f.canonical_capture_id,r.record_id) AS canonical_capture_id,
    v.payload #>> '{source,original_filename}' AS filename,r.created_at,q.state,q.error_code,
    j.record_id AS job_id,j.payload->>'status' AS job_status,j.payload->>'stage' AS stage,
    rr.request_id,rr.state AS review_state,t.eligible_at,t.purged_at
    FROM caphub.registry_records r JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
    LEFT JOIN caphub.capture_filename_versions f ON f.capture_id=r.record_id
    LEFT JOIN caphub.analysis_requests q ON q.capture_id=COALESCE(f.canonical_capture_id,r.record_id) AND q.contract='caphub-analysis-v4'
    LEFT JOIN LATERAL (
      SELECT jr.record_id,jv.payload FROM caphub.registry_records jr JOIN caphub.registry_versions jv ON jv.record_id=jr.record_id AND jv.version=jr.current_version
      WHERE jr.kind='analysis_job' AND jv.payload->>'capture_id'=COALESCE(f.canonical_capture_id,r.record_id)
        AND NOT EXISTS (SELECT 1 FROM caphub.registry_records nr JOIN caphub.registry_versions nv ON nv.record_id=nr.record_id AND nv.version=nr.current_version
          WHERE nr.kind='analysis_job' AND nv.payload->>'supersedes_job_id'=jr.record_id)
      ORDER BY jr.created_at DESC,jr.record_id DESC LIMIT 1
    ) j ON true
    LEFT JOIN LATERAL (
      SELECT i.review_request_id FROM caphub.registry_lineage l JOIN caphub.registry_imports i ON i.source_review_packet_id=l.to_node_id
      WHERE l.from_node_id=COALESCE(f.canonical_capture_id,r.record_id) AND l.relationship='derived_as' ORDER BY i.imported_at DESC,i.import_id DESC LIMIT 1
    ) imp ON true LEFT JOIN caphub.review_requests rr ON rr.request_id=imp.review_request_id
    LEFT JOIN caphub.capture_object_retention t ON t.capture_id=r.record_id WHERE r.record_id=$1 AND r.kind='capture'`,[captureId]);
  const row = result.rows[0];
  if (!row) return null;
  const state = row.request_id ? (row.review_state === "WAITING_FOR_REVIEW" ? "waiting_for_review" : "completed")
    : ["failed","HUMAN_REVIEW_REQUIRED"].includes(row.job_status) ? "needs_attention" : row.state ?? (row.job_status === "running" ? "running" : "received");
  return { captureId: row.capture_id,canonicalCaptureId: row.canonical_capture_id,filename: row.filename,createdAt: iso(row.created_at)!,
    state,stage: row.stage,reviewRequestId: row.request_id,jobId: row.job_id,eligibleAt: iso(row.eligible_at),purgedAt: iso(row.purged_at),
    errorCode: row.error_code ? "ANALYSIS_NEEDS_ATTENTION" : null };
}

export async function getCaphubReviewDetail(pool: Pool, requestId: string) {
  const started = performance.now();
  reviewRequestIdSchema.parse(requestId);
  const db = await pool.connect();
  try {
    // Existing authority DTO is reused on this one connection, never once per evidence item.
    const detail = await createRegistryQueries(db as unknown as Pool).getReviewDetail(requestId);
    if (detail.kind !== "found") return detail;
    const related = await db.query(`SELECT v.payload #>> '{source,original_filename}' AS filename,
      r.record_id AS capture_id,t.eligible_at,t.purged_at,
      COALESCE((SELECT jsonb_agg(h ORDER BY h.created_at DESC,h.id DESC) FROM (
        SELECT jr.record_id AS id,jr.created_at,jv.payload->>'status' AS status,jv.payload->>'stage' AS stage,
          jv.payload->>'capture_id' AS capture_id,jv.payload->>'review_request_id' AS request_id,
          jv.payload->>'analysis_contract_version' AS contract
        FROM caphub.registry_records jr JOIN caphub.registry_versions jv ON jv.record_id=jr.record_id AND jv.version=jr.current_version
        WHERE jr.kind='analysis_job' AND (jv.payload->>'capture_id'=r.record_id OR jv.payload->>'capture_id' IN (
          SELECT vf.capture_id FROM caphub.capture_filename_versions vf WHERE vf.filename_key=f.filename_key))
        ORDER BY jr.created_at DESC,jr.record_id DESC LIMIT 25
      ) h),'[]'::jsonb) AS history
      FROM caphub.registry_imports i JOIN caphub.registry_lineage l ON l.to_node_id=i.source_review_packet_id AND l.relationship='derived_as'
      JOIN caphub.registry_records r ON r.record_id=l.from_node_id
      JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
      LEFT JOIN caphub.capture_filename_versions f ON f.capture_id=r.record_id
      LEFT JOIN caphub.capture_object_retention t ON t.capture_id=r.record_id
      WHERE i.review_request_id=$1 LIMIT 1`,[requestId]);
    const row = related.rows[0];
    return { ...detail,registryMs: Math.round(performance.now() - started),filename: row?.filename ?? detail.candidate.name,captureId: row?.capture_id ?? null,
      eligibleAt: iso(row?.eligible_at ?? null),purgedAt: iso(row?.purged_at ?? null),
      history: (row?.history ?? []) as { id: string; created_at: string; status: string; stage: string | null; contract: string | null; capture_id: string; request_id: string | null }[] };
  } finally { db.release(); }
}
export type CaphubReviewDetail = Awaited<ReturnType<typeof getCaphubReviewDetail>>;

export async function getCaptureHistory(pool: Pick<Pool,"query">, captureId: string) {
  captureIdSchema.parse(captureId);
  const result=await pool.query<{id:string;status:string;created_at:Date;contract:string|null}>(`SELECT j.record_id AS id,
    v.payload->>'status' AS status,j.created_at,v.payload->>'analysis_contract_version' AS contract
    FROM caphub.registry_records j JOIN caphub.registry_versions v ON v.record_id=j.record_id AND v.version=j.current_version
    WHERE j.kind='analysis_job' AND (v.payload->>'capture_id'=$1 OR v.payload->>'capture_id' IN (
      SELECT f.capture_id FROM caphub.capture_filename_versions f WHERE f.filename_key=(SELECT filename_key FROM caphub.capture_filename_versions WHERE capture_id=$1)))
    ORDER BY j.created_at DESC,j.record_id DESC LIMIT 25`,[captureId]);
  return result.rows;
}
