import { z } from "zod";
import {
  capabilityAssessmentSchema,
  criticReviewSchema,
  researchDossierSchema
} from "./schemas";

const {
  schema_version: _researchSchemaVersion,
  capture_id: _researchCaptureId,
  extraction_artifact_id: _researchArtifactId,
  evidence: _researchEvidence,
  researched_at: _researchedAt,
  ...researchDraftShape
} = researchDossierSchema.shape;

const {
  schema_version: _assessmentSchemaVersion,
  capture_id: _assessmentCaptureId,
  dossier_artifact_id: _dossierArtifactId,
  assessed_at: _assessedAt,
  ...assessmentDraftShape
} = capabilityAssessmentSchema.shape;

const {
  schema_version: _criticSchemaVersion,
  capture_id: _criticCaptureId,
  assessment_artifact_id: _assessmentArtifactId,
  reviewed_at: _reviewedAt,
  ...criticDraftShape
} = criticReviewSchema.shape;

export const researchDraftSchema = z.object(researchDraftShape).strict();
export const assessmentDraftSchema = z.object(assessmentDraftShape).strict();
export const criticDraftSchema = z.object(criticDraftShape).strict();
