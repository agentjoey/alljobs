import type {
  RegistryAuditEvent,
  RegistryImportManifest,
  RegistryLineageEdge,
  RegistryVersion,
  ReviewDecision,
  ReviewDecisionInput,
  ReviewDecisionResult,
  ReviewRequest
} from "./types";
import type { RegistryJsonValue } from "./schemas";

export interface RegistryRecordStore {
  putVersion<T extends RegistryJsonValue>(
    version: RegistryVersion<T>
  ): Promise<{ kind: "created" | "existing"; version: number }>;
  getVersion(recordId: string, version: number): Promise<RegistryVersion | null>;
  getCurrent(recordId: string): Promise<RegistryVersion | null>;
}

export interface RegistryLineageStore {
  put(edge: RegistryLineageEdge): Promise<"created" | "existing">;
  listFrom(recordId: string, version: number): Promise<RegistryLineageEdge[]>;
  listTo(recordId: string, version: number): Promise<RegistryLineageEdge[]>;
}

export interface RegistryImportStore {
  getBySourceReviewPacket(reviewPacketId: string): Promise<RegistryImportManifest | null>;
  ensure(manifest: RegistryImportManifest): Promise<"created" | "existing">;
}

export interface RegistryAuditStore {
  append(event: RegistryAuditEvent): Promise<"appended" | "existing">;
}

export interface ReviewStore {
  createRequest(request: ReviewRequest): Promise<"created" | "existing">;
  getRequest(requestId: string): Promise<ReviewRequest | null>;
  getDecision(decisionId: string): Promise<ReviewDecision | null>;
  listDecisions(requestId: string): Promise<ReviewDecision[]>;
  decide(input: ReviewDecisionInput): Promise<ReviewDecisionResult>;
  revoke(input: ReviewDecisionInput): Promise<ReviewDecisionResult>;
  consumeDecision(decisionId: string, consumerId: string): Promise<void>;
}

export interface ComposeReleaseInput {
  release: RegistryVersion;
  candidateApprovalDecisionId: string;
  lineage: RegistryLineageEdge[];
  reviewRequest: ReviewRequest;
}

export interface FinalizeReleaseInput {
  releaseRecordId: string;
  releaseVersion: number;
  releaseDigest: string;
  releaseApprovalDecisionId: string;
}

export interface ComposeDeploymentPlanInput {
  plan: RegistryVersion;
  lineage: RegistryLineageEdge[];
  reviewRequest: ReviewRequest;
}

export interface RealizeDeploymentInput {
  deployment: RegistryVersion;
  planApprovalDecisionId: string;
  lineage: RegistryLineageEdge[];
}

/**
 * Transaction-capable export operations. Each method is atomic: either every
 * version, lineage edge, review request, and decision consumption is durable,
 * or none is. The API never exposes arbitrary SQL or raw table names.
 */
export interface RegistryExportStore {
  composeRelease(input: ComposeReleaseInput): Promise<"created" | "existing">;
  finalizeRelease(input: FinalizeReleaseInput): Promise<"finalized" | "existing">;
  composeDeploymentPlan(input: ComposeDeploymentPlanInput): Promise<"created" | "existing">;
  realizeDeployment(input: RealizeDeploymentInput): Promise<"created" | "existing">;
}
