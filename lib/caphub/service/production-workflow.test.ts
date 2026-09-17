import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createProductionAnalysisWorkflow,
  loadControlHostProductionWorkflow
} from "./production-workflow";

const CAPTURE_ID = `cap_${"a".repeat(32)}`;
const JOB_ID = `job_${"b".repeat(32)}`;
const ARTIFACT_ID = `art_${"c".repeat(64)}`;
const REQUEST_ID = `rev_${"d".repeat(32)}`;

describe("ProductionAnalysisWorkflow", () => {
  it("imports a completed ReviewPacket and returns metadata-only identifiers", async () => {
    const analysis = { start: vi.fn(async () => ({
      jobId: JOB_ID,
      status: "completed" as const,
      reviewPacketArtifactId: ARTIFACT_ID
    })) };
    const importer = { importReviewPacket: vi.fn(async () => ({
      requestId: REQUEST_ID,
      job: { status: "WAITING_FOR_REVIEW" as const }
    })) };
    const workflow = createProductionAnalysisWorkflow({ analysis, importer });
    await expect(workflow.startAndImport(CAPTURE_ID)).resolves.toEqual({
      captureId: CAPTURE_ID,
      jobId: JOB_ID,
      analysisStatus: "WAITING_FOR_REVIEW",
      reviewPacketArtifactId: ARTIFACT_ID,
      reviewRequestId: REQUEST_ID
    });
    expect(importer.importReviewPacket).toHaveBeenCalledWith({ jobId: JOB_ID });
  });

  it("leaves human-review and failed terminals unimported", async () => {
    for (const status of ["HUMAN_REVIEW_REQUIRED", "failed"] as const) {
      const importer = { importReviewPacket: vi.fn() };
      const workflow = createProductionAnalysisWorkflow({
        analysis: { start: vi.fn(async () => ({ jobId: JOB_ID, status, reviewPacketArtifactId: null })) },
        importer
      });
      await expect(workflow.startAndImport(CAPTURE_ID)).resolves.toMatchObject({
        analysisStatus: status,
        reviewRequestId: null
      });
      expect(importer.importReviewPacket).not.toHaveBeenCalled();
    }
  });

  it("retries import after a post-analysis failure without owning any provider call", async () => {
    const analysis = { start: vi.fn(async () => ({
      jobId: JOB_ID,
      status: "completed" as const,
      reviewPacketArtifactId: ARTIFACT_ID
    })) };
    const importer = { importReviewPacket: vi.fn()
      .mockRejectedValueOnce(new Error("injected import failure"))
      .mockResolvedValueOnce({ requestId: REQUEST_ID, job: { status: "WAITING_FOR_REVIEW" } }) };
    const workflow = createProductionAnalysisWorkflow({ analysis, importer });
    await expect(workflow.startAndImport(CAPTURE_ID)).rejects.toThrow(/import failure/);
    await expect(workflow.startAndImport(CAPTURE_ID)).resolves.toMatchObject({ reviewRequestId: REQUEST_ID });
    expect(importer.importReviewPacket).toHaveBeenCalledTimes(2);
  });

  it("fails on a disabled Registry before resolving any provider secret", async () => {
    const home = mkdtempSync(join(tmpdir(), "caphub-production-workflow-"));
    try {
      chmodSync(home, 0o700);
      const trusted = join(home, "trusted");
      mkdirSync(trusted, { mode: 0o700 });
      writeFileSync(join(home, "config.json"), JSON.stringify({
        trustedCodeRoots: [trusted],
        caphub: {
          enabled: true,
          registry: { enabled: false },
          analysis: { enabled: true }
        }
      }), { mode: 0o600 });

      await expect(loadControlHostProductionWorkflow({ home, env: {} }))
        .rejects.toMatchObject({ code: "REGISTRY_DISABLED" });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
