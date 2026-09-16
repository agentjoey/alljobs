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
  listDecisions(requestId: string): Promise<ReviewDecision[]>;
  decide(input: ReviewDecisionInput): Promise<ReviewDecisionResult>;
  revoke(input: ReviewDecisionInput): Promise<ReviewDecisionResult>;
  consumeDecision(decisionId: string, consumerId: string): Promise<void>;
}
