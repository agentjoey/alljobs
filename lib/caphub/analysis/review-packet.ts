import { digestCanonicalJson } from "./digest";
import { reviewPacketSchema } from "./schemas";
import type {
  CapabilityAssessment,
  CriticReview,
  ExtractionResult,
  PreprocessResult,
  ResearchDossier,
  ReviewPacket
} from "./types";

export class ReviewPacketError extends Error {
  constructor(readonly code: "REVIEW_PACKET_INVALID_INPUT", options?: ErrorOptions) {
    super(code, options);
    this.name = "ReviewPacketError";
  }
}

type StageArtifactIds = ReviewPacket["stage_artifact_ids"];
type ModelContract = ReviewPacket["model_contracts"][number];

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function assertInputs(options: {
  preprocess: PreprocessResult;
  extraction: ExtractionResult;
  dossier: ResearchDossier;
  assessment: CapabilityAssessment;
  critic: CriticReview | null;
  stageArtifactIds: StageArtifactIds;
}): void {
  const captureIds = [
    options.preprocess.capture_id,
    options.extraction.capture_id,
    options.dossier.capture_id,
    options.assessment.capture_id,
    options.critic?.capture_id ?? options.preprocess.capture_id
  ];
  const linked = options.extraction.preprocess_artifact_id === options.stageArtifactIds.preprocess
    && options.dossier.extraction_artifact_id === options.stageArtifactIds.extraction
    && options.assessment.dossier_artifact_id === options.stageArtifactIds.research
    && (options.critic
      ? options.critic.assessment_artifact_id === options.stageArtifactIds.assessment
        && options.stageArtifactIds.critic !== null
      : options.stageArtifactIds.critic === null);
  if (new Set(captureIds).size !== 1 || !linked) {
    throw new ReviewPacketError("REVIEW_PACKET_INVALID_INPUT");
  }
}

function previews(disposition: CapabilityAssessment["disposition"]): ReviewPacket["platform_previews"] {
  return (["web", "telegram", "linear"] as const).map((platform) => ({
    platform,
    title: "Caphub capability review",
    summary: `Review-only ${disposition} recommendation. No action has been executed.`,
    warnings: ["Human approval required", "Preview is non-executable"]
  }));
}

export function composeReviewPacket(options: {
  preprocess: PreprocessResult;
  extraction: ExtractionResult;
  dossier: ResearchDossier;
  assessment: CapabilityAssessment;
  critic: CriticReview | null;
  stageArtifactIds: StageArtifactIds;
  modelContracts: ModelContract[];
  clock: () => string;
}): ReviewPacket {
  assertInputs(options);
  const images = [...options.preprocess.images].sort((left, right) => left.index - right.index);
  const sourceObjects = [...new Map(images.map((image) => [image.source_object.digest, image.source_object])).values()];
  const identityQuestions = options.dossier.identity.status === "IDENTITY_AMBIGUOUS"
    ? [`Identity unresolved: ${options.dossier.identity.reason}`]
    : [];
  const createdAt = options.clock();
  const content = {
    schema_version: 1 as const,
    capture_id: options.preprocess.capture_id,
    source_objects: sourceObjects,
    stage_artifact_ids: options.stageArtifactIds,
    screenshots: images.map((image) => ({ order: image.index, object: image.source_object })),
    ocr: images.map((image) => ({
      image_index: image.index,
      text: image.ocr_blocks.map((block) => block.text).join("\n")
    })),
    entities: options.extraction.entities,
    identity: options.dossier.identity,
    claims: options.extraction.claims,
    evidence: options.dossier.evidence,
    conflicts: options.assessment.conflicts,
    candidate: options.assessment.candidate,
    alternatives: options.assessment.alternatives,
    dimensions: options.assessment.dimensions,
    recommended_disposition: options.critic?.recommended_disposition ?? options.assessment.disposition,
    disposition_reason: options.assessment.disposition_reason,
    critic: options.critic,
    platform_previews: previews(options.critic?.recommended_disposition ?? options.assessment.disposition),
    model_contracts: options.modelContracts,
    unresolved_questions: uniqueStrings([
      ...options.extraction.unresolved_questions,
      ...identityQuestions,
      ...options.assessment.unresolved_questions,
      ...(options.critic?.unresolved_questions ?? [])
    ]),
    human_review_required: true as const,
    created_at: createdAt
  };
  try {
    return reviewPacketSchema.parse({
      ...content,
      packet_id: `rvp_${digestCanonicalJson(content).slice(0, 32)}`
    });
  } catch (error) {
    throw new ReviewPacketError("REVIEW_PACKET_INVALID_INPUT", { cause: error });
  }
}
