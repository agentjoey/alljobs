import { z } from "zod";
import {
  analysisJobIdSchema,
  claimIdSchema,
  entityIdSchema,
  evidenceIdSchema,
  reviewPacketIdSchema,
  sha256DigestSchema,
  stageArtifactIdSchema
} from "../analysis/schemas";
import { captureIdSchema, idempotencyKeySchema } from "../domain/schemas";

const timestampSchema = z.string().datetime({ offset: true });
const rationaleSchema = z.string().max(2_000);

export const registryRecordKindSchema = z.enum([
  "capture",
  "analysis_job",
  "analysis_artifact",
  "review_packet",
  "entity",
  "claim",
  "evidence",
  "candidate",
  "experience_card",
  "build_proposal",
  "release",
  "deployment",
  "deployment_plan",
  "usage_observation"
]);

export const reviewRequestIdSchema = z.string().regex(/^rev_[a-f0-9]{32}$/);
export const reviewDecisionIdSchema = z.string().regex(/^dec_[a-f0-9]{32}$/);
export const registryImportIdSchema = z.string().regex(/^imp_[a-f0-9]{32}$/);
export const registryAuditEventIdSchema = z.string().regex(/^rae_[a-f0-9]{32}$/);

const candidateIdSchema = z.string().regex(/^cand_[a-f0-9]{32}$/);
const experienceCardIdSchema = z.string().regex(/^exp_[a-f0-9]{32}$/);
const buildProposalIdSchema = z.string().regex(/^bld_[a-f0-9]{32}$/);
const releaseIdSchema = z.string().regex(/^rel_[a-f0-9]{32}$/);
const deploymentIdSchema = z.string().regex(/^dep_[a-f0-9]{32}$/);
const deploymentPlanIdSchema = z.string().regex(/^dpl_[a-f0-9]{32}$/);
const usageObservationIdSchema = z.string().regex(/^obs_[a-f0-9]{32}$/);

export const registryRecordIdSchema = z.union([
  captureIdSchema,
  analysisJobIdSchema,
  stageArtifactIdSchema,
  reviewPacketIdSchema,
  entityIdSchema,
  claimIdSchema,
  evidenceIdSchema,
  candidateIdSchema,
  experienceCardIdSchema,
  buildProposalIdSchema,
  releaseIdSchema,
  deploymentIdSchema,
  deploymentPlanIdSchema,
  usageObservationIdSchema
]);

export type RegistryJsonValue =
  | null
  | boolean
  | number
  | string
  | RegistryJsonValue[]
  | { [key: string]: RegistryJsonValue };

export const registryJsonValueSchema: z.ZodType<RegistryJsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.array(registryJsonValueSchema),
  z.record(z.string(), registryJsonValueSchema)
]));

const recordPrefixByKind: Record<z.infer<typeof registryRecordKindSchema>, string> = {
  capture: "cap_",
  analysis_job: "job_",
  analysis_artifact: "art_",
  review_packet: "rvp_",
  entity: "ent_",
  claim: "clm_",
  evidence: "ev_",
  candidate: "cand_",
  experience_card: "exp_",
  build_proposal: "bld_",
  release: "rel_",
  deployment: "dep_",
  deployment_plan: "dpl_",
  usage_observation: "obs_"
};

export function registryVersionSchemaFor<T extends z.ZodType>(payloadSchema: T) {
  return z.object({
    record_id: registryRecordIdSchema,
    kind: registryRecordKindSchema,
    version: z.number().int().positive(),
    schema_version: z.literal(1),
    payload: payloadSchema,
    payload_digest: sha256DigestSchema,
    previous_version: z.number().int().positive().nullable(),
    created_at: timestampSchema
  }).strict().superRefine((version, context) => {
    if (!version.record_id.startsWith(recordPrefixByKind[version.kind])) {
      context.addIssue({
        code: "custom",
        path: ["record_id"],
        message: `record_id must use the ${recordPrefixByKind[version.kind]} prefix for ${version.kind}`
      });
    }
    const expectedPrevious = version.version === 1 ? null : version.version - 1;
    if (version.previous_version !== expectedPrevious) {
      context.addIssue({
        code: "custom",
        path: ["previous_version"],
        message: "previous_version must name the immediately preceding immutable version"
      });
    }
  });
}

export const registryVersionSchema = registryVersionSchemaFor(registryJsonValueSchema);

export const registryLineageRelationshipSchema = z.enum([
  "analyzed_by",
  "produced",
  "contributes_to",
  "derived_as",
  "contains",
  "identifies",
  "proposes",
  "approved_as",
  "realized_as",
  "deployed_as",
  "observed_as",
  "decided_by"
]);

export const registryLineageNodeKindSchema = z.union([
  registryRecordKindSchema,
  z.enum(["review_request", "review_decision"])
]);

const lineageNodeIdSchema = z.union([
  registryRecordIdSchema,
  reviewRequestIdSchema,
  reviewDecisionIdSchema
]);

const lineagePrefixByKind: Record<z.infer<typeof registryLineageNodeKindSchema>, string> = {
  ...recordPrefixByKind,
  review_request: "rev_",
  review_decision: "dec_"
};

const allowedLineage = new Set([
  "capture:analyzed_by:analysis_job",
  "analysis_job:produced:analysis_artifact",
  "analysis_artifact:contributes_to:review_packet",
  "capture:derived_as:review_packet",
  "review_packet:contains:evidence",
  "review_packet:identifies:entity",
  "review_packet:contains:claim",
  "review_packet:proposes:candidate",
  "candidate:approved_as:experience_card",
  "candidate:approved_as:build_proposal",
  "candidate:realized_as:release",
  "build_proposal:realized_as:release",
  "release:deployed_as:deployment",
  "release:proposes:deployment_plan",
  "deployment_plan:realized_as:deployment",
  "deployment:observed_as:usage_observation",
  "review_request:decided_by:review_decision"
]);

export const registryLineageEdgeSchema = z.object({
  schema_version: z.literal(1),
  from_record_id: lineageNodeIdSchema,
  from_kind: registryLineageNodeKindSchema,
  from_version: z.number().int().positive(),
  from_digest: sha256DigestSchema,
  relationship: registryLineageRelationshipSchema,
  to_record_id: lineageNodeIdSchema,
  to_kind: registryLineageNodeKindSchema,
  to_version: z.number().int().positive(),
  to_digest: sha256DigestSchema,
  created_at: timestampSchema
}).strict().superRefine((edge, context) => {
  const relationship = `${edge.from_kind}:${edge.relationship}:${edge.to_kind}`;
  if (!allowedLineage.has(relationship)) {
    context.addIssue({ code: "custom", path: ["relationship"], message: "lineage relationship is not allowed" });
  }
  if (!edge.from_record_id.startsWith(lineagePrefixByKind[edge.from_kind])) {
    context.addIssue({ code: "custom", path: ["from_record_id"], message: "from record ID does not match kind" });
  }
  if (!edge.to_record_id.startsWith(lineagePrefixByKind[edge.to_kind])) {
    context.addIssue({ code: "custom", path: ["to_record_id"], message: "to record ID does not match kind" });
  }
  if (edge.from_record_id === edge.to_record_id && edge.from_version === edge.to_version) {
    context.addIssue({ code: "custom", path: ["to_record_id"], message: "lineage endpoints must be distinct" });
  }
});

export const reviewKindSchema = z.enum(["candidate", "build", "implementation", "release", "update", "deployment"]);
export const reviewStateSchema = z.enum([
  "WAITING_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
  "REVOKED",
  "SUPERSEDED"
]);
export const reviewActionSchema = z.enum(["approve", "reject", "revoke"]);
export const candidateReviewDispositionSchema = z.enum(["adopt", "adapt", "build", "learn", "watch"]);

export const reviewSubjectKindSchema = z.enum([
  "candidate",
  "build_proposal",
  "implementation_asset",
  "release",
  "update_proposal",
  "deployment_plan"
]);

const implementationAssetIdSchema = z.string().regex(/^impl_[a-f0-9]{32}$/);
const updateProposalIdSchema = z.string().regex(/^upd_[a-f0-9]{32}$/);
const reviewSubjectIdSchema = z.union([
  candidateIdSchema,
  buildProposalIdSchema,
  implementationAssetIdSchema,
  releaseIdSchema,
  updateProposalIdSchema,
  deploymentPlanIdSchema
]);

const kindSubjectKind: Record<z.infer<typeof reviewKindSchema>, z.infer<typeof reviewSubjectKindSchema>> = {
  candidate: "candidate",
  build: "build_proposal",
  implementation: "implementation_asset",
  release: "release",
  update: "update_proposal",
  deployment: "deployment_plan"
};

const reviewSubjectPrefixByKind: Record<z.infer<typeof reviewSubjectKindSchema>, string> = {
  candidate: "cand_",
  build_proposal: "bld_",
  implementation_asset: "impl_",
  release: "rel_",
  update_proposal: "upd_",
  deployment_plan: "dpl_"
};

function subjectShortId(subjectId: string): string {
  return subjectId.slice(subjectId.indexOf("_") + 1, subjectId.indexOf("_") + 9).toLowerCase();
}

function confirmationFor(
  kind: z.infer<typeof reviewKindSchema>,
  action: "approve" | "reject" | "revoke",
  subjectId: string
): string {
  const verb = action === "approve" && kind === "implementation" ? "ACCEPT" : action.toUpperCase();
  return `${verb} ${kind.toUpperCase()} ${subjectShortId(subjectId)}`;
}

export const reviewRequestSchema = z.object({
  schema_version: z.literal(1),
  id: reviewRequestIdSchema,
  review_kind: reviewKindSchema,
  subject_id: reviewSubjectIdSchema,
  subject_kind: reviewSubjectKindSchema,
  subject_version: z.number().int().positive(),
  subject_digest: sha256DigestSchema,
  lock_version: z.number().int().positive(),
  state: reviewStateSchema,
  approve_confirmation: z.string().max(96),
  reject_confirmation: z.string().max(96),
  superseded_by_request_id: reviewRequestIdSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema
}).strict().superRefine((request, context) => {
  if (request.subject_kind !== kindSubjectKind[request.review_kind]) {
    context.addIssue({ code: "custom", path: ["subject_kind"], message: "subject kind does not match review kind" });
  }
  if (!request.subject_id.startsWith(reviewSubjectPrefixByKind[request.subject_kind])) {
    context.addIssue({ code: "custom", path: ["subject_id"], message: "subject ID does not match subject kind" });
  }
  if (request.approve_confirmation !== confirmationFor(request.review_kind, "approve", request.subject_id)) {
    context.addIssue({ code: "custom", path: ["approve_confirmation"], message: "approve confirmation is not exact" });
  }
  if (request.reject_confirmation !== confirmationFor(request.review_kind, "reject", request.subject_id)) {
    context.addIssue({ code: "custom", path: ["reject_confirmation"], message: "reject confirmation is not exact" });
  }
  if (request.state === "SUPERSEDED") {
    if (!request.superseded_by_request_id || request.superseded_by_request_id === request.id) {
      context.addIssue({
        code: "custom",
        path: ["superseded_by_request_id"],
        message: "superseded requests must point to a different latest request"
      });
    }
  } else if (request.superseded_by_request_id !== null) {
    context.addIssue({
      code: "custom",
      path: ["superseded_by_request_id"],
      message: "only superseded requests may point to a newer request"
    });
  }
});

const decisionConfirmationSchema = z.string().max(96).regex(
  /^(?:APPROVE|ACCEPT|REJECT|REVOKE) (?:CANDIDATE|BUILD|IMPLEMENTATION|RELEASE|UPDATE|DEPLOYMENT) [a-f0-9]{8}$/
);

const reviewDecisionInputBase = {
  request_id: reviewRequestIdSchema,
  idempotency_key: idempotencyKeySchema,
  expected_lock_version: z.number().int().positive(),
  expected_subject_digest: sha256DigestSchema,
  action: reviewActionSchema,
  confirmation: decisionConfirmationSchema,
  rationale: rationaleSchema,
  disposition: candidateReviewDispositionSchema.optional(),
  original_approval_decision_id: reviewDecisionIdSchema.optional()
};

export const reviewDecisionInputSchema = z.object(reviewDecisionInputBase).strict().superRefine((decision, context) => {
  if ((decision.action === "reject" || decision.action === "revoke") && decision.rationale.trim().length === 0) {
    context.addIssue({ code: "custom", path: ["rationale"], message: `${decision.action} requires rationale` });
  }
  if (decision.action === "revoke" && !decision.original_approval_decision_id) {
    context.addIssue({
      code: "custom",
      path: ["original_approval_decision_id"],
      message: "revoke requires the original approval decision ID"
    });
  }
  if (decision.action !== "revoke" && decision.original_approval_decision_id) {
    context.addIssue({
      code: "custom",
      path: ["original_approval_decision_id"],
      message: "only revoke may name an original approval decision"
    });
  }
  if (decision.action !== "approve" && decision.disposition) {
    context.addIssue({ code: "custom", path: ["disposition"], message: "only approve may include disposition" });
  }
});

export const reviewDecisionSchema = z.object({
  schema_version: z.literal(1),
  id: reviewDecisionIdSchema,
  ...reviewDecisionInputBase,
  review_kind: reviewKindSchema,
  subject_id: reviewSubjectIdSchema,
  subject_version: z.number().int().positive(),
  subject_digest: sha256DigestSchema,
  actor: z.literal("human:owner"),
  confirmation_digest: sha256DigestSchema,
  original_approval_decision_id: reviewDecisionIdSchema.nullable(),
  revokes_decision_id: reviewDecisionIdSchema.nullable(),
  recorded_at: timestampSchema
}).strict().superRefine((decision, context) => {
  const expectedSubjectKind = kindSubjectKind[decision.review_kind];
  if (!decision.subject_id.startsWith(reviewSubjectPrefixByKind[expectedSubjectKind])) {
    context.addIssue({ code: "custom", path: ["subject_id"], message: "subject ID does not match review kind" });
  }
  if (decision.subject_digest !== decision.expected_subject_digest) {
    context.addIssue({
      code: "custom",
      path: ["expected_subject_digest"],
      message: "decision must bind the stored subject digest exactly"
    });
  }
  const expectedConfirmation = confirmationFor(decision.review_kind, decision.action, decision.subject_id);
  if (decision.confirmation !== expectedConfirmation) {
    context.addIssue({ code: "custom", path: ["confirmation"], message: "confirmation is not exact" });
  }
  if (decision.action === "approve" && decision.review_kind === "candidate" && !decision.disposition) {
    context.addIssue({ code: "custom", path: ["disposition"], message: "Candidate approval requires disposition" });
  }
  if ((decision.action !== "approve" || decision.review_kind !== "candidate") && decision.disposition) {
    context.addIssue({ code: "custom", path: ["disposition"], message: "disposition is only valid for Candidate approval" });
  }
  if ((decision.action === "reject" || decision.action === "revoke") && decision.rationale.trim().length === 0) {
    context.addIssue({ code: "custom", path: ["rationale"], message: `${decision.action} requires rationale` });
  }
  if (decision.action === "revoke") {
    if (!decision.original_approval_decision_id || decision.revokes_decision_id !== decision.original_approval_decision_id) {
      context.addIssue({
        code: "custom",
        path: ["revokes_decision_id"],
        message: "revoke must link exactly one original approval decision"
      });
    }
  } else if (decision.original_approval_decision_id !== null || decision.revokes_decision_id !== null) {
    context.addIssue({
      code: "custom",
      path: ["original_approval_decision_id"],
      message: "only revoke may link an original approval decision"
    });
  }
});

export const reviewDecisionAuthoritySchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unconsumed"), consumedBy: z.null(), revocable: z.literal(true) }).strict(),
  z.object({ state: z.literal("consumed"), consumedBy: registryRecordIdSchema, revocable: z.literal(false) }).strict()
]);

export const registryImportRecordSchema = z.object({
  record_id: registryRecordIdSchema,
  kind: registryRecordKindSchema,
  version: z.number().int().positive(),
  payload_digest: sha256DigestSchema
}).strict().superRefine((record, context) => {
  if (!record.record_id.startsWith(recordPrefixByKind[record.kind])) {
    context.addIssue({ code: "custom", path: ["record_id"], message: "record ID does not match import kind" });
  }
});

export const registryImportManifestSchema = z.object({
  schema_version: z.literal(1),
  id: registryImportIdSchema,
  source_review_packet_id: z.string().regex(/^rvp_[a-f0-9]{32}$/),
  source_review_packet_digest: sha256DigestSchema,
  records: z.array(registryImportRecordSchema).min(1).max(500),
  review_request_id: reviewRequestIdSchema,
  imported_at: timestampSchema
}).strict().superRefine((manifest, context) => {
  const identities = new Set<string>();
  manifest.records.forEach((record, index) => {
    const identity = `${record.record_id}:${record.version}`;
    if (identities.has(identity)) {
      context.addIssue({ code: "custom", path: ["records", index], message: "import records must be unique" });
    }
    identities.add(identity);
  });
});

export const registryAuditEventSchema = z.object({
  schema_version: z.literal(1),
  id: registryAuditEventIdSchema,
  type: z.enum([
    "registry.imported",
    "review.requested",
    "review.decided",
    "review.revoked",
    "review.consumed"
  ]),
  actor: z.enum(["system:caphub", "human:owner"]),
  subject_id: registryRecordIdSchema,
  subject_version: z.number().int().positive(),
  decision_id: reviewDecisionIdSchema.nullable(),
  metadata: registryJsonValueSchema,
  occurred_at: timestampSchema
}).strict();

export const registrySafeErrorCodeSchema = z.enum([
  "REGISTRY_DISABLED",
  "REGISTRY_UNAVAILABLE",
  "REGISTRY_DIGEST_CONFLICT",
  "STALE_WRITE",
  "STALE_REVIEW",
  "REVIEW_ALREADY_TERMINAL",
  "IDEMPOTENCY_CONFLICT",
  "DECISION_ALREADY_CONSUMED",
  "INVALID_REVIEW_DECISION"
]);

const approvalDecisionSchema = reviewDecisionSchema.refine(
  (decision) => decision.action === "approve",
  { path: ["action"], message: "authority is only present for approval decisions" }
);
const nonApprovalDecisionSchema = reviewDecisionSchema.refine(
  (decision) => decision.action === "reject" || decision.action === "revoke",
  { path: ["action"], message: "non-approval result requires reject or revoke" }
);

export const reviewDecisionResultSchema = z.union([
  z.object({ decision: approvalDecisionSchema, authority: reviewDecisionAuthoritySchema }).strict(),
  z.object({ decision: nonApprovalDecisionSchema, authority: z.null() }).strict()
]);
