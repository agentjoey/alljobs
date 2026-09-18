import type { Pool } from "pg";
import { registryImportManifestSchema } from "./schemas";
import type { ReviewDecisionInput, ReviewDecisionResult } from "./types";
import type { AnalysisJobStore } from "../workflow/contracts";
import type { ReviewStore } from "./contracts";
import { analysisJobSchema } from "../analysis/schemas";
import type { AnalysisJob } from "../analysis/types";

export class ReviewServiceError extends Error {
  constructor(readonly code: "REVIEW_JOB_NOT_FOUND" | "REVIEW_JOB_CONFLICT") {
    super(code);
    this.name = "ReviewServiceError";
  }
}

export interface ReviewDecisionServiceResult {
  result: ReviewDecisionResult;
  job: AnalysisJob | null;
}

export interface ReviewDecisionService {
  decide(requestId: string, input: Omit<ReviewDecisionInput, "request_id">): Promise<ReviewDecisionServiceResult>;
}

export function createReviewDecisionService(dependencies: {
  pool: Pool;
  reviews: ReviewStore;
  jobs: AnalysisJobStore;
  clock: () => string;
}): ReviewDecisionService {
  async function linkedJob(requestId: string): Promise<string> {
    const row = await dependencies.pool.query<{ manifest: unknown }>(
      "SELECT manifest FROM caphub.registry_imports WHERE review_request_id = $1",
      [requestId]
    );
    if (!row.rows[0]) throw new ReviewServiceError("REVIEW_JOB_NOT_FOUND");
    const manifest = registryImportManifestSchema.parse(row.rows[0].manifest);
    const jobs = manifest.records.filter((record) => record.kind === "analysis_job");
    if (jobs.length !== 1) throw new ReviewServiceError("REVIEW_JOB_CONFLICT");
    return jobs[0].record_id;
  }

  async function isCandidateReview(requestId: string): Promise<boolean> {
    const row = await dependencies.pool.query<{ review_kind: string }>(
      "SELECT review_kind FROM caphub.review_requests WHERE request_id = $1",
      [requestId]
    );
    return row.rows[0]?.review_kind === "candidate";
  }

  async function transitionJob(requestId: string, result: ReviewDecisionResult): Promise<AnalysisJob | null> {
    if (result.decision.action === "revoke") return null;
    // Only Candidate reviews resume an analysis job; release/deployment and
    // later-phase reviews have no linked job and must not fail here.
    if (!(await isCandidateReview(requestId))) return null;
    const jobId = await linkedJob(requestId);
    const current = await dependencies.jobs.get(jobId);
    if (!current) throw new ReviewServiceError("REVIEW_JOB_NOT_FOUND");
    if (current.status === "reviewed") {
      if (current.review_request_id !== requestId || current.review_decision_id !== result.decision.id) {
        throw new ReviewServiceError("REVIEW_JOB_CONFLICT");
      }
      return current;
    }
    if (current.status !== "WAITING_FOR_REVIEW" || current.review_request_id !== requestId) {
      throw new ReviewServiceError("REVIEW_JOB_CONFLICT");
    }
    const reviewedAt = dependencies.clock();
    const decision = result.decision.action === "approve"
      ? { outcome: "approve" as const, disposition: result.decision.disposition! }
      : { outcome: "reject" as const };
    const next = analysisJobSchema.parse({
      schema_version: 1,
      id: current.id,
      ...(current.analysis_contract_version ? { analysis_contract_version: current.analysis_contract_version } : {}),
      ...(current.supersedes_job_id ? { supersedes_job_id: current.supersedes_job_id } : {}),
      capture_id: current.capture_id,
      input_digest: current.input_digest,
      completed_artifact_ids: current.completed_artifact_ids,
      status: "reviewed",
      review_packet_artifact_id: current.review_packet_artifact_id,
      review_request_id: requestId,
      review_decision_id: result.decision.id,
      decision,
      reviewed_at: reviewedAt,
      created_at: current.created_at,
      updated_at: reviewedAt
    });
    await dependencies.jobs.put(next);
    return next;
  }

  return {
    async decide(requestId, input) {
      const full = { ...input, request_id: requestId } as ReviewDecisionInput;
      const result = full.action === "revoke"
        ? await dependencies.reviews.revoke(full)
        : await dependencies.reviews.decide(full);
      return { result, job: await transitionJob(requestId, result) };
    }
  };
}
