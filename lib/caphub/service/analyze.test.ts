import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { objectRefFor } from "../preprocess/fixtures";
import { FilesystemAnalysisJobStore, FilesystemModelCallAuditStore, FilesystemStageArtifactStore } from "../workflow/filesystem";
import { analysisJobRecordPath } from "../storage/paths";
import { createAnalysisService } from "./analyze";

const CAPTURE_ID = `cap_${"1".repeat(32)}`;

function minimalDependencies(overrides: Record<string, unknown> = {}) {
  return {
    config: { caphubEnabled: true, analysisEnabled: true },
    captures: { get: vi.fn(async () => null) },
    readObject: vi.fn(),
    preprocessDependencies: { recognizeText: vi.fn(), decodeBarcodes: vi.fn() },
    extractionObserver: { provider: "minimax", model: "MiniMax-M3", observe: vi.fn() },
    extractionStructurer: { provider: "deepseek", model: "deepseek-flash", structureExtraction: vi.fn() },
    researchSearchProvider: { provider: "minimax", model: "MiniMax-M3", search: vi.fn() },
    researchProvider: { provider: "deepseek", model: "deepseek-flash", invoke: vi.fn() },
    assessmentProvider: { provider: "deepseek", model: "deepseek-flash", invoke: vi.fn() },
    criticProvider: { provider: "minimax", model: "MiniMax-M3", invoke: vi.fn() },
    sourceGateway: () => ({ search: vi.fn(), fetch: vi.fn() }),
    jobs: { get: vi.fn(), put: vi.fn() },
    artifacts: { get: vi.fn(), create: vi.fn(), readPayload: vi.fn(), findByJobStage: vi.fn() },
    audits: { append: vi.fn(), list: vi.fn(async () => []) },
    clock: () => new Date("2026-09-16T06:00:00.000Z"),
    ...overrides
  };
}

describe("Caphub analysis service boundaries", () => {
  it.each(["extractionObserver", "extractionStructurer", "researchSearchProvider", "researchProvider", "assessmentProvider", "criticProvider"])("rejects incorrect provider ownership for %s", (role) => {
    const dependencies = minimalDependencies();
    expect(() => createAnalysisService({ ...dependencies, [role]: { provider: "kimi", model: "wrong" } } as never))
      .toThrow("analysis providers do not match their fixed stage responsibilities");
  });

  it("fails closed before storage or provider construction when Caphub or analysis is disabled", async () => {
    for (const config of [
      { caphubEnabled: false, analysisEnabled: true },
      { caphubEnabled: true, analysisEnabled: false }
    ]) {
      const captures = { get: vi.fn() };
      const service = createAnalysisService(minimalDependencies({ config, captures }) as never);
      await expect(service.start(CAPTURE_ID)).rejects.toMatchObject({
        code: "ANALYSIS_DISABLED"
      });
      expect(captures.get).not.toHaveBeenCalled();
    }
  });

  it("rejects malformed or missing Capture IDs without a provider call", async () => {
    const dependencies = minimalDependencies();
    const service = createAnalysisService(dependencies as never);
    await expect(service.start("../../capture")).rejects.toMatchObject({ code: "INVALID_CAPTURE_ID" });
    await expect(service.start(CAPTURE_ID)).rejects.toMatchObject({ code: "CAPTURE_NOT_FOUND" });
    expect(dependencies.extractionObserver.observe).not.toHaveBeenCalled();
    expect(dependencies.extractionStructurer.structureExtraction).not.toHaveBeenCalled();
    expect(dependencies.researchProvider.invoke).not.toHaveBeenCalled();
  });
});

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("analysis contract job identity", () => {
  it.each([false, true])("starts one deterministic v4 job with immutable v3 lineage when predecessor exists=%s", async (hasPredecessor) => {
    const owned = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "alljobs-analysis-lineage-")));
    roots.push(owned);
    const root = join(owned, "home", "state", "caphub");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
    const jobs = new FilesystemAnalysisJobStore(root);
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const capture = {
      schema_version: 1, id: CAPTURE_ID, source: { kind: "web", original_filename: "fixture.png" },
      note: "Fixture", mime_type: "image/png", object: objectRefFor(bytes), idempotency_key: "capture.lineage-0001",
      status: "received", human_review_required: true, created_at: "2026-09-16T06:00:00.000Z"
    };
    // Independently reproduce the documented v3 and v4 identity contracts.
    const v3Id = `job_${createHash("sha256").update(`${capture.id}\0${capture.object.digest}\0caphub-analysis-v3`).digest("hex").slice(0, 32)}`;
    const v4Id = `job_${createHash("sha256").update(`${capture.id}\0${capture.object.digest}\0caphub-analysis-v4`).digest("hex").slice(0, 32)}`;
    if (hasPredecessor) await jobs.put({
      schema_version: 1, id: v3Id, analysis_contract_version: "caphub-analysis-v3", capture_id: CAPTURE_ID, input_digest: "a".repeat(64),
      completed_artifact_ids: [], status: "HUMAN_REVIEW_REQUIRED", reason: "INVALID_OUTPUT",
      stopped_at: capture.created_at, created_at: capture.created_at, updated_at: capture.created_at
    });
    const v3Bytes = hasPredecessor ? readFileSync(analysisJobRecordPath(root, v3Id)) : null;
    const writes: unknown[] = [];
    const dependencies = minimalDependencies({
      captures: { get: async () => capture }, readObject: vi.fn(async () => bytes),
      jobs: { get: (id: string) => jobs.get(id), put: async (job: Parameters<typeof jobs.put>[0]) => { writes.push(job); await jobs.put(job); } },
      artifacts: new FilesystemStageArtifactStore(root), audits: new FilesystemModelCallAuditStore(root)
    });
    const service = createAnalysisService(dependencies as never);
    const controller = new AbortController();
    controller.abort();
    const first = await service.start(CAPTURE_ID, controller.signal);
    expect(v4Id).not.toBe(v3Id);
    expect(first).toMatchObject({ jobId: v4Id, status: "HUMAN_REVIEW_REQUIRED" });
    expect(writes[0]).toMatchObject({ schema_version: 1, id: v4Id, status: "queued", analysis_contract_version: "caphub-analysis-v4" });
    const versioned = await jobs.get(v4Id);
    expect(versioned).toHaveProperty("analysis_contract_version", "caphub-analysis-v4");
    if (hasPredecessor) expect(versioned).toHaveProperty("supersedes_job_id", v3Id);
    else expect(versioned).not.toHaveProperty("supersedes_job_id");
    const snapshot = readFileSync(analysisJobRecordPath(root, v4Id));
    dependencies.readObject.mockRejectedValueOnce(new Error("raw object expired"));
    expect(await service.start(CAPTURE_ID)).toEqual(first);
    expect(readFileSync(analysisJobRecordPath(root, v4Id))).toEqual(snapshot);
    if (v3Bytes) expect(readFileSync(analysisJobRecordPath(root, v3Id))).toEqual(v3Bytes);
    expect(dependencies.extractionObserver.observe).not.toHaveBeenCalled();
    expect(dependencies.extractionStructurer.structureExtraction).not.toHaveBeenCalled();
  });
});
