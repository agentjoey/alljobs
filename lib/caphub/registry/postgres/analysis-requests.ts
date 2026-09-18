import type { Pool } from "pg";
import type { AnalysisLease, RequestState } from "../../automation/contracts";

export interface RequestOutcome {
  state: Exclude<RequestState, "queued" | "running">;
  jobId?: string; reviewRequestId?: string; errorCode?: string;
}
export class AnalysisRequests {
  constructor(private readonly pool: Pool) {}
  async ensure(captureId: string, now: Date): Promise<void> {
    await this.pool.query(`INSERT INTO caphub.analysis_requests
      (capture_id,contract,state,job_id,review_request_id,error_code,created_at,updated_at)
      SELECT r.record_id,'caphub-analysis-v4',
        CASE WHEN rr.state='WAITING_FOR_REVIEW' THEN 'waiting_for_review'
          WHEN rr.request_id IS NOT NULL THEN 'completed'
          WHEN j.payload->>'status' IN ('failed','HUMAN_REVIEW_REQUIRED') THEN 'needs_attention' ELSE 'queued' END,
        j.record_id,rr.request_id,j.payload->>'reason',$2,$2
      FROM caphub.registry_records r LEFT JOIN LATERAL (
        SELECT v.record_id,v.payload FROM caphub.registry_records jr JOIN caphub.registry_versions v
          ON v.record_id=jr.record_id AND v.version=jr.current_version
        WHERE jr.kind='analysis_job' AND v.payload->>'capture_id'=r.record_id
          AND v.payload->>'analysis_contract_version'='caphub-analysis-v4'
        ORDER BY jr.created_at DESC,jr.record_id DESC LIMIT 1
      ) j ON true LEFT JOIN caphub.review_requests rr ON rr.request_id=j.payload->>'review_request_id'
      WHERE r.record_id=$1 AND r.kind='capture' ON CONFLICT DO NOTHING`, [captureId,now.toISOString()]);
  }
  async claim(ownerToken: string, now: Date): Promise<AnalysisLease | null> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      // Serialize the global concurrency decision across worker processes.
      await db.query("SELECT pg_advisory_xact_lock(hashtext('caphub.worker'),0)");
      const row = await db.query<{ capture_id: string }>(`WITH next AS (
        SELECT capture_id,contract FROM caphub.analysis_requests
        WHERE (state='queued' OR (state='running' AND lease_until <= $1))
          AND NOT EXISTS (SELECT 1 FROM caphub.analysis_requests WHERE state='running' AND lease_until > $1)
        ORDER BY created_at,capture_id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE caphub.analysis_requests r SET state='running',owner_token=$2,
          lease_until=$1::timestamptz + interval '120 seconds',updated_at=$1
        FROM next WHERE r.capture_id=next.capture_id AND r.contract=next.contract RETURNING r.capture_id`, [now.toISOString(),ownerToken]);
      await db.query("COMMIT");
      return row.rows[0] ? { captureId: row.rows[0].capture_id, contract: "caphub-analysis-v4", ownerToken } : null;
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  }
  async heartbeat(lease: AnalysisLease, now: Date): Promise<boolean> {
    const result = await this.pool.query(`UPDATE caphub.analysis_requests SET lease_until=$4::timestamptz+interval '120 seconds',updated_at=$4
      WHERE capture_id=$1 AND contract=$2 AND owner_token=$3 AND state='running' AND lease_until>$4`,
    [lease.captureId,lease.contract,lease.ownerToken,now.toISOString()]);
    return result.rowCount === 1;
  }
  async finish(lease: AnalysisLease, outcome: RequestOutcome, now: Date): Promise<boolean> {
    const result = await this.pool.query(`UPDATE caphub.analysis_requests SET state=$5,owner_token=NULL,lease_until=NULL,
      job_id=$6,review_request_id=$7,error_code=$8,updated_at=$4
      WHERE capture_id=$1 AND contract=$2 AND owner_token=$3 AND state='running' AND lease_until>$4`,
    [lease.captureId,lease.contract,lease.ownerToken,now.toISOString(),outcome.state,outcome.jobId ?? null,outcome.reviewRequestId ?? null,outcome.errorCode ?? null]);
    return result.rowCount === 1;
  }
  async summary() {
    return (await this.pool.query<{ state: string; count: string }>("SELECT state,count(*)::text AS count FROM caphub.analysis_requests GROUP BY state ORDER BY state")).rows;
  }
}
