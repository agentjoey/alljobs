import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisJob, AnalysisStage } from "../analysis/types";
import { buildModelCallAuditEvent } from "./audit";
import {
  FilesystemAnalysisJobStore,
  FilesystemModelCallAuditStore,
  FilesystemStageArtifactStore
} from "./filesystem";
import { AnalysisWorkflowRunner, type AnalysisStageHandler } from "./runner";

const JOB_ID = `job_${"a".repeat(32)}`;
const CAPTURE_ID = `cap_${"b".repeat(32)}`;
const NOW = "2026-09-16T05:00:00.000Z";
const roots: string[] = [];

function root(): string {
  const fixture = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "alljobs-caphub-runner-")));
  roots.push(fixture);
  const value = join(fixture, "home", "state", "caphub");
  mkdirSync(value, { recursive: true, mode: 0o700 });
  chmodSync(value, 0o700);
  return realpathSync(value);
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function queued(): AnalysisJob {
  return {
    schema_version: 1,
    id: JOB_ID,
    capture_id: CAPTURE_ID,
    input_digest: "c".repeat(64),
    completed_artifact_ids: [],
    status: "queued",
    created_at: NOW,
    updated_at: NOW
  };
}

const stages: AnalysisStage[] = ["preprocess", "extraction", "research", "assessment", "critic", "review_packet"];

function handlers(calls: AnalysisStage[], delay = false): AnalysisStageHandler[] {
  return stages.map((stage) => ({
    stage,
    shouldRun: stage === "critic" ? () => false : undefined,
    async run() {
      calls.push(stage);
      if (delay) await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        kind: "success" as const,
        inputDigest: `${stages.indexOf(stage) + 1}`.repeat(64),
        payload: { schema_version: 1, stage }
      };
    }
  }));
}

async function setup(value = root()) {
  const jobs = new FilesystemAnalysisJobStore(value);
  const artifacts = new FilesystemStageArtifactStore(value);
  const audits = new FilesystemModelCallAuditStore(value);
  await jobs.put(queued());
  return { value, jobs, artifacts, audits };
}

describe("resumable analysis workflow", () => {
  it("treats imported waiting and reviewed jobs as terminal workflow states", async () => {
    const stores = await setup();
    const artifactId = `art_${"d".repeat(64)}`;
    const requestId = `rev_${"e".repeat(32)}`;
    const decisionId = `dec_${"f".repeat(32)}`;
    const waiting: AnalysisJob = {
      ...queued(),
      completed_artifact_ids: [artifactId],
      status: "WAITING_FOR_REVIEW",
      review_packet_artifact_id: artifactId,
      review_request_id: requestId,
      waiting_at: NOW
    };
    await stores.jobs.put(waiting);
    const calls: AnalysisStage[] = [];
    const runner = new AnalysisWorkflowRunner({ ...stores, handlers: handlers(calls), clock: () => NOW });
    await expect(runner.runAnalysisJob(JOB_ID, new AbortController().signal)).resolves.toEqual(waiting);

    const reviewed: AnalysisJob = {
      ...queued(),
      completed_artifact_ids: [artifactId],
      status: "reviewed",
      review_packet_artifact_id: artifactId,
      review_request_id: requestId,
      review_decision_id: decisionId,
      decision: { outcome: "approve", disposition: "build" },
      reviewed_at: NOW
    };
    await stores.jobs.put(reviewed);
    await expect(runner.runAnalysisJob(JOB_ID, new AbortController().signal)).resolves.toEqual(reviewed);
    expect(calls).toEqual([]);
  });

  it("runs the fixed order, skips an unneeded critic, and never repeats completed stages", async () => {
    const stores = await setup();
    const calls: AnalysisStage[] = [];
    const runner = new AnalysisWorkflowRunner({ ...stores, handlers: handlers(calls), clock: () => NOW });
    const first = await runner.runAnalysisJob(JOB_ID, new AbortController().signal);
    const second = await runner.runAnalysisJob(JOB_ID, new AbortController().signal);

    expect(first.status).toBe("completed");
    expect(second).toEqual(first);
    expect(calls).toEqual(["preprocess", "extraction", "research", "assessment", "review_packet"]);
    expect(first.completed_artifact_ids).toHaveLength(5);
  });

  it("recovers an immutable artifact written before each job-pointer update without rerunning that stage", async () => {
    for (const crashStage of ["preprocess", "extraction", "research", "assessment", "review_packet"] as const) {
      const stores = await setup();
      const firstCalls: AnalysisStage[] = [];
      const crashing = new AnalysisWorkflowRunner({
        ...stores,
        handlers: handlers(firstCalls),
        clock: () => NOW,
        afterArtifactPersisted: async (artifact) => {
          if (artifact.stage === crashStage) throw new Error(`crash after ${crashStage}`);
        }
      });
      await expect(crashing.runAnalysisJob(JOB_ID, new AbortController().signal)).rejects.toThrow(
        `crash after ${crashStage}`
      );

      const resumedCalls: AnalysisStage[] = [];
      const resumed = new AnalysisWorkflowRunner({
        ...stores,
        handlers: handlers(resumedCalls),
        clock: () => NOW
      });
      await expect(resumed.runAnalysisJob(JOB_ID, new AbortController().signal)).resolves.toMatchObject({ status: "completed" });
      expect(resumedCalls).not.toContain(crashStage);
    }
  });

  it("serializes concurrent runs of the same job", async () => {
    const stores = await setup();
    const calls: AnalysisStage[] = [];
    const runner = new AnalysisWorkflowRunner({ ...stores, handlers: handlers(calls, true), clock: () => NOW });
    const [left, right] = await Promise.all([
      runner.runAnalysisJob(JOB_ID, new AbortController().signal),
      runner.runAnalysisJob(JOB_ID, new AbortController().signal)
    ]);
    expect(left).toEqual(right);
    expect(calls).toEqual(["preprocess", "extraction", "research", "assessment", "review_packet"]);
  });

  it("routes an unmatched provider started audit to Human review without another call", async () => {
    const stores = await setup();
    const provider = { calls: 0 };
    await stores.audits.append(buildModelCallAuditEvent({
      jobId: JOB_ID,
      captureId: CAPTURE_ID,
      stage: "extraction",
      provider: "minimax",
      model: "MiniMax-M3",
      attempt: 1,
      inputDigest: "d".repeat(64),
      inputBytes: 100,
      occurredAt: NOW
    }, { type: "started" }));
    const stageHandlers = handlers([]).map((handler) => handler.stage === "extraction" ? {
      ...handler,
      run: vi.fn(async () => {
        provider.calls += 1;
        return handler.run({} as never);
      })
    } : handler);
    const runner = new AnalysisWorkflowRunner({ ...stores, handlers: stageHandlers, clock: () => NOW });
    const resumed = await runner.runAnalysisJob(JOB_ID, new AbortController().signal);

    expect(provider.calls).toBe(0);
    expect(resumed.status).toBe("HUMAN_REVIEW_REQUIRED");
    expect(resumed).toMatchObject({ reason: "INTERRUPTED_PROVIDER_CALL", stage: "extraction" });
  });

  it("does not repeat a provider stage when terminal audit exists but its artifact was not committed", async () => {
    const stores = await setup();
    const calls: AnalysisStage[] = [];
    const base = {
      jobId: JOB_ID,
      captureId: CAPTURE_ID,
      stage: "research" as const,
      provider: "kimi" as const,
      model: "k3-256k",
      attempt: 1 as const,
      inputDigest: "e".repeat(64),
      inputBytes: 100,
      occurredAt: NOW
    };
    await stores.audits.append(buildModelCallAuditEvent(base, { type: "started" }));
    await stores.audits.append(buildModelCallAuditEvent(base, {
      type: "succeeded",
      outputDigest: "f".repeat(64),
      inputTokens: 10,
      outputTokens: 10
    }));

    const runner = new AnalysisWorkflowRunner({ ...stores, handlers: handlers(calls), clock: () => NOW });
    const result = await runner.runAnalysisJob(JOB_ID, new AbortController().signal);

    expect(result).toMatchObject({
      status: "HUMAN_REVIEW_REQUIRED",
      stage: "research",
      reason: "INTERRUPTED_PROVIDER_CALL"
    });
    expect(calls).toEqual(["preprocess", "extraction"]);
  });
});
