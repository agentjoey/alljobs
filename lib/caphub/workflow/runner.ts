import type {
  AnalysisJob,
  AnalysisStage,
  ModelCallAuditEvent,
  StageArtifact
} from "../analysis/types";
import {
  FilesystemAnalysisJobStore,
  FilesystemModelCallAuditStore,
  FilesystemStageArtifactStore
} from "./filesystem";

const STAGE_ORDER = [
  "preprocess",
  "extraction",
  "research",
  "assessment",
  "critic",
  "review_packet"
] as const satisfies readonly AnalysisStage[];

const runChains = new Map<string, Promise<void>>();

export interface AnalysisStageContext {
  job: AnalysisJob;
  completedArtifacts: readonly StageArtifact[];
  signal: AbortSignal;
  readPayload(artifactId: string): Promise<unknown | null>;
}

export type AnalysisStageRunResult =
  | { kind: "success"; inputDigest: string; payload: unknown }
  | { kind: "human_review"; reason: string };

export interface AnalysisStageHandler {
  stage: AnalysisStage;
  shouldRun?(context: AnalysisStageContext): boolean | Promise<boolean>;
  run(context: AnalysisStageContext): Promise<AnalysisStageRunResult>;
}

export interface AnalysisWorkflowRunnerOptions {
  jobs: FilesystemAnalysisJobStore;
  artifacts: FilesystemStageArtifactStore;
  audits: FilesystemModelCallAuditStore;
  handlers: AnalysisStageHandler[];
  clock: () => string;
  afterArtifactPersisted?(artifact: StageArtifact): Promise<void>;
}

function base(job: AnalysisJob, completedArtifactIds = job.completed_artifact_ids) {
  return {
    schema_version: 1 as const,
    id: job.id,
    capture_id: job.capture_id,
    input_digest: job.input_digest,
    completed_artifact_ids: [...completedArtifactIds],
    created_at: job.created_at
  };
}

function unmatchedStarted(events: readonly ModelCallAuditEvent[]): Extract<ModelCallAuditEvent, { type: "started" }> | null {
  const terminal = new Set(events.filter((event) => event.type !== "started").map((event) => event.call_id));
  return events.find((event): event is Extract<ModelCallAuditEvent, { type: "started" }> =>
    event.type === "started" && !terminal.has(event.call_id)
  ) ?? null;
}

async function serializeJob<T>(jobId: string, operation: () => Promise<T>): Promise<T> {
  const previous = runChains.get(jobId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  const marker = run.then(() => undefined, () => undefined);
  runChains.set(jobId, marker);
  try {
    return await run;
  } finally {
    if (runChains.get(jobId) === marker) runChains.delete(jobId);
  }
}

export class AnalysisWorkflowRunner {
  private readonly jobs: FilesystemAnalysisJobStore;
  private readonly artifacts: FilesystemStageArtifactStore;
  private readonly audits: FilesystemModelCallAuditStore;
  private readonly handlers: Map<AnalysisStage, AnalysisStageHandler>;
  private readonly clock: () => string;
  private readonly afterArtifactPersisted: (artifact: StageArtifact) => Promise<void>;

  constructor(options: AnalysisWorkflowRunnerOptions) {
    this.jobs = options.jobs;
    this.artifacts = options.artifacts;
    this.audits = options.audits;
    this.clock = options.clock;
    this.afterArtifactPersisted = options.afterArtifactPersisted ?? (async () => undefined);
    this.handlers = new Map(options.handlers.map((handler) => [handler.stage, handler]));
    if (this.handlers.size !== STAGE_ORDER.length || STAGE_ORDER.some((stage) => !this.handlers.has(stage))) {
      throw new Error("analysis workflow requires exactly one handler for every fixed stage");
    }
  }

  runAnalysisJob(jobId: string, signal: AbortSignal): Promise<AnalysisJob> {
    return serializeJob(jobId, () => this.runSerialized(jobId, signal));
  }

  private async loadCompleted(job: AnalysisJob): Promise<StageArtifact[]> {
    const artifacts: StageArtifact[] = [];
    for (const id of job.completed_artifact_ids) {
      const artifact = await this.artifacts.get(id);
      if (!artifact || artifact.job_id !== job.id || artifact.capture_id !== job.capture_id) {
        throw new Error("analysis job references a missing or mismatched stage artifact");
      }
      artifacts.push(artifact);
    }
    return artifacts;
  }

  private async stopForHumanReview(
    job: AnalysisJob,
    reason: string,
    stage?: AnalysisStage
  ): Promise<AnalysisJob> {
    const stopped: AnalysisJob = {
      ...base(job),
      status: "HUMAN_REVIEW_REQUIRED",
      ...(stage ? { stage } : {}),
      reason,
      stopped_at: this.clock(),
      updated_at: this.clock()
    };
    await this.jobs.put(stopped);
    return stopped;
  }

  private async runSerialized(jobId: string, signal: AbortSignal): Promise<AnalysisJob> {
    const initialJob = await this.jobs.get(jobId);
    if (!initialJob) throw new Error("analysis job does not exist");
    let job: AnalysisJob = initialJob;
    if (job.status === "completed" || job.status === "failed" || job.status === "HUMAN_REVIEW_REQUIRED") {
      return job;
    }

    const interrupted = unmatchedStarted(await this.audits.list(job.id));
    if (interrupted) {
      return this.stopForHumanReview(job, "INTERRUPTED_PROVIDER_CALL", interrupted.stage);
    }

    let completed = await this.loadCompleted(job);
    for (const stage of STAGE_ORDER) {
      const handler = this.handlers.get(stage)!;
      const context = (): AnalysisStageContext => ({
        job,
        completedArtifacts: completed,
        signal,
        readPayload: (artifactId) => this.artifacts.readPayload(artifactId)
      });
      if (handler.shouldRun && !(await handler.shouldRun(context()))) continue;

      let artifact = completed.find((candidate) => candidate.stage === stage) ?? null;
      if (!artifact) artifact = await this.artifacts.findByJobStage(job.id, stage);
      if (artifact) {
        if (artifact.capture_id !== job.capture_id) {
          throw new Error("recovered stage artifact belongs to another Capture");
        }
        if (!job.completed_artifact_ids.includes(artifact.id)) {
          const ids: string[] = [...job.completed_artifact_ids, artifact.id];
          job = stage === "review_packet"
            ? {
              ...base(job, ids),
              status: "completed",
              review_packet_artifact_id: artifact.id,
              completed_at: this.clock(),
              updated_at: this.clock()
            }
            : {
              ...base(job, ids),
              status: "running",
              stage,
              started_at: job.status === "running" ? job.started_at : this.clock(),
              updated_at: this.clock()
            };
          await this.jobs.put(job);
          completed = [...completed, artifact];
        }
        if (job.status === "completed") return job;
        continue;
      }

      const priorStageAudits = (await this.audits.list(job.id)).filter((event) => event.stage === stage);
      if (priorStageAudits.length > 0) {
        return this.stopForHumanReview(job, "INTERRUPTED_PROVIDER_CALL", stage);
      }

      if (signal.aborted) return this.stopForHumanReview(job, "ABORTED", stage);
      const startedAt = this.clock();
      job = {
        ...base(job),
        status: "running",
        stage,
        started_at: startedAt,
        updated_at: startedAt
      };
      await this.jobs.put(job);

      let result: AnalysisStageRunResult;
      try {
        result = await handler.run(context());
      } catch (error) {
        const interruptedDuringRun = unmatchedStarted(await this.audits.list(job.id));
        if (interruptedDuringRun) {
          return this.stopForHumanReview(job, "INTERRUPTED_PROVIDER_CALL", interruptedDuringRun.stage);
        }
        const failed: AnalysisJob = {
          ...base(job),
          status: "failed",
          stage,
          error_code: "INTERNAL_ERROR",
          reason: error instanceof Error ? error.message : "analysis stage failed",
          failed_at: this.clock(),
          updated_at: this.clock()
        };
        await this.jobs.put(failed);
        return failed;
      }
      if (result.kind === "human_review") {
        return this.stopForHumanReview(job, result.reason, stage);
      }

      const interruptedAfterRun = unmatchedStarted(await this.audits.list(job.id));
      if (interruptedAfterRun) {
        return this.stopForHumanReview(job, "INTERRUPTED_PROVIDER_CALL", interruptedAfterRun.stage);
      }
      artifact = await this.artifacts.create({
        jobId: job.id,
        captureId: job.capture_id,
        stage,
        inputDigest: result.inputDigest,
        payload: result.payload,
        createdAt: this.clock()
      });
      await this.afterArtifactPersisted(artifact);

      const ids: string[] = [...job.completed_artifact_ids, artifact.id];
      completed = [...completed, artifact];
      job = stage === "review_packet"
        ? {
          ...base(job, ids),
          status: "completed",
          review_packet_artifact_id: artifact.id,
          completed_at: this.clock(),
          updated_at: this.clock()
        }
        : {
          ...base(job, ids),
          status: "running",
          stage,
          started_at: startedAt,
          updated_at: this.clock()
        };
      await this.jobs.put(job);
      if (job.status === "completed") return job;
    }

    throw new Error("analysis workflow ended without a review packet artifact");
  }
}
