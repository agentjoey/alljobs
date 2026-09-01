import { z } from "zod";
import {
  prioritySchema,
  taskStatusSchema,
  workModeSchema
} from "../planning/domain/schemas";
import { ASSISTANT_LIMITS } from "./limits";

const hexDigestSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Digest must be a 64-character lowercase SHA-256 hex string");

const projectSlugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, "Project slug must contain only lowercase alphanumeric characters and hyphens");

export const assistantModeSchema = z.enum(["standard", "deep"]);
export type AssistantMode = z.infer<typeof assistantModeSchema>;

export const sourceModeSchema = z.enum(["local-working-tree", "remote-commit", "cached", "native"]);
export type SourceMode = z.infer<typeof sourceModeSchema>;

export const sourceCapabilitySchema = z.enum(["list_project_files", "read_project_files"]);
export type SourceCapability = z.infer<typeof sourceCapabilitySchema>;

export const assistantErrorCodeSchema = z.enum([
  "AUTHENTICATION",
  "PLAN_EXHAUSTED",
  "RATE_LIMITED",
  "TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "ABORTED",
  "STALE_CONTEXT",
  "INVALID_OUTPUT"
]);
export type AssistantErrorCode = z.infer<typeof assistantErrorCodeSchema>;

// ---------------------------------------------------------------------------
// Answer primitives
// ---------------------------------------------------------------------------

export const managementCitationSchema = z.object({
  source_id: z.string().min(1, "citation source_id is required"),
  label: z.string().min(1, "citation label is required")
}).strict();
export type ManagementCitation = z.infer<typeof managementCitationSchema>;

export const managementFactSchema = z.object({
  id: z.string().min(1, "fact id is required"),
  text: z.string().min(1, "fact text is required"),
  citation_source_ids: z.array(z.string().min(1)).min(1, "a confirmed fact must cite at least one source")
}).strict();
export type ManagementFact = z.infer<typeof managementFactSchema>;

export const managementInferenceSchema = z.object({
  id: z.string().min(1, "inference id is required"),
  text: z.string().min(1, "inference text is required"),
  based_on_source_ids: z.array(z.string().min(1))
}).strict();
export type ManagementInference = z.infer<typeof managementInferenceSchema>;

export const managementRecommendationSchema = z.object({
  id: z.string().min(1, "recommendation id is required"),
  title: z.string().min(1, "recommendation title is required"),
  rationale: z.string().min(1, "recommendation rationale is required"),
  candidate_kind: z.enum(["none", "task", "backlog"])
}).strict();
export type ManagementRecommendation = z.infer<typeof managementRecommendationSchema>;

// ---------------------------------------------------------------------------
// Request intent
// ---------------------------------------------------------------------------

const boundedQuestionSchema = z
  .string()
  .min(1, "question is required")
  .max(ASSISTANT_LIMITS.questionChars, `question exceeds ${ASSISTANT_LIMITS.questionChars} characters`);

export const assistantRequestIntentSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("ask"),
    project_slug: projectSlugSchema,
    question: boundedQuestionSchema,
    mode: assistantModeSchema,
    selected_optional_source_ids: z.array(z.string().min(1)).max(ASSISTANT_LIMITS.contextPaths),
    expected_manifest_digest: hexDigestSchema
  }).strict(),
  z.object({
    intent: z.literal("inspect_source"),
    project_slug: projectSlugSchema,
    gate_id: z.string().min(1, "gate_id is required"),
    question: boundedQuestionSchema,
    expected_manifest_digest: hexDigestSchema
  }).strict(),
  z.object({
    intent: z.literal("answer_without_source"),
    project_slug: projectSlugSchema,
    gate_id: z.string().min(1, "gate_id is required"),
    question: boundedQuestionSchema,
    expected_manifest_digest: hexDigestSchema
  }).strict(),
  z.object({
    intent: z.literal("draft_task"),
    project_slug: projectSlugSchema,
    candidate_id: z.string().min(1, "candidate_id is required"),
    expected_manifest_digest: hexDigestSchema
  }).strict(),
  z.object({
    intent: z.literal("draft_backlog"),
    project_slug: projectSlugSchema,
    candidate_id: z.string().min(1, "candidate_id is required"),
    expected_manifest_digest: hexDigestSchema
  }).strict()
]);
export type AssistantRequestIntent = z.infer<typeof assistantRequestIntentSchema>;

// ---------------------------------------------------------------------------
// Context manifest
// ---------------------------------------------------------------------------

export const manifestIssueSchema = z.object({
  scope: z.enum(["document", "object", "relation"]),
  code: z.string().min(1),
  source_path: z.string().optional(),
  object_id: z.string().optional(),
  field: z.string().optional(),
  message: z.string().min(1)
}).strict();
export type ManifestIssue = z.infer<typeof manifestIssueSchema>;

export const manifestDocumentSchema = z.object({
  source_id: z.string().min(1, "source_id is required"),
  path: z.string().min(1, "path is required"),
  digest: hexDigestSchema,
  bytes: z.number().int().nonnegative(),
  modified: z.boolean().nullable(),
  optional: z.boolean(),
  selected: z.boolean(),
  read_at: z.string().min(1),
  issues: z.array(manifestIssueSchema)
}).strict();
export type ManifestDocument = z.infer<typeof manifestDocumentSchema>;

export const assistantContextManifestSchema = z.object({
  project_slug: projectSlugSchema,
  source_mode: sourceModeSchema,
  head_revision: z.string().optional(),
  documents: z.array(manifestDocumentSchema),
  context_policy_version: z.number().int().positive(),
  manifest_digest: hexDigestSchema
}).strict();
export type AssistantContextManifest = z.infer<typeof assistantContextManifestSchema>;

// ---------------------------------------------------------------------------
// Model outcomes
// ---------------------------------------------------------------------------

export const managementAnswerSchema = z.object({
  kind: z.literal("management_answer"),
  direct_answer: z.string(),
  confirmed_facts: z.array(managementFactSchema),
  inferences: z.array(managementInferenceSchema),
  unknowns: z.array(z.string()),
  questions: z.array(z.string()),
  recommendations: z.array(managementRecommendationSchema),
  citations: z.array(managementCitationSchema)
}).strict();
export type ManagementAnswer = z.infer<typeof managementAnswerSchema>;

export const sourceAccessProposalSchema = z.object({
  kind: z.literal("source_access_proposal"),
  gate_id: z.string().min(1, "source access requires a server-bound gate id"),
  purpose: z.string().min(1, "purpose is required"),
  unanswered_question: z.string().min(1, "unanswered_question is required"),
  requested_capabilities: z.array(sourceCapabilitySchema).min(1, "at least one capability is required"),
  max_files: z.number().int().positive(),
  max_bytes: z.number().int().positive(),
  max_tool_calls: z.number().int().positive(),
  expected_facts: z.array(z.string()),
  manifest_digest: hexDigestSchema,
  expires_at: z.string().min(1, "expires_at is required")
}).strict();
export type SourceAccessProposal = z.infer<typeof sourceAccessProposalSchema>;

export const assistantOutcomeSchema = z.discriminatedUnion("kind", [
  managementAnswerSchema,
  sourceAccessProposalSchema
]);
export type AssistantOutcome = z.infer<typeof assistantOutcomeSchema>;

// ---------------------------------------------------------------------------
// Consequential proposals
// ---------------------------------------------------------------------------

export const taskDraftSchema = z.object({
  title: z.string().min(1, "task draft title is required"),
  status: taskStatusSchema,
  work_mode: workModeSchema.optional(),
  backlog: z.string().optional(),
  roadmap_item: z.string().optional(),
  phase: z.string().optional(),
  priority: prioritySchema.optional(),
  due: z.string().optional(),
  evidence: z.array(z.string()),
  assumptions: z.array(z.string()),
  citation_source_ids: z.array(z.string().min(1)),
  manifest_digest: hexDigestSchema
}).strict();
export type TaskDraft = z.infer<typeof taskDraftSchema>;

export const backlogProposalSchema = z.object({
  problem: z.string().min(1, "problem is required"),
  desired_outcome: z.string().min(1, "desired_outcome is required"),
  suggested_title: z.string().min(1, "suggested_title is required"),
  suggested_phase: z.string().optional(),
  suggested_priority: prioritySchema.optional(),
  suggested_dependencies: z.array(z.string()).default([]),
  suggested_work_mode: workModeSchema.optional(),
  done_when: z.string().min(1, "done_when is required"),
  evidence: z.array(z.string()),
  assumptions: z.array(z.string()),
  unknowns: z.array(z.string()),
  questions: z.array(z.string()),
  citation_source_ids: z.array(z.string().min(1)),
  manifest_digest: hexDigestSchema,
  model: z.string().min(1, "model is required"),
  mode: assistantModeSchema,
  generated_at: z.string().min(1, "generated_at is required"),
  proposal_digest: hexDigestSchema
}).strict();
export type BacklogProposal = z.infer<typeof backlogProposalSchema>;

// ---------------------------------------------------------------------------
// Operational record
// ---------------------------------------------------------------------------

export const assistantRunStatusSchema = z.enum([
  "complete",
  "incomplete",
  "stale",
  "invalid_output",
  "refused",
  "error"
]);
export type AssistantRunStatus = z.infer<typeof assistantRunStatusSchema>;

export const assistantSourceGateStateSchema = z.enum(["none", "requested", "approved", "denied"]);
export type AssistantSourceGateState = z.infer<typeof assistantSourceGateStateSchema>;

export const assistantRunRecordSchema = z.object({
  run_id: z.string().min(1, "run_id is required"),
  project: projectSlugSchema,
  model: z.string().min(1, "model is required"),
  mode: assistantModeSchema,
  status: assistantRunStatusSchema,
  duration_ms: z.number().int().nonnegative(),
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  manifest_digest: hexDigestSchema,
  source_gate: assistantSourceGateStateSchema.default("none"),
  error_code: assistantErrorCodeSchema.optional()
}).strict();
export type AssistantRunRecord = z.infer<typeof assistantRunRecordSchema>;

// ---------------------------------------------------------------------------
// Stream events
// ---------------------------------------------------------------------------

export const assistantPartialViewSchema = z.object({
  direct_answer: z.string().optional(),
  confirmed_facts: z.array(managementFactSchema).optional(),
  inferences: z.array(managementInferenceSchema).optional(),
  unknowns: z.array(z.string()).optional(),
  recommendations: z.array(managementRecommendationSchema).optional()
}).strict();
export type AssistantPartialView = z.infer<typeof assistantPartialViewSchema>;

export const assistantStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run_status"),
    stage: z.enum(["preparing", "generating", "validating", "complete"])
  }).strict(),
  z.object({
    type: z.literal("assistant_partial"),
    partial: assistantPartialViewSchema
  }).strict(),
  z.object({
    type: z.literal("source_access_requested"),
    proposal: sourceAccessProposalSchema
  }).strict(),
  z.object({
    type: z.literal("assistant_complete"),
    stale: z.boolean(),
    outcome: assistantOutcomeSchema
  }).strict(),
  z.object({
    type: z.literal("assistant_error"),
    code: assistantErrorCodeSchema,
    message: z.string()
  }).strict()
]);
export type AssistantStreamEvent = z.infer<typeof assistantStreamEventSchema>;
