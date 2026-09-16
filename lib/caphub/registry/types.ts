import type { z } from "zod";
import type {
  candidateReviewDispositionSchema,
  RegistryJsonValue,
  registryAuditEventSchema,
  registryImportManifestSchema,
  registryLineageEdgeSchema,
  registryRecordKindSchema,
  registrySafeErrorCodeSchema,
  registryVersionSchema,
  reviewActionSchema,
  reviewDecisionAuthoritySchema,
  reviewDecisionInputSchema,
  reviewDecisionResultSchema,
  reviewDecisionSchema,
  reviewKindSchema,
  reviewRequestSchema,
  reviewSubjectKindSchema,
  reviewStateSchema
} from "./schemas";

export type RegistryRecordKind = z.infer<typeof registryRecordKindSchema>;
type ParsedRegistryVersion = z.infer<typeof registryVersionSchema>;
export type RegistryVersion<T extends RegistryJsonValue = RegistryJsonValue> =
  Omit<ParsedRegistryVersion, "payload"> & { payload: T };
export type RegistryLineageEdge = z.infer<typeof registryLineageEdgeSchema>;
export type RegistryImportManifest = z.infer<typeof registryImportManifestSchema>;
export type RegistryAuditEvent = z.infer<typeof registryAuditEventSchema>;
export type RegistrySafeErrorCode = z.infer<typeof registrySafeErrorCodeSchema>;
export type ReviewKind = z.infer<typeof reviewKindSchema>;
export type ReviewSubjectKind = z.infer<typeof reviewSubjectKindSchema>;
export type ReviewState = z.infer<typeof reviewStateSchema>;
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type CandidateReviewDisposition = z.infer<typeof candidateReviewDispositionSchema>;
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionInputSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
export type ReviewDecisionAuthority = z.infer<typeof reviewDecisionAuthoritySchema>;
export type ReviewDecisionResult = z.infer<typeof reviewDecisionResultSchema>;
