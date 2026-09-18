import { describe, expect, it, vi } from "vitest";
import { createAnalysisService } from "./analyze";

const CAPTURE_ID = `cap_${"1".repeat(32)}`;

function minimalDependencies(overrides: Record<string, unknown> = {}) {
  return {
    config: { caphubEnabled: true, analysisEnabled: true },
    captures: { get: vi.fn(async () => null) },
    readObject: vi.fn(),
    preprocessDependencies: { recognizeText: vi.fn(), decodeBarcodes: vi.fn() },
    extractionProvider: { provider: "minimax", model: "MiniMax-M3", invoke: vi.fn() },
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
    expect(dependencies.extractionProvider.invoke).not.toHaveBeenCalled();
    expect(dependencies.researchProvider.invoke).not.toHaveBeenCalled();
  });
});
