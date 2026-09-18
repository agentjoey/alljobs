import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { buildCapabilityAssessment, buildCriticReview, CapabilityAssessmentError, shouldRunCritic } from "../analysis/assessment";
import { digestCanonicalJson } from "../analysis/digest";
import { assessmentDraftSchema, criticDraftSchema, researchDraftSchema } from "../analysis/model-drafts";
import { composeReviewPacket } from "../analysis/review-packet";
import {
  capabilityAssessmentSchema,
  criticReviewSchema,
  extractionResultSchema,
  preprocessResultSchema,
  researchDossierSchema
} from "../analysis/schemas";
import type {
  AnalysisJob,
  AnalysisStage,
  ModelCallAuditEvent,
  StageArtifact
} from "../analysis/types";
import { captureIdSchema, captureRecordSchema } from "../domain/schemas";
import type { CaptureRecord } from "../domain/types";
import { preprocessCapture } from "../preprocess/preprocessor";
import type { ImagePreprocessorDependencies } from "../preprocess/image";
import type { StructuredProvider } from "../providers/contracts";
import { runExtractionStageV2, type RunExtractionStageV2Request } from "../providers/extraction-stage-v2";
import type { MiniMaxWebSearchProvider } from "../providers/minimax-web-search";
import { runStructuredStage } from "../providers/structured-stage";
import { runWebSearchStage } from "../providers/web-search-stage";
import { buildResearchDossier, ResearchDossierError } from "../research/research";
import type { ResearchSearchPort, ResearchSourceGateway } from "../research/source-gateway";
import type { CaptureStore } from "../storage/contracts";
import type {
  AnalysisJobStore,
  JobModelBudget,
  ReadableModelCallAuditStore,
  StageArtifactStore,
  StructuredStageHumanReviewReason
} from "../workflow/contracts";
import { AnalysisWorkflowRunner, type AnalysisStageContext, type AnalysisStageHandler } from "../workflow/runner";

export type AnalysisServiceErrorCode =
  | "ANALYSIS_DISABLED"
  | "INVALID_CAPTURE_ID"
  | "CAPTURE_NOT_FOUND"
  | "INVALID_CAPTURE_OBJECT";

export class AnalysisServiceError extends Error {
  constructor(readonly code: AnalysisServiceErrorCode) {
    super(code);
    this.name = "AnalysisServiceError";
  }
}

export interface AnalysisServiceResult {
  jobId: string;
  status: AnalysisJob["status"];
  reviewPacketArtifactId: string | null;
}

export interface AnalysisService {
  start(captureId: string, signal?: AbortSignal): Promise<AnalysisServiceResult>;
}

export interface AnalysisServiceDependencies {
  config: { caphubEnabled: boolean; analysisEnabled: boolean };
  captures: Pick<CaptureStore, "get">;
  readObject(capture: CaptureRecord): Promise<Uint8Array>;
  preprocessDependencies: ImagePreprocessorDependencies;
  extractionObserver: RunExtractionStageV2Request["miniMax"];
  extractionStructurer: RunExtractionStageV2Request["deepSeek"];
  researchSearchProvider: Pick<MiniMaxWebSearchProvider, "provider" | "model" | "search">;
  researchProvider: StructuredProvider;
  assessmentProvider: StructuredProvider;
  criticProvider: StructuredProvider;
  sourceGateway: (search: ResearchSearchPort) => ResearchSourceGateway;
  jobs: AnalysisJobStore;
  artifacts: StageArtifactStore;
  audits: ReadableModelCallAuditStore;
  clock: () => Date;
  registrySnapshot?: unknown;
  manualCritic?: boolean;
  onExtractionInput?(inputDigest: string, preprocessArtifactId: string): void;
}

class StageHumanReviewError extends Error {
  constructor(readonly reason: StructuredStageHumanReviewReason) {
    super(reason);
    this.name = "StageHumanReviewError";
  }
}

function artifactFor(context: AnalysisStageContext, stage: AnalysisStage): StageArtifact {
  const artifact = context.completedArtifacts.find((candidate) => candidate.stage === stage);
  if (!artifact) throw new Error(`missing ${stage} artifact`);
  return artifact;
}

async function payloadFor<T>(
  context: AnalysisStageContext,
  stage: AnalysisStage,
  schema: z.ZodType<T>
): Promise<T> {
  const payload = await context.readPayload(artifactFor(context, stage).id);
  return schema.parse(payload);
}

export const CAPHUB_ANALYSIS_CONTRACT_VERSION = "caphub-analysis-v4";

function legacyJobIdFor(capture: CaptureRecord): string {
  return `job_${createHash("sha256").update(`${capture.id}\0${capture.object.digest}`, "utf8").digest("hex").slice(0, 32)}`;
}

function versionedJobIdFor(
  capture: CaptureRecord,
  version: "caphub-analysis-v2" | "caphub-analysis-v3" | "caphub-analysis-v4"
): string {
  return `job_${createHash("sha256")
    .update(`${capture.id}\0${capture.object.digest}\0${version}`, "utf8")
    .digest("hex").slice(0, 32)}`;
}

function resultFor(job: AnalysisJob): AnalysisServiceResult {
  return {
    jobId: job.id,
    status: job.status,
    reviewPacketArtifactId: job.status === "completed"
      || job.status === "WAITING_FOR_REVIEW"
      || job.status === "reviewed"
      ? job.review_packet_artifact_id
      : null
  };
}

function reconstructBudget(events: ModelCallAuditEvent[]): JobModelBudget {
  return {
    providerCalls: events.filter((event) => event.type === "started").length,
    totalTokens: events.reduce((total, event) => event.type === "succeeded"
      ? total + event.input_tokens + event.output_tokens
      : total, 0)
  };
}

async function normalizedModelImage(bytes: Uint8Array) {
  const normalized = await sharp(bytes).rotate().png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  return { mediaType: "image/png" as const, dataBase64: normalized.toString("base64") };
}

export function createAnalysisService(dependencies: AnalysisServiceDependencies): AnalysisService {
  const clockString = () => dependencies.clock().toISOString();
  if (dependencies.extractionObserver.provider !== "minimax"
    || dependencies.researchSearchProvider.provider !== "minimax"
    || dependencies.extractionStructurer.provider !== "deepseek"
    || dependencies.criticProvider.provider !== "minimax"
    || dependencies.researchProvider.provider !== "deepseek"
    || dependencies.assessmentProvider.provider !== "deepseek") {
    throw new Error("analysis providers do not match their fixed stage responsibilities");
  }

  return {
    async start(rawCaptureId: string, signal = new AbortController().signal): Promise<AnalysisServiceResult> {
      if (!dependencies.config.caphubEnabled || !dependencies.config.analysisEnabled) {
        throw new AnalysisServiceError("ANALYSIS_DISABLED");
      }
      const parsedId = captureIdSchema.safeParse(rawCaptureId);
      if (!parsedId.success) throw new AnalysisServiceError("INVALID_CAPTURE_ID");
      const rawCapture = await dependencies.captures.get(parsedId.data);
      if (!rawCapture) throw new AnalysisServiceError("CAPTURE_NOT_FOUND");
      const capture = captureRecordSchema.parse(rawCapture);
      const bytes = await dependencies.readObject(capture);
      if (!(bytes instanceof Uint8Array)
        || bytes.byteLength !== capture.object.bytes
        || createHash("sha256").update(bytes).digest("hex") !== capture.object.digest) {
        throw new AnalysisServiceError("INVALID_CAPTURE_OBJECT");
      }

      const jobId = versionedJobIdFor(capture, CAPHUB_ANALYSIS_CONTRACT_VERSION);
      let job = await dependencies.jobs.get(jobId);
      if (!job) {
        const predecessor = await dependencies.jobs.get(versionedJobIdFor(capture, "caphub-analysis-v3"))
          ?? await dependencies.jobs.get(versionedJobIdFor(capture, "caphub-analysis-v2"))
          ?? await dependencies.jobs.get(legacyJobIdFor(capture));
        const now = clockString();
        job = {
          schema_version: 1,
          id: jobId,
          analysis_contract_version: CAPHUB_ANALYSIS_CONTRACT_VERSION,
          ...(predecessor ? { supersedes_job_id: predecessor.id } : {}),
          capture_id: capture.id,
          input_digest: digestCanonicalJson(capture),
          completed_artifact_ids: [],
          status: "queued",
          created_at: now,
          updated_at: now
        };
        await dependencies.jobs.put(job);
      }
      if (job.status === "completed"
        || job.status === "WAITING_FOR_REVIEW"
        || job.status === "reviewed"
        || job.status === "failed"
        || job.status === "HUMAN_REVIEW_REQUIRED") {
        return resultFor(job);
      }

      const budget = reconstructBudget(await dependencies.audits.list(jobId));
      const sourceGateway = dependencies.sourceGateway(async (request, searchSignal) => {
        const outcome = await runWebSearchStage({
          jobId,
          captureId: capture.id,
          input: request,
          provider: dependencies.researchSearchProvider,
          auditStore: dependencies.audits,
          budget,
          clock: clockString,
          signal: searchSignal
        });
        if (outcome.kind === "human_review") throw new StageHumanReviewError(outcome.reason);
        return outcome.value;
      });
      const runProvider = async <T>(options: {
        stage: "research" | "assessment" | "critic";
        input: unknown;
        schema: z.ZodType<T>;
        provider: StructuredProvider;
      }): Promise<T> => {
        const outcome = await runStructuredStage({
          jobId,
          captureId: capture.id,
          stage: options.stage,
          input: options.input,
          schema: options.schema,
          provider: options.provider,
          auditStore: dependencies.audits,
          budget,
          clock: clockString,
          signal
        });
        if (outcome.kind === "human_review") throw new StageHumanReviewError(outcome.reason);
        return outcome.value;
      };

      const handlers: AnalysisStageHandler[] = [
        {
          stage: "preprocess",
          async run() {
            const value = await preprocessCapture({
              captureId: capture.id,
              images: [{ bytes, object: capture.object }],
              now: dependencies.clock,
              signal
            }, dependencies.preprocessDependencies);
            return { kind: "success", inputDigest: capture.object.digest, payload: value };
          }
        },
        {
          stage: "extraction",
          async run(context) {
            const preprocess = await payloadFor(context, "preprocess", preprocessResultSchema);
            const preprocessArtifactId = artifactFor(context, "preprocess").id;
            const normalized = await normalizedModelImage(bytes);
            const input = {
              preprocess,
              normalizedImages: [{ index: 0, ...normalized }]
            };
            const inputDigest = digestCanonicalJson(input);
            dependencies.onExtractionInput?.(inputDigest, preprocessArtifactId);
            const outcome = await runExtractionStageV2({
              jobId,
              captureId: capture.id,
              preprocessArtifactId,
              input: {
                preprocess,
                normalizedImages: input.normalizedImages.map(({ index, mediaType, dataBase64 }) => ({
                  index, mediaType, data: new Uint8Array(Buffer.from(dataBase64, "base64"))
                }))
              },
              miniMax: dependencies.extractionObserver,
              deepSeek: dependencies.extractionStructurer,
              auditStore: dependencies.audits,
              budget,
              clock: clockString,
              signal
            });
            return outcome.kind === "success"
              ? { kind: "success", inputDigest, payload: outcome.value }
              : outcome;
          }
        },
        {
          stage: "research",
          async run(context) {
            const extraction = await payloadFor(context, "extraction", extractionResultSchema);
            const extractionArtifactId = artifactFor(context, "extraction").id;
            try {
              const value = await buildResearchDossier({
                extraction,
                extractionArtifactId,
                gateway: sourceGateway,
                worker: {
                  async research(input, _options) {
                    const value = await runProvider({
                      stage: "research",
                      input: { ...(input as Record<string, unknown>), extraction_artifact_id: extractionArtifactId },
                      schema: researchDraftSchema,
                      provider: dependencies.researchProvider
                    });
                    return { value, usage: { inputTokens: 0, outputTokens: 0 } };
                  }
                },
                clock: clockString,
                signal
              });
              return { kind: "success", inputDigest: digestCanonicalJson(extraction), payload: value };
            } catch (error) {
              if (error instanceof StageHumanReviewError) return { kind: "human_review", reason: error.reason };
              if (error instanceof ResearchDossierError) return { kind: "human_review", reason: "INVALID_OUTPUT" };
              throw error;
            }
          }
        },
        {
          stage: "assessment",
          async run(context) {
            const extraction = await payloadFor(context, "extraction", extractionResultSchema);
            const dossier = await payloadFor(context, "research", researchDossierSchema);
            const dossierArtifactId = artifactFor(context, "research").id;
            try {
              const value = await buildCapabilityAssessment({
                extraction,
                dossier,
                dossierArtifactId,
                registrySnapshot: dependencies.registrySnapshot,
                worker: {
                  async assess(input) {
                    const value = await runProvider({
                      stage: "assessment",
                      input: { ...(input as Record<string, unknown>), dossier_artifact_id: dossierArtifactId },
                      schema: assessmentDraftSchema,
                      provider: dependencies.assessmentProvider
                    });
                    return { value, usage: { inputTokens: 0, outputTokens: 0 } };
                  }
                },
                clock: clockString,
                signal
              });
              return { kind: "success", inputDigest: digestCanonicalJson(dossier), payload: value };
            } catch (error) {
              if (error instanceof StageHumanReviewError) return { kind: "human_review", reason: error.reason };
              if (error instanceof CapabilityAssessmentError) return { kind: "human_review", reason: "INVALID_OUTPUT" };
              throw error;
            }
          }
        },
        {
          stage: "critic",
          async shouldRun(context) {
            const assessment = await payloadFor(context, "assessment", capabilityAssessmentSchema);
            return shouldRunCritic(assessment, { manualRequest: dependencies.manualCritic });
          },
          async run(context) {
            const assessment = await payloadFor(context, "assessment", capabilityAssessmentSchema);
            const dossier = await payloadFor(context, "research", researchDossierSchema);
            const assessmentArtifactId = artifactFor(context, "assessment").id;
            try {
              const value = await buildCriticReview({
                assessment,
                assessmentArtifactId,
                dossier,
                worker: {
                  async critique(input) {
                    const value = await runProvider({
                      stage: "critic",
                      input: { ...(input as Record<string, unknown>), assessment_artifact_id: assessmentArtifactId },
                      schema: criticDraftSchema,
                      provider: dependencies.criticProvider
                    });
                    return { value, usage: { inputTokens: 0, outputTokens: 0 } };
                  }
                },
                clock: clockString,
                signal
              });
              return { kind: "success", inputDigest: digestCanonicalJson(assessment), payload: value };
            } catch (error) {
              if (error instanceof StageHumanReviewError) return { kind: "human_review", reason: error.reason };
              if (error instanceof CapabilityAssessmentError) return { kind: "human_review", reason: "INVALID_OUTPUT" };
              throw error;
            }
          }
        },
        {
          stage: "review_packet",
          async run(context) {
            const preprocess = await payloadFor(context, "preprocess", preprocessResultSchema);
            const extraction = await payloadFor(context, "extraction", extractionResultSchema);
            const dossier = await payloadFor(context, "research", researchDossierSchema);
            const assessment = await payloadFor(context, "assessment", capabilityAssessmentSchema);
            const criticArtifact = context.completedArtifacts.find((artifact) => artifact.stage === "critic") ?? null;
            const critic = criticArtifact ? await payloadFor(context, "critic", criticReviewSchema) : null;
            const packet = composeReviewPacket({
              preprocess,
              extraction,
              dossier,
              assessment,
              critic,
              stageArtifactIds: {
                preprocess: artifactFor(context, "preprocess").id,
                extraction: artifactFor(context, "extraction").id,
                research: artifactFor(context, "research").id,
                assessment: artifactFor(context, "assessment").id,
                critic: criticArtifact?.id ?? null
              },
              modelContracts: [
                { stage: "preprocess", provider: "deterministic", model: "caphub-preprocess-v1", schema_version: 1 },
                { stage: "extraction", provider: "minimax", model: dependencies.extractionObserver.model, schema_version: 2 },
                { stage: "research", provider: "deepseek", model: dependencies.researchProvider.model, schema_version: 1 },
                { stage: "assessment", provider: "deepseek", model: dependencies.assessmentProvider.model, schema_version: 1 },
                ...(critic ? [{ stage: "critic" as const, provider: "minimax" as const, model: dependencies.criticProvider.model, schema_version: 1 as const }] : [])
              ],
              clock: clockString
            });
            return { kind: "success", inputDigest: digestCanonicalJson(assessment), payload: packet };
          }
        }
      ];

      const runner = new AnalysisWorkflowRunner({
        jobs: dependencies.jobs,
        artifacts: dependencies.artifacts,
        audits: dependencies.audits,
        handlers,
        clock: clockString
      });
      return resultFor(await runner.runAnalysisJob(jobId, signal));
    }
  };
}
