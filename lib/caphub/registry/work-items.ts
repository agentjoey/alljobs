import "server-only";
import type { Pool } from "pg";
import { z } from "zod";

const band = z.enum(["high","medium","low","unknown"]).nullable().default(null);
const inputSchema = z.object({
  limit: z.number().int().min(1).max(25).default(25), cursor: z.string().min(1).max(255).nullable().default(null),
  state: z.enum(["received","queued","running","waiting_for_review","needs_attention","completed","filename_conflict"]).nullable().default(null),
  reviewState: z.enum(["WAITING_FOR_REVIEW","APPROVED","REJECTED","REVOKED","SUPERSEDED"]).nullable().default(null),
  valueBand: band, riskBand: band, waitingAgeBand: z.enum(["fresh","aging","overdue"]).nullable().default(null),
  reviewKind: z.enum(["candidate","build","implementation","release","update","deployment"]).nullable().default(null)
}).strict();
export type WorkItemsInput = z.input<typeof inputSchema>;
export interface CaphubWorkItem {
  filenameKey: string; filename: string; version: number; captureId: string; state: string;
  createdAt: string; recommendation: string | null; valueScore: number | null; riskScore: number | null;
  reviewRequestId: string | null; historyCount: number; href: string;
}
export interface CaphubWorkItems { items: CaphubWorkItem[]; total: number; counts: Record<string,number>; nextCursor: string | null; registryMs: number }

export async function getCaphubWorkItems(pool: Pool, raw: WorkItemsInput = {}): Promise<CaphubWorkItems> {
  const input = inputSchema.parse(raw);
  const start = performance.now();
  const result = await pool.query<{ items: Omit<CaphubWorkItem,"href">[]; total: number; counts: Record<string,number> }>(`
    WITH current_files AS (
      SELECT h.filename_key,h.capture_id,h.version,false AS unresolved FROM caphub.capture_filename_heads h
      UNION ALL
      SELECT lower(normalize(btrim(v.payload #>> '{source,original_filename}'),NFC)) AS filename_key,
        min(r.record_id),0,true FROM caphub.registry_records r
      JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
      LEFT JOIN caphub.capture_filename_versions fv ON fv.capture_id=r.record_id
      WHERE r.kind='capture' AND fv.capture_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM caphub.capture_filename_heads h WHERE h.filename_key=lower(normalize(btrim(v.payload #>> '{source,original_filename}'),NFC)))
      GROUP BY lower(normalize(btrim(v.payload #>> '{source,original_filename}'),NFC))
    ), projected AS (
      SELECT f.filename_key AS "filenameKey",v.payload #>> '{source,original_filename}' AS filename,
        f.version,f.capture_id AS "captureId",COALESCE(rr.created_at,r.created_at) AS "createdAt",
        CASE WHEN f.unresolved THEN 'filename_conflict' WHEN rr.state='WAITING_FOR_REVIEW' THEN 'waiting_for_review'
          WHEN rr.request_id IS NOT NULL THEN 'completed'
          WHEN j.status IN ('failed','HUMAN_REVIEW_REQUIRED') THEN 'needs_attention'
          WHEN q.state IS NOT NULL THEN q.state WHEN j.status='running' THEN 'running' ELSE 'received' END AS state,
        rr.request_id AS "reviewRequestId",rr.state AS review_state,rr.review_kind,
        p.payload->>'recommended_disposition' AS recommendation,
        (p.payload #>> '{dimensions,capability_value,score}')::int AS "valueScore",
        (p.payload #>> '{dimensions,security_risk,score}')::int AS "riskScore",
        (SELECT count(*)::int-1 FROM caphub.capture_filename_versions f2 WHERE f2.filename_key=f.filename_key) AS "historyCount"
      FROM current_files f JOIN caphub.registry_records r ON r.record_id=f.capture_id
      JOIN caphub.registry_versions v ON v.record_id=r.record_id AND v.version=r.current_version
      LEFT JOIN caphub.analysis_requests q ON q.capture_id=f.capture_id AND q.contract='caphub-analysis-v4'
      LEFT JOIN LATERAL (
        SELECT jv.payload->>'status' AS status FROM caphub.registry_records jr JOIN caphub.registry_versions jv
          ON jv.record_id=jr.record_id AND jv.version=jr.current_version
        WHERE jr.kind='analysis_job' AND jv.payload->>'capture_id'=f.capture_id
          AND NOT EXISTS (SELECT 1 FROM caphub.registry_records nr JOIN caphub.registry_versions nv ON nv.record_id=nr.record_id AND nv.version=nr.current_version
            WHERE nr.kind='analysis_job' AND nv.payload->>'supersedes_job_id'=jr.record_id)
        ORDER BY jr.created_at DESC,jr.record_id DESC LIMIT 1
      ) j ON true
      LEFT JOIN LATERAL (
        SELECT i.source_review_packet_id,i.review_request_id FROM caphub.registry_lineage l
        JOIN caphub.registry_imports i ON i.source_review_packet_id=l.to_node_id
        JOIN caphub.review_requests rq ON rq.request_id=i.review_request_id
        WHERE l.from_node_id=f.capture_id AND l.relationship='derived_as'
        ORDER BY (rq.state='WAITING_FOR_REVIEW') DESC,i.imported_at DESC,i.import_id DESC LIMIT 1
      ) imp ON true LEFT JOIN caphub.review_requests rr ON rr.request_id=imp.review_request_id
      LEFT JOIN caphub.registry_records pr ON pr.record_id=imp.source_review_packet_id
      LEFT JOIN caphub.registry_versions p ON p.record_id=pr.record_id AND p.version=pr.current_version
    ), filtered AS (
      SELECT * FROM projected WHERE ($1::text IS NULL OR state=$1) AND ($2::text IS NULL OR review_state=$2)
        AND ($3::text IS NULL OR CASE WHEN "valueScore">=4 THEN 'high' WHEN "valueScore">=2 THEN 'medium' WHEN "valueScore" IS NOT NULL THEN 'low' ELSE 'unknown' END=$3)
        AND ($4::text IS NULL OR CASE WHEN "riskScore">=4 THEN 'high' WHEN "riskScore">=2 THEN 'medium' WHEN "riskScore" IS NOT NULL THEN 'low' ELSE 'unknown' END=$4)
        AND ($5::text IS NULL OR CASE WHEN CURRENT_TIMESTAMP-"createdAt"<=interval '24 hours' THEN 'fresh' WHEN CURRENT_TIMESTAMP-"createdAt"<=interval '7 days' THEN 'aging' ELSE 'overdue' END=$5)
        AND ($6::text IS NULL OR review_kind=$6)
    ), page AS (SELECT * FROM filtered WHERE ($7::text IS NULL OR "filenameKey">$7) ORDER BY "filenameKey" LIMIT $8)
    SELECT (SELECT count(*)::int FROM filtered) AS total,
      COALESCE((SELECT jsonb_object_agg(state,n) FROM (SELECT state,count(*)::int AS n FROM filtered GROUP BY state) c),'{}'::jsonb) AS counts,
      COALESCE((SELECT jsonb_agg(to_jsonb(page)-'review_state'-'review_kind' ORDER BY "filenameKey") FROM page),'[]'::jsonb) AS items
  `,[input.state,input.reviewState,input.valueBand,input.riskBand,input.waitingAgeBand,input.reviewKind,input.cursor,input.limit+1]);
  const row = result.rows[0];
  const page = row.items.slice(0,input.limit);
  return { total: row.total,counts: row.counts,nextCursor: row.items.length>input.limit ? page.at(-1)!.filenameKey : null,
    registryMs: Math.round(performance.now()-start),
    items: page.map(item=>({ ...item,historyCount: Math.max(0,item.historyCount),href: item.reviewRequestId ? `/caphub/reviews/${item.reviewRequestId}` : `/caphub/captures/${item.captureId}` })) };
}
