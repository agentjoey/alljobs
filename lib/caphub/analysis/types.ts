import type { z } from "zod";
import type {
  analysisJobSchema,
  analysisStageSchema,
  capabilityAssessmentSchema,
  criticReviewSchema,
  evidenceRecordSchema,
  extractionResultSchema,
  identityResolutionSchema,
  modelCallAuditEventSchema,
  preprocessResultSchema,
  researchDossierSchema,
  reviewPacketSchema,
  stageArtifactSchema
} from "./schemas";

export type AnalysisStage = z.infer<typeof analysisStageSchema>;
export type PreprocessResult = z.infer<typeof preprocessResultSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;
export type IdentityResolution = z.infer<typeof identityResolutionSchema>;
export type ResearchDossier = z.infer<typeof researchDossierSchema>;
export type CapabilityAssessment = z.infer<typeof capabilityAssessmentSchema>;
export type CriticReview = z.infer<typeof criticReviewSchema>;
export type ReviewPacket = z.infer<typeof reviewPacketSchema>;
export type AnalysisJob = z.infer<typeof analysisJobSchema>;
export type StageArtifact = z.infer<typeof stageArtifactSchema>;
export type ModelCallAuditEvent = z.infer<typeof modelCallAuditEventSchema>;
