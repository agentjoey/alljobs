import { digestCanonicalJson } from "./digest";
import { capabilityAssessmentSchema, criticReviewSchema } from "./schemas";
import type {
  CapabilityAssessment,
  CriticReview,
  ExtractionResult,
  ResearchDossier
} from "./types";
import type { StructuredProviderOutput } from "../providers/contracts";
import type { KimiInvocationOptions } from "../providers/kimi";
import type { MiniMaxInvocationOptions } from "../providers/minimax";

export interface AssessmentWorker {
  assess(input: unknown, options: KimiInvocationOptions): Promise<StructuredProviderOutput>;
}

export interface CriticWorker {
  critique(input: unknown, options: MiniMaxInvocationOptions): Promise<StructuredProviderOutput>;
}

export class CapabilityAssessmentError extends Error {
  constructor(readonly code: "ASSESSMENT_INVALID_OUTPUT" | "ASSESSMENT_INVALID_EVIDENCE", options?: ErrorOptions) {
    super(code, options);
    this.name = "CapabilityAssessmentError";
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function evidenceReferences(assessment: CapabilityAssessment): string[] {
  return [
    ...Object.values(assessment.dimensions).flatMap((dimension) => dimension.evidence_ids),
    ...assessment.alternatives.flatMap((alternative) => alternative.evidence_ids),
    ...assessment.conflicts.flatMap((conflict) => conflict.evidence_ids)
  ];
}

function assertKnownEvidence(ids: readonly string[], dossier: ResearchDossier): void {
  const known = new Set(dossier.evidence.map((item) => item.id));
  if (ids.some((id) => !known.has(id))) {
    throw new CapabilityAssessmentError("ASSESSMENT_INVALID_EVIDENCE");
  }
}

function contradictionConflicts(dossier: ResearchDossier, existing: CapabilityAssessment["conflicts"]) {
  const knownKeys = new Set(existing.map((conflict) => `${conflict.summary}\0${conflict.evidence_ids.join(",")}`));
  const additions = dossier.claim_checks
    .filter((check) => check.status === "contradicted")
    .map((check) => ({
      summary: `Research evidence contradicts extracted claim ${check.claim_id}.`,
      evidence_ids: [...check.evidence_ids]
    }))
    .filter((conflict) => !knownKeys.has(`${conflict.summary}\0${conflict.evidence_ids.join(",")}`));
  return [...existing, ...additions];
}

export async function buildCapabilityAssessment(options: {
  extraction: ExtractionResult;
  dossier: ResearchDossier;
  dossierArtifactId: string;
  registrySnapshot?: unknown;
  worker: AssessmentWorker;
  clock: () => string;
  signal: AbortSignal;
}): Promise<CapabilityAssessment> {
  if (options.extraction.capture_id !== options.dossier.capture_id) {
    throw new CapabilityAssessmentError("ASSESSMENT_INVALID_OUTPUT");
  }
  const workerInput = {
    schema_version: 1,
    extraction: options.extraction,
    dossier: options.dossier,
    registry_snapshot: options.registrySnapshot ?? null
  };
  const generated = await options.worker.assess(workerInput, {
    inputDigest: digestCanonicalJson(workerInput),
    signal: options.signal
  });
  if (!generated.value || typeof generated.value !== "object" || Array.isArray(generated.value)) {
    throw new CapabilityAssessmentError("ASSESSMENT_INVALID_OUTPUT");
  }

  let assessment: CapabilityAssessment;
  try {
    const proposed = generated.value as Record<string, unknown>;
    const proposedAlternatives = Array.isArray(proposed.alternatives) ? proposed.alternatives : [];
    const alternatives = proposedAlternatives
      .map((alternative) => alternative as Record<string, unknown>)
      .sort((left, right) => {
        const rank = Number(left?.rank) - Number(right?.rank);
        return Number.isFinite(rank) && rank !== 0
          ? rank
          : String(left?.name).localeCompare(String(right?.name));
      })
      .map((alternative, index) => ({ ...alternative, rank: index + 1 }));
    const proposedQuestions = Array.isArray(proposed.unresolved_questions)
      ? proposed.unresolved_questions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const identityQuestion = options.dossier.identity.status === "IDENTITY_AMBIGUOUS"
      ? [`Identity unresolved: ${options.dossier.identity.reason}`]
      : [];
    assessment = capabilityAssessmentSchema.parse({
      ...proposed,
      schema_version: 1,
      capture_id: options.extraction.capture_id,
      dossier_artifact_id: options.dossierArtifactId,
      alternatives,
      unresolved_questions: uniqueStrings([...proposedQuestions, ...identityQuestion]),
      assessed_at: options.clock()
    });
    assessment = capabilityAssessmentSchema.parse({
      ...assessment,
      conflicts: contradictionConflicts(options.dossier, assessment.conflicts)
    });
  } catch (error) {
    throw new CapabilityAssessmentError("ASSESSMENT_INVALID_OUTPUT", { cause: error });
  }
  assertKnownEvidence(evidenceReferences(assessment), options.dossier);
  return assessment;
}

export function shouldRunCritic(
  assessment: CapabilityAssessment,
  options: { manualRequest?: boolean } = {}
): boolean {
  return options.manualRequest === true
    || assessment.disposition === "build"
    || assessment.dimensions.security_risk.score >= 4
    || (assessment.resident_capability && assessment.dimensions.capability_value.score >= 4)
    || assessment.dimensions.evidence_confidence.score <= 2
    || assessment.conflicts.length > 0;
}

export async function buildCriticReview(options: {
  assessment: CapabilityAssessment;
  assessmentArtifactId: string;
  dossier: ResearchDossier;
  worker: CriticWorker;
  clock: () => string;
  signal: AbortSignal;
}): Promise<CriticReview> {
  if (options.assessment.capture_id !== options.dossier.capture_id) {
    throw new CapabilityAssessmentError("ASSESSMENT_INVALID_OUTPUT");
  }
  const workerInput = {
    schema_version: 1,
    assessment: options.assessment,
    evidence: options.dossier.evidence,
    claim_checks: options.dossier.claim_checks
  };
  const generated = await options.worker.critique(workerInput, {
    inputDigest: digestCanonicalJson(workerInput),
    signal: options.signal
  });
  if (!generated.value || typeof generated.value !== "object" || Array.isArray(generated.value)) {
    throw new CapabilityAssessmentError("ASSESSMENT_INVALID_OUTPUT");
  }
  try {
    const review = criticReviewSchema.parse({
      ...(generated.value as Record<string, unknown>),
      schema_version: 1,
      capture_id: options.assessment.capture_id,
      assessment_artifact_id: options.assessmentArtifactId,
      reviewed_at: options.clock()
    });
    assertKnownEvidence(review.findings.flatMap((finding) => finding.evidence_ids), options.dossier);
    return review;
  } catch (error) {
    if (error instanceof CapabilityAssessmentError) throw error;
    throw new CapabilityAssessmentError("ASSESSMENT_INVALID_OUTPUT", { cause: error });
  }
}
