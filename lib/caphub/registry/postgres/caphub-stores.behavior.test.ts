import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { CaptureRecord } from "../../domain/types";
import type { AnalysisJob } from "../../analysis/types";
import { analysisJobSchema } from "../../analysis/schemas";
import { applyRegistryMigrations } from "../migrate";
import { startCaphubTestPostgres, type CaphubTestPostgres } from "../../../../tests/helpers/caphub-postgres";
import { PostgresAnalysisJobStore, PostgresCaptureStore, PostgresModelCallAuditStore, PostgresStageArtifactStore } from "./caphub-stores";
import { PostgresRegistryRecordStore } from "./records";
import { objectRefFor } from "../../preprocess/fixtures";
import { createAnalysisService } from "../../service/analyze";
import { MiniMaxProvider } from "../../providers/minimax";
import { DeepSeekProvider } from "../../providers/deepseek";
import { LiveResearchSourceGateway } from "../../research/source-gateway";

describe("application-role Capture writes", () => {
  let postgres: CaphubTestPostgres;

  beforeAll(async () => {
    postgres = await startCaphubTestPostgres();
    await applyRegistryMigrations(postgres.pool);
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  it("preserves lineage through queued, running, terminal and rejects identity mutations", async () => {
    const store = new PostgresAnalysisJobStore(postgres.appPool);
    const records = new PostgresRegistryRecordStore(postgres.appPool, { analysis_job: analysisJobSchema });
    const queued: AnalysisJob = {
      schema_version: 1, id: `job_${"a".repeat(32)}`, capture_id: `cap_${"a".repeat(32)}`,
      input_digest: "b".repeat(64), completed_artifact_ids: [], status: "queued",
      analysis_contract_version: "caphub-analysis-v2", supersedes_job_id: `job_${"c".repeat(32)}`,
      created_at: "2026-09-18T01:00:00.000Z", updated_at: "2026-09-18T01:00:00.000Z"
    };
    await store.put(queued);
    expect(await store.get(queued.id)).toEqual(queued);
    const running: AnalysisJob = { ...queued, status: "running", stage: "extraction", started_at: queued.created_at };
    const { supersedes_job_id: _predecessor, ...withoutLineage } = running;
    for (const mutation of [
      { ...running, supersedes_job_id: `job_${"d".repeat(32)}` },
      withoutLineage,
      { ...withoutLineage, analysis_contract_version: "caphub-analysis-v1" as const }
    ]) {
      await expect(store.put(mutation)).rejects.toMatchObject({ code: "INVALID_WORKFLOW_TRANSITION" });
    }
    await store.put(running);
    expect(await store.get(queued.id)).toEqual(running);
    const terminal: AnalysisJob = { ...queued, status: "HUMAN_REVIEW_REQUIRED", reason: "INTERRUPTED_PROVIDER_CALL", stopped_at: queued.created_at };
    await store.put(terminal);
    expect(await store.get(queued.id)).toEqual(terminal);
    expect(await records.getCurrent(queued.id)).toMatchObject({ version: 3, payload: terminal });
    await store.put(terminal);
    expect(await records.getCurrent(queued.id)).toMatchObject({ version: 3 });
  });

  it("creates a separate v4 job without changing the terminal v1 Registry payload or version", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const capture: CaptureRecord = {
      schema_version: 1, id: `cap_${"e".repeat(32)}`, source: { kind: "web", original_filename: "fixture.png" },
      note: "Lineage fixture", mime_type: "image/png", object: objectRefFor(bytes), idempotency_key: "capture.registry-lineage-0001",
      status: "received", human_review_required: true, created_at: "2026-09-18T01:00:00.000Z"
    };
    const captures = new PostgresCaptureStore(postgres.appPool);
    await captures.create(capture);
    const jobs = new PostgresAnalysisJobStore(postgres.appPool);
    const records = new PostgresRegistryRecordStore(postgres.appPool, { analysis_job: analysisJobSchema });
    const legacyId = `job_${createHash("sha256").update(`${capture.id}\0${capture.object.digest}`).digest("hex").slice(0, 32)}`;
    const v4Id = `job_${createHash("sha256").update(`${capture.id}\0${capture.object.digest}\0caphub-analysis-v4`).digest("hex").slice(0, 32)}`;
    const legacy = { schema_version: 1 as const, id: legacyId, capture_id: capture.id, input_digest: "f".repeat(64),
      completed_artifact_ids: [], created_at: capture.created_at, updated_at: capture.created_at };
    await jobs.put({ ...legacy, status: "queued" });
    await jobs.put({ ...legacy, status: "HUMAN_REVIEW_REQUIRED", reason: "SCHEMA_INVALID_TWICE", stopped_at: capture.created_at });
    const before = JSON.stringify(await records.getCurrent(legacyId));
    const miniMax = new MiniMaxProvider({ generate: async () => { throw new Error("Unexpected provider call"); } });
    const deepSeek = new DeepSeekProvider({ adapter: { generate: async () => { throw new Error("Unexpected provider call"); } } });
    const service = createAnalysisService({
      config: { caphubEnabled: true, analysisEnabled: true }, captures, readObject: async () => bytes,
      preprocessDependencies: { recognizeText: async () => [], decodeBarcodes: async () => [] },
      extractionObserver: miniMax, extractionStructurer: deepSeek,
      researchSearchProvider: { provider: "minimax", model: "MiniMax-M3", search: async () => { throw new Error("Unexpected provider call"); } },
      researchProvider: deepSeek, assessmentProvider: deepSeek, criticProvider: miniMax,
      sourceGateway: (search) => new LiveResearchSourceGateway({ search }), jobs,
      artifacts: new PostgresStageArtifactStore(postgres.appPool), audits: new PostgresModelCallAuditStore(postgres.appPool),
      clock: () => new Date(capture.created_at)
    });
    const controller = new AbortController();
    controller.abort();
    const first = await service.start(capture.id, controller.signal);
    expect(first.jobId).toBe(v4Id);
    expect(first.jobId).not.toBe(legacyId);
    expect(await jobs.get(v4Id)).toMatchObject({ analysis_contract_version: "caphub-analysis-v4", supersedes_job_id: legacyId });
    const currentV4 = await records.getCurrent(v4Id);
    expect(await service.start(capture.id)).toEqual(first);
    expect(await records.getCurrent(v4Id)).toEqual(currentV4);
    expect(JSON.stringify(await records.getCurrent(legacyId))).toBe(before);
    expect(await records.getCurrent(legacyId)).toMatchObject({ version: 2 });
  });

  it("creates and deduplicates through the least-privileged app role", async () => {
    const capture: CaptureRecord = {
      schema_version: 1,
      id: `cap_${"a".repeat(32)}`,
      source: { kind: "web", original_filename: "fixture.png" },
      note: "Application-role boundary",
      mime_type: "image/png",
      object: {
        algorithm: "sha256",
        digest: "b".repeat(64),
        key: `sha256/bb/${"b".repeat(64)}`,
        bytes: 68
      },
      idempotency_key: "capture.app-role-boundary-0001",
      status: "received",
      human_review_required: true,
      created_at: "2026-09-17T12:00:00.000Z"
    };
    const store = new PostgresCaptureStore(postgres.appPool);
    await expect(postgres.appPool.query(
      "SELECT capture_id FROM caphub.capture_idempotency WHERE idempotency_key=$1 FOR UPDATE",
      [capture.idempotency_key]
    )).rejects.toMatchObject({ code: "42501" });
    await expect(store.create(capture)).resolves.toBe("created");
    await expect(store.create(capture)).resolves.toBe("conflict");
    await expect(store.findByIdempotencyKey(capture.idempotency_key)).resolves.toEqual(capture);
  });
});
