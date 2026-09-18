import { z } from "zod";
import { captureIdSchema, objectRefSchema } from "../domain/schemas";

export const sha256DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const evidenceIdSchema = z.string().regex(/^ev_[a-f0-9]{32}$/);
export const claimIdSchema = z.string().regex(/^clm_[a-f0-9]{32}$/);
export const entityIdSchema = z.string().regex(/^ent_[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
export const analysisJobIdSchema = z.string().regex(/^job_[a-f0-9]{32}$/);
export const stageArtifactIdSchema = z.string().regex(/^art_[a-f0-9]{64}$/);
export const reviewPacketIdSchema = z.string().regex(/^rvp_[a-f0-9]{32}$/);
export const modelCallIdSchema = z.string().regex(/^call_[a-f0-9]{32}$/);
export const modelCallEventIdSchema = z.string().regex(/^mce_[a-f0-9]{32}$/);

export const analysisStageSchema = z.enum([
  "preprocess",
  "extraction",
  "research",
  "assessment",
  "critic",
  "review_packet"
]);

export const dispositionSchema = z.enum(["adopt", "adapt", "build", "learn", "watch", "reject"]);
export const contentRegionKindSchema = z.enum([
  "platform_ui",
  "subtitle",
  "comment",
  "body",
  "unknown"
]);

const httpsUrlSchema = z.string().url().max(2048).refine(
  (value) => new URL(value).protocol === "https:",
  "Evidence URLs must use HTTPS"
);
const timestampSchema = z.string().datetime({ offset: true });
const nonEmptyTextSchema = z.string().trim().min(1);
const evidenceIdsSchema = z.array(evidenceIdSchema).min(1);
const confidenceSchema = z.number().min(0).max(1);

export const boundingBoxSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive()
}).strict();

export const contentRegionSchema = z.object({
  kind: contentRegionKindSchema,
  bbox: boundingBoxSchema,
  text: z.string().optional()
}).strict();

export const ocrBlockSchema = z.object({
  text: nonEmptyTextSchema,
  confidence: confidenceSchema,
  bbox: boundingBoxSchema
}).strict();

export const preprocessImageSchema = z.object({
  index: z.number().int().nonnegative(),
  source_object: objectRefSchema,
  original_digest: sha256DigestSchema,
  normalized_digest: sha256DigestSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  orientation_applied: z.number().int().min(1).max(8),
  perceptual_hash: z.string().regex(/^[a-f0-9]{16}$/),
  quality: z.object({
    sharpness: z.number().nonnegative(),
    black_border_ratio: z.number().min(0).max(1),
    ocr_usable: z.boolean()
  }).strict(),
  regions: z.array(contentRegionSchema),
  ocr_blocks: z.array(ocrBlockSchema),
  barcode_payloads: z.array(nonEmptyTextSchema)
}).strict().refine(
  (image) => image.source_object.digest === image.original_digest,
  "original_digest must match the immutable source object"
);

export const preprocessResultSchema = z.object({
  schema_version: z.literal(1),
  capture_id: captureIdSchema,
  images: z.array(preprocessImageSchema).min(1),
  indicators: z.object({
    urls: z.array(httpsUrlSchema),
    repositories: z.array(httpsUrlSchema),
    packages: z.array(nonEmptyTextSchema),
    commands: z.array(nonEmptyTextSchema)
  }).strict(),
  duplicate_groups: z.array(z.array(z.number().int().nonnegative()).min(2)),
  near_duplicate_groups: z.array(z.array(z.number().int().nonnegative()).min(2)),
  privacy_suggestions: z.array(z.object({
    image_index: z.number().int().nonnegative(),
    kind: z.enum(["email", "phone", "address", "credential_candidate", "token_candidate", "other"]),
    bbox: boundingBoxSchema.optional(),
    action: z.literal("human_redaction_review")
  }).strict()),
  created_at: timestampSchema
}).strict();

export const extractedClaimSchema = z.object({
  id: claimIdSchema,
  statement: nonEmptyTextSchema,
  basis: z.enum(["visible", "ocr", "inferred", "unknown"]),
  confidence: confidenceSchema,
  evidence_ids: evidenceIdsSchema
}).strict();

export const extractedEntitySchema = z.object({
  name: nonEmptyTextSchema,
  aliases: z.array(nonEmptyTextSchema),
  logo_hint: nonEmptyTextSchema.optional(),
  author: nonEmptyTextSchema.optional(),
  domain: nonEmptyTextSchema.optional(),
  repository: httpsUrlSchema.optional(),
  package: nonEmptyTextSchema.optional()
}).strict();

export const extractionResultSchema = z.object({
  schema_version: z.literal(1),
  capture_id: captureIdSchema,
  preprocess_artifact_id: stageArtifactIdSchema,
  claims: z.array(extractedClaimSchema),
  entities: z.array(extractedEntitySchema),
  experience_fragments: z.array(z.object({
    title: nonEmptyTextSchema,
    summary: nonEmptyTextSchema,
    evidence_ids: evidenceIdsSchema
  }).strict()),
  explicit_urls: z.array(httpsUrlSchema),
  unresolved_questions: z.array(nonEmptyTextSchema)
}).strict();

export const evidenceRecordSchema = z.object({
  id: evidenceIdSchema,
  tier: z.enum(["A", "B", "C", "D"]),
  source_url: httpsUrlSchema,
  title: nonEmptyTextSchema,
  checked_at: timestampSchema,
  content_digest: sha256DigestSchema,
  claims: z.array(nonEmptyTextSchema).min(1)
}).strict();

export const identityCandidateSchema = z.object({
  entity_id: entityIdSchema.optional(),
  name: nonEmptyTextSchema,
  confidence: confidenceSchema,
  evidence_ids: evidenceIdsSchema
}).strict();

export const identityResolutionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("confirmed"),
    entity_id: entityIdSchema,
    evidence_ids: evidenceIdsSchema
  }).strict(),
  z.object({
    status: z.literal("IDENTITY_AMBIGUOUS"),
    candidates: z.array(identityCandidateSchema).min(2),
    reason: nonEmptyTextSchema
  }).strict()
]);

export const researchDossierSchema = z.object({
  schema_version: z.literal(1),
  capture_id: captureIdSchema,
  extraction_artifact_id: stageArtifactIdSchema,
  identity: identityResolutionSchema,
  evidence: z.array(evidenceRecordSchema).min(1),
  claim_checks: z.array(z.object({
    claim_id: claimIdSchema,
    status: z.enum(["corroborated", "contradicted", "unverified"]),
    evidence_ids: evidenceIdsSchema
  }).strict()),
  current_availability: nonEmptyTextSchema,
  version: nonEmptyTextSchema,
  maintenance_status: nonEmptyTextSchema,
  install_methods: z.array(nonEmptyTextSchema),
  agent_protocol_support: z.array(nonEmptyTextSchema),
  authentication: z.array(nonEmptyTextSchema),
  pricing: nonEmptyTextSchema,
  data_destinations: z.array(nonEmptyTextSchema),
  permissions: z.array(nonEmptyTextSchema),
  license: nonEmptyTextSchema,
  security_findings: z.array(nonEmptyTextSchema),
  researched_at: timestampSchema
}).strict().superRefine((dossier, context) => {
  const evidenceById = new Map(dossier.evidence.map((item) => [item.id, item]));
  const citedIds = dossier.identity.status === "confirmed"
    ? dossier.identity.evidence_ids
    : dossier.identity.candidates.flatMap((candidate) => candidate.evidence_ids);

  for (const evidenceId of citedIds) {
    if (!evidenceById.has(evidenceId)) {
      context.addIssue({
        code: "custom",
        path: ["identity"],
        message: `Identity cites missing evidence ${evidenceId}`
      });
    }
  }

  if (dossier.identity.status === "confirmed" && !dossier.identity.evidence_ids.some((id) => {
    const tier = evidenceById.get(id)?.tier;
    return tier === "A" || tier === "B";
  })) {
    context.addIssue({
      code: "custom",
      path: ["identity", "evidence_ids"],
      message: "Confirmed identity requires at least one cited A or B source"
    });
  }

  dossier.claim_checks.forEach((check, index) => {
    for (const evidenceId of check.evidence_ids) {
      if (!evidenceById.has(evidenceId)) {
        context.addIssue({
          code: "custom",
          path: ["claim_checks", index, "evidence_ids"],
          message: `Claim check cites missing evidence ${evidenceId}`
        });
      }
    }
  });
});

export const assessmentDimensionSchema = z.object({
  score: z.number().int().min(0).max(5),
  reason: nonEmptyTextSchema,
  evidence_ids: evidenceIdsSchema
}).strict();

export const assessmentDimensionsSchema = z.object({
  personal_fit: assessmentDimensionSchema,
  capability_value: assessmentDimensionSchema,
  evidence_confidence: assessmentDimensionSchema,
  novelty: assessmentDimensionSchema,
  reusability: assessmentDimensionSchema,
  portability: assessmentDimensionSchema,
  maturity: assessmentDimensionSchema,
  maintenance_burden: assessmentDimensionSchema,
  security_risk: assessmentDimensionSchema,
  adoption_cost: assessmentDimensionSchema
}).strict();

export const capabilityCandidateSchema = z.object({
  name: nonEmptyTextSchema,
  novel_capabilities: z.array(nonEmptyTextSchema),
  overlapping_capabilities: z.array(nonEmptyTextSchema),
  replaces: z.array(nonEmptyTextSchema),
  complements: z.array(nonEmptyTextSchema),
  conflicts_with: z.array(nonEmptyTextSchema),
  capability_gaps: z.array(nonEmptyTextSchema)
}).strict();

export const rankedAlternativeSchema = z.object({
  rank: z.number().int().positive(),
  entity_id: entityIdSchema.optional(),
  name: nonEmptyTextSchema,
  reason: nonEmptyTextSchema,
  evidence_ids: evidenceIdsSchema
}).strict();

export const conflictConclusionSchema = z.object({
  summary: nonEmptyTextSchema,
  evidence_ids: evidenceIdsSchema
}).strict();

export const capabilityAssessmentSchema = z.object({
  schema_version: z.literal(1),
  capture_id: captureIdSchema,
  dossier_artifact_id: stageArtifactIdSchema,
  candidate: capabilityCandidateSchema,
  alternatives: z.array(rankedAlternativeSchema),
  dimensions: assessmentDimensionsSchema,
  conflicts: z.array(conflictConclusionSchema),
  disposition: dispositionSchema,
  disposition_reason: nonEmptyTextSchema,
  resident_capability: z.boolean(),
  unresolved_questions: z.array(nonEmptyTextSchema),
  assessed_at: timestampSchema
}).strict();

export const criticReviewSchema = z.object({
  schema_version: z.literal(1),
  capture_id: captureIdSchema,
  assessment_artifact_id: stageArtifactIdSchema,
  verdict: z.enum(["concur", "revise", "insufficient_evidence"]),
  findings: z.array(z.object({
    severity: z.enum(["low", "medium", "high"]),
    summary: nonEmptyTextSchema,
    evidence_ids: evidenceIdsSchema
  }).strict()),
  recommended_disposition: dispositionSchema,
  unresolved_questions: z.array(nonEmptyTextSchema),
  reviewed_at: timestampSchema
}).strict();

export const platformPreviewSchema = z.object({
  platform: z.enum(["web", "telegram", "linear"]),
  title: nonEmptyTextSchema,
  summary: nonEmptyTextSchema,
  warnings: z.array(nonEmptyTextSchema)
}).strict();

export const reviewPacketSchema = z.object({
  schema_version: z.literal(1),
  packet_id: reviewPacketIdSchema,
  capture_id: captureIdSchema,
  source_objects: z.array(objectRefSchema).min(1),
  stage_artifact_ids: z.object({
    preprocess: stageArtifactIdSchema,
    extraction: stageArtifactIdSchema,
    research: stageArtifactIdSchema,
    assessment: stageArtifactIdSchema,
    critic: stageArtifactIdSchema.nullable()
  }).strict(),
  screenshots: z.array(z.object({
    order: z.number().int().nonnegative(),
    object: objectRefSchema
  }).strict()).min(1),
  ocr: z.array(z.object({
    image_index: z.number().int().nonnegative(),
    text: z.string()
  }).strict()),
  entities: z.array(extractedEntitySchema),
  identity: identityResolutionSchema,
  claims: z.array(extractedClaimSchema),
  evidence: z.array(evidenceRecordSchema),
  conflicts: z.array(conflictConclusionSchema),
  candidate: capabilityCandidateSchema,
  alternatives: z.array(rankedAlternativeSchema),
  dimensions: assessmentDimensionsSchema,
  recommended_disposition: dispositionSchema,
  disposition_reason: nonEmptyTextSchema,
  critic: criticReviewSchema.nullable(),
  platform_previews: z.array(platformPreviewSchema),
  model_contracts: z.array(z.object({
    stage: analysisStageSchema,
    provider: z.enum(["deterministic", "minimax", "kimi", "deepseek"]),
    model: nonEmptyTextSchema,
    schema_version: z.literal(1)
  }).strict()),
  unresolved_questions: z.array(nonEmptyTextSchema),
  human_review_required: z.literal(true),
  created_at: timestampSchema
}).strict();

const analysisJobBaseShape = {
  schema_version: z.literal(1),
  id: analysisJobIdSchema,
  capture_id: captureIdSchema,
  input_digest: sha256DigestSchema,
  completed_artifact_ids: z.array(stageArtifactIdSchema),
  created_at: timestampSchema,
  updated_at: timestampSchema
};

const reviewRequestReferenceSchema = z.string().regex(/^rev_[a-f0-9]{32}$/);
const reviewDecisionReferenceSchema = z.string().regex(/^dec_[a-f0-9]{32}$/);
const approvedCandidateDispositionSchema = z.enum(["adopt", "adapt", "build", "learn", "watch"]);

export const analysisJobSchema = z.discriminatedUnion("status", [
  z.object({ ...analysisJobBaseShape, status: z.literal("queued") }).strict(),
  z.object({
    ...analysisJobBaseShape,
    status: z.literal("running"),
    stage: analysisStageSchema,
    started_at: timestampSchema
  }).strict(),
  z.object({
    ...analysisJobBaseShape,
    status: z.literal("completed"),
    review_packet_artifact_id: stageArtifactIdSchema,
    completed_at: timestampSchema
  }).strict(),
  z.object({
    ...analysisJobBaseShape,
    status: z.literal("WAITING_FOR_REVIEW"),
    review_packet_artifact_id: stageArtifactIdSchema,
    review_request_id: reviewRequestReferenceSchema,
    waiting_at: timestampSchema
  }).strict(),
  z.object({
    ...analysisJobBaseShape,
    status: z.literal("reviewed"),
    review_packet_artifact_id: stageArtifactIdSchema,
    review_request_id: reviewRequestReferenceSchema,
    review_decision_id: reviewDecisionReferenceSchema,
    decision: z.discriminatedUnion("outcome", [
      z.object({
        outcome: z.literal("approve"),
        disposition: approvedCandidateDispositionSchema
      }).strict(),
      z.object({ outcome: z.literal("reject") }).strict()
    ]),
    reviewed_at: timestampSchema
  }).strict(),
  z.object({
    ...analysisJobBaseShape,
    status: z.literal("HUMAN_REVIEW_REQUIRED"),
    stage: analysisStageSchema.optional(),
    reason: nonEmptyTextSchema,
    stopped_at: timestampSchema
  }).strict(),
  z.object({
    ...analysisJobBaseShape,
    status: z.literal("failed"),
    stage: analysisStageSchema.optional(),
    error_code: z.enum(["INVALID_INPUT", "PROVIDER_UNAVAILABLE", "TIMEOUT", "INTERNAL_ERROR"]),
    reason: nonEmptyTextSchema,
    failed_at: timestampSchema
  }).strict()
]);

export const stageArtifactSchema = z.object({
  schema_version: z.literal(1),
  id: stageArtifactIdSchema,
  job_id: analysisJobIdSchema,
  capture_id: captureIdSchema,
  stage: analysisStageSchema,
  input_digest: sha256DigestSchema,
  output_digest: sha256DigestSchema,
  payload_schema_version: z.literal(1),
  object: objectRefSchema,
  created_at: timestampSchema
}).strict().refine(
  (artifact) => artifact.id === `art_${artifact.output_digest}`,
  "Stage artifact ID must be content-addressed by output_digest"
);

const modelCallAuditBaseShape = {
  schema_version: z.literal(1),
  event_id: modelCallEventIdSchema,
  call_id: modelCallIdSchema,
  job_id: analysisJobIdSchema,
  capture_id: captureIdSchema,
  stage: z.enum(["extraction", "research", "assessment", "critic"]),
  provider: z.enum(["minimax", "kimi", "deepseek"]),
  model: nonEmptyTextSchema,
  auth_mode: z.enum(["api_key", "local_login"]).optional(),
  attempt: z.union([z.literal(1), z.literal(2)]),
  input_digest: sha256DigestSchema,
  input_bytes: z.number().int().nonnegative(),
  occurred_at: timestampSchema
};

export const modelCallAuditEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...modelCallAuditBaseShape,
    type: z.literal("started")
  }).strict(),
  z.object({
    ...modelCallAuditBaseShape,
    type: z.literal("succeeded"),
    output_digest: sha256DigestSchema,
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative()
  }).strict(),
  z.object({
    ...modelCallAuditBaseShape,
    type: z.literal("failed"),
    error_code: z.enum([
      "INVALID_OUTPUT",
      "PROVIDER_UNAVAILABLE",
      "TIMEOUT",
      "AUTHENTICATION",
      "QUOTA",
      "POLICY_DENIED"
    ])
  }).strict()
]);
