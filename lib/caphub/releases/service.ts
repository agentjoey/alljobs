import { researchDossierSchema } from "../analysis/schemas";
import { digestCanonicalJson } from "../analysis/digest";
import type { P4ErrorCode } from "../packages/types";
import { confirmationFor } from "../registry/confirmations";
import type {
  RegistryExportStore,
  RegistryLineageStore,
  RegistryRecordStore,
  ReviewStore
} from "../registry/contracts";
import { PostgresExportStoreError } from "../registry/postgres/exports";
import type { RegistrySafeErrorCode, RegistryVersion, ReviewRequest } from "../registry/types";
import { composeCapabilityPackage, licenseFromDossierText, type LearnKind } from "./compose";

export type ReleaseServiceErrorCode =
  | P4ErrorCode
  | RegistrySafeErrorCode
  | "INVALID_REGISTRY_RECORD"
  | "LINEAGE_CONFLICT";

export class ReleaseServiceError extends Error {
  constructor(
    readonly code: ReleaseServiceErrorCode,
    readonly diagnostics: string[] = []
  ) {
    super(diagnostics.join("; ") || code);
    this.name = "ReleaseServiceError";
  }
}

export interface ReleaseServiceDependencies {
  exports: RegistryExportStore;
  records: Pick<RegistryRecordStore, "getCurrent">;
  reviews: Pick<ReviewStore, "getDecision" | "getRequest">;
  lineage: Pick<RegistryLineageStore, "listTo">;
  packets: {
    readPayload(artifactId: string): Promise<unknown | null>;
  };
  clock?: () => string;
}

export interface CreateCandidateInput {
  candidateId: string;
  approvalDecisionId: string;
  learnKind?: LearnKind;
}

export interface FinalizeApprovalInput {
  releaseId: string;
  approvalDecisionId: string;
}

function mapExportError(error: unknown): ReleaseServiceError {
  if (error instanceof PostgresExportStoreError) {
    const code: ReleaseServiceErrorCode = error.code === "REGISTRY_DIGEST_CONFLICT"
      ? "PACKAGE_DIGEST_CONFLICT"
      : error.code;
    return new ReleaseServiceError(code);
  }
  if (error instanceof ReleaseServiceError) return error;
  throw error;
}

export class ReleaseService {
  private readonly clock: () => string;

  constructor(private readonly deps: ReleaseServiceDependencies) {
    this.clock = deps.clock ?? (() => new Date().toISOString());
  }

  async createCandidate(input: CreateCandidateInput): Promise<{
    status: "created" | "existing";
    release: RegistryVersion;
  }> {
    const decision = await this.deps.reviews.getDecision(input.approvalDecisionId);
    if (!decision || decision.action !== "approve" || decision.review_kind !== "candidate") {
      throw new ReleaseServiceError("INVALID_REVIEW_DECISION");
    }
    if (decision.subject_id !== input.candidateId) {
      throw new ReleaseServiceError("INVALID_REVIEW_DECISION");
    }

    const candidate = await this.deps.records.getCurrent(input.candidateId);
    if (!candidate || candidate.kind !== "candidate") {
      throw new ReleaseServiceError("INVALID_REGISTRY_RECORD");
    }
    if (decision.subject_digest !== candidate.payload_digest) {
      throw new ReleaseServiceError("STALE_REVIEW");
    }

    const packetEdge = (await this.deps.lineage.listTo(candidate.record_id, candidate.version))
      .find((edge) => edge.from_kind === "review_packet" && edge.relationship === "proposes");
    if (!packetEdge) {
      throw new ReleaseServiceError("INVALID_REGISTRY_RECORD", ["candidate has no proposing review packet lineage"]);
    }
    const packet = await this.deps.records.getCurrent(packetEdge.from_record_id);
    if (!packet || packet.kind !== "review_packet"
      || packet.version !== packetEdge.from_version
      || packet.payload_digest !== packetEdge.from_digest) {
      throw new ReleaseServiceError("STALE_REVIEW");
    }

    const researchArtifactId = (packet.payload as { stage_artifact_ids?: { research?: string } }).stage_artifact_ids?.research;
    let license = null;
    if (researchArtifactId) {
      const dossierPayload = await this.deps.packets.readPayload(researchArtifactId);
      if (dossierPayload) {
        const dossier = researchDossierSchema.parse(dossierPayload);
        license = licenseFromDossierText(dossier.license);
      }
    }

    const disposition = decision.disposition;
    if (!disposition) throw new ReleaseServiceError("INVALID_REVIEW_DECISION");
    const composition = composeCapabilityPackage({
      candidateVersion: candidate,
      reviewPacket: packet.payload,
      disposition,
      learnKind: input.learnKind,
      license,
      now: this.clock()
    });
    if (!composition.ok) {
      throw new ReleaseServiceError(composition.code, composition.diagnostics);
    }

    // Cross-call idempotency: a retry after a successful first call returns
    // the already-recorded Release even though the wall-clock created_at of
    // the new composition differs from the original.
    const existingRelease = await this.deps.records.getCurrent(composition.pkg.release_id);
    if (existingRelease && existingRelease.kind === "release") {
      return { status: "existing", release: existingRelease };
    }

    const release: RegistryVersion = {
      record_id: composition.pkg.release_id,
      kind: "release",
      version: 1,
      schema_version: 1,
      payload: composition.pkg,
      payload_digest: digestCanonicalJson(composition.pkg),
      previous_version: null,
      created_at: this.clock()
    };
    const reviewRequest: ReviewRequest = {
      schema_version: 1,
      id: this.reviewRequestId(release),
      review_kind: "release",
      subject_id: release.record_id,
      subject_kind: "release",
      subject_version: release.version,
      subject_digest: release.payload_digest,
      lock_version: 1,
      state: "WAITING_FOR_REVIEW",
      approve_confirmation: confirmationFor({ review_kind: "release", subject_id: release.record_id }, "approve"),
      reject_confirmation: confirmationFor({ review_kind: "release", subject_id: release.record_id }, "reject"),
      superseded_by_request_id: null,
      created_at: this.clock(),
      updated_at: this.clock()
    };

    try {
      const status = await this.deps.exports.composeRelease({
        release,
        candidateApprovalDecisionId: decision.id,
        lineage: [{
          schema_version: 1,
          from_record_id: candidate.record_id,
          from_kind: "candidate",
          from_version: candidate.version,
          from_digest: candidate.payload_digest,
          relationship: "realized_as",
          to_record_id: release.record_id,
          to_kind: "release",
          to_version: release.version,
          to_digest: release.payload_digest,
          created_at: this.clock()
        }],
        reviewRequest
      });
      return { status, release };
    } catch (error) {
      throw mapExportError(error);
    }
  }

  async finalizeApproval(input: FinalizeApprovalInput): Promise<{ status: "finalized" | "existing" }> {
    const release = await this.deps.records.getCurrent(input.releaseId);
    if (!release || release.kind !== "release") {
      throw new ReleaseServiceError("INVALID_REGISTRY_RECORD");
    }
    const decision = await this.deps.reviews.getDecision(input.approvalDecisionId);
    if (!decision || decision.action !== "approve" || decision.review_kind !== "release") {
      throw new ReleaseServiceError("INVALID_REVIEW_DECISION");
    }
    if (decision.subject_id !== release.record_id || decision.subject_digest !== release.payload_digest) {
      throw new ReleaseServiceError("STALE_REVIEW");
    }

    try {
      const status = await this.deps.exports.finalizeRelease({
        releaseRecordId: release.record_id,
        releaseVersion: release.version,
        releaseDigest: release.payload_digest,
        releaseApprovalDecisionId: decision.id
      });
      return { status };
    } catch (error) {
      throw mapExportError(error);
    }
  }

  private reviewRequestId(release: RegistryVersion): string {
    return releaseReviewRequestId(release);
  }
}

export function releaseReviewRequestId(release: RegistryVersion): string {
  return `rev_${digestCanonicalJson({
    schema_version: 1,
    review_kind: "release",
    subject_id: release.record_id,
    subject_version: release.version,
    subject_digest: release.payload_digest
  }).slice(0, 32)}`;
}
