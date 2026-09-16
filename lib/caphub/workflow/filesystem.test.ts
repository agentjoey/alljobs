import { randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisJob } from "../analysis/types";
import { buildModelCallAuditEvent } from "./audit";
import {
  FilesystemAnalysisJobStore,
  FilesystemModelCallAuditStore,
  FilesystemStageArtifactStore,
  ImmutableWorkflowRecordError
} from "./filesystem";

const PREFIX = "alljobs-caphub-workflow-";
const SENTINEL = ".owner.json";
const JOB_ID = `job_${"1".repeat(32)}`;
const CAPTURE_ID = `cap_${"2".repeat(32)}`;
const NOW = "2026-09-16T04:00:00.000Z";
const fixtures: Array<{ root: string; token: string }> = [];

function fixtureRoot(): string {
  const parent = realpathSync(tmpdir());
  const fixture = realpathSync(mkdtempSync(join(parent, PREFIX)));
  const token = randomUUID();
  writeFileSync(join(fixture, SENTINEL), JSON.stringify({ token, pid: process.pid }), { mode: 0o600 });
  fixtures.push({ root: fixture, token });
  const root = join(fixture, "home", "state", "caphub");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  return realpathSync(root);
}

afterEach(() => {
  while (fixtures.length) {
    const fixture = fixtures.pop()!;
    const sentinel = join(fixture.root, SENTINEL);
    const owner = JSON.parse(readFileSync(sentinel, "utf8"));
    if (
      dirname(fixture.root) !== realpathSync(tmpdir())
      || !basename(fixture.root).startsWith(PREFIX)
      || lstatSync(fixture.root).isSymbolicLink()
      || owner.token !== fixture.token
      || owner.pid !== process.pid
    ) throw new Error("unsafe workflow fixture cleanup");
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

function queued(overrides: Partial<AnalysisJob> = {}): AnalysisJob {
  return {
    schema_version: 1,
    id: JOB_ID,
    capture_id: CAPTURE_ID,
    input_digest: "3".repeat(64),
    completed_artifact_ids: [],
    status: "queued",
    created_at: NOW,
    updated_at: NOW,
    ...overrides
  } as AnalysisJob;
}

describe("filesystem analysis workflow stores", () => {
  it("atomically replaces mutable jobs while preserving the old record on an injected pre-replace failure", async () => {
    const root = fixtureRoot();
    const store = new FilesystemAnalysisJobStore(root);
    await store.put(queued());
    const running = queued({ status: "running", stage: "preprocess", started_at: NOW });
    await store.put(running);
    await expect(store.get(JOB_ID)).resolves.toEqual(running);

    const failing = new FilesystemAnalysisJobStore(root, {
      beforeReplace: async () => { throw new Error("injected atomic replacement failure"); }
    });
    await expect(failing.put(queued({ updated_at: "2026-09-16T04:01:00.000Z" }))).rejects.toThrow(
      "injected atomic replacement failure"
    );
    await expect(store.get(JOB_ID)).resolves.toEqual(running);
    expect(readdirSync(join(root, "records", "analysis-jobs"))).toEqual([`${JOB_ID}.json`]);
  });

  it("persists content-addressed immutable artifacts and rejects conflicting descriptor bytes", async () => {
    const root = fixtureRoot();
    const store = new FilesystemStageArtifactStore(root);
    const artifact = await store.create({
      jobId: JOB_ID,
      captureId: CAPTURE_ID,
      stage: "preprocess",
      inputDigest: "4".repeat(64),
      payload: { schema_version: 1, value: "stable" },
      createdAt: NOW
    });
    await expect(store.get(artifact.id)).resolves.toEqual(artifact);
    await expect(store.readPayload(artifact.id)).resolves.toEqual({ schema_version: 1, value: "stable" });
    await expect(store.findByJobStage(JOB_ID, "preprocess")).resolves.toEqual(artifact);
    await expect(store.create({
      jobId: JOB_ID,
      captureId: CAPTURE_ID,
      stage: "preprocess",
      inputDigest: "4".repeat(64),
      payload: { schema_version: 1, value: "stable" },
      createdAt: NOW
    })).resolves.toEqual(artifact);

    const recordPath = join(root, "records", "analysis-artifacts", `${artifact.id}.json`);
    writeFileSync(recordPath, `${JSON.stringify({ ...artifact, job_id: `job_${"9".repeat(32)}` })}\n`, { mode: 0o600 });
    await expect(store.create({
      jobId: JOB_ID,
      captureId: CAPTURE_ID,
      stage: "preprocess",
      inputDigest: "4".repeat(64),
      payload: { schema_version: 1, value: "stable" },
      createdAt: NOW
    })).rejects.toBeInstanceOf(ImmutableWorkflowRecordError);
  });

  it("appends deterministic idempotent model-call events and rejects same-ID content conflicts", async () => {
    const root = fixtureRoot();
    const store = new FilesystemModelCallAuditStore(root);
    const base = {
      jobId: JOB_ID,
      captureId: CAPTURE_ID,
      stage: "extraction" as const,
      provider: "minimax" as const,
      model: "MiniMax-M3",
      attempt: 1 as const,
      inputDigest: "5".repeat(64),
      inputBytes: 100,
      occurredAt: NOW
    };
    const started = buildModelCallAuditEvent(base, { type: "started" });
    await store.append(started);
    await store.append(started);
    await expect(store.list(JOB_ID)).resolves.toEqual([started]);
    await expect(store.append({ ...started, occurred_at: "2026-09-16T04:02:00.000Z" })).rejects.toBeInstanceOf(
      ImmutableWorkflowRecordError
    );
    await expect(store.append({ ...started, event_id: `mce_${"f".repeat(32)}` })).rejects.toThrow(/deterministic/i);
  });

  it("creates 0700 directories and 0600 files and rejects symlinked storage descendants", async () => {
    const root = fixtureRoot();
    const jobs = new FilesystemAnalysisJobStore(root);
    const artifacts = new FilesystemStageArtifactStore(root);
    const audits = new FilesystemModelCallAuditStore(root);
    await jobs.put(queued());
    const artifact = await artifacts.create({
      jobId: JOB_ID,
      captureId: CAPTURE_ID,
      stage: "preprocess",
      inputDigest: "6".repeat(64),
      payload: { schema_version: 1 },
      createdAt: NOW
    });
    await audits.append(buildModelCallAuditEvent({
      jobId: JOB_ID,
      captureId: CAPTURE_ID,
      stage: "extraction",
      provider: "minimax",
      model: "MiniMax-M3",
      attempt: 1,
      inputDigest: "7".repeat(64),
      inputBytes: 1,
      occurredAt: NOW
    }, { type: "started" }));

    for (const directory of [
      join(root, "records"),
      join(root, "records", "analysis-jobs"),
      join(root, "records", "analysis-artifacts"),
      join(root, "events", "model-calls")
    ]) expect(statSync(directory).mode & 0o777).toBe(0o700);
    for (const file of [
      join(root, "records", "analysis-jobs", `${JOB_ID}.json`),
      join(root, "records", "analysis-artifacts", `${artifact.id}.json`),
      join(root, "events", "model-calls", `${JOB_ID}.jsonl`)
    ]) expect(statSync(file).mode & 0o777).toBe(0o600);

    const secondRoot = fixtureRoot();
    const outside = join(dirname(dirname(dirname(secondRoot))), "outside-records");
    mkdirSync(outside, { mode: 0o700 });
    symlinkSync(outside, join(secondRoot, "records"), "dir");
    await expect(new FilesystemAnalysisJobStore(secondRoot).put(queued())).rejects.toThrow(/symlink/i);
  });
});
