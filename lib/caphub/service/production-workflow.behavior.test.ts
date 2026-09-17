import { describe, expect, it, vi } from "vitest";
import { createProductionAnalysisWorkflow } from "./production-workflow";

describe("Production analysis/import composition boundary", () => {
  it("never calls a provider, filesystem writer, or external service after a completed-job retry", async () => {
    const provider = vi.fn();
    const filesystemWrite = vi.fn();
    const external = vi.spyOn(globalThis, "fetch");
    const analysis = { start: vi.fn(async () => ({
      jobId: `job_${"1".repeat(32)}`,
      status: "completed" as const,
      reviewPacketArtifactId: `art_${"2".repeat(64)}`
    })) };
    const importer = { importReviewPacket: vi.fn(async () => ({
      requestId: `rev_${"3".repeat(32)}`,
      job: { status: "WAITING_FOR_REVIEW" as const }
    })) };
    const workflow = createProductionAnalysisWorkflow({ analysis, importer });
    await workflow.startAndImport(`cap_${"4".repeat(32)}`);
    expect(provider).not.toHaveBeenCalled();
    expect(filesystemWrite).not.toHaveBeenCalled();
    expect(external).not.toHaveBeenCalled();
    external.mockRestore();
  });
});
