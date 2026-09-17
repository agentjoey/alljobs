import "server-only";

import { loadControlHostConfig } from "../../planning/config";
import { createReviewPacketImporter } from "../registry/import-review-packet";
import { loadControlHostRegistryRuntime, RegistryRuntimeError } from "../registry/runtime";
import type { AnalysisService } from "./analyze";
import { AnalysisServiceError } from "./analyze";
import { loadControlHostAnalysisService } from "./analyze-runtime";

export interface ProductionAnalysisResult {
  captureId: string;
  jobId: string;
  analysisStatus: string;
  reviewPacketArtifactId: string | null;
  reviewRequestId: string | null;
}

export interface ProductionAnalysisWorkflow {
  startAndImport(captureId: string, signal?: AbortSignal): Promise<ProductionAnalysisResult>;
}

export interface ProductionAnalysisWorkflowDependencies {
  analysis: Pick<AnalysisService, "start">;
  importer: {
    importReviewPacket(input: { jobId: string }): Promise<{
      requestId: string;
      job: { status: string };
    }>;
  };
}

export function createProductionAnalysisWorkflow(
  dependencies: ProductionAnalysisWorkflowDependencies
): ProductionAnalysisWorkflow {
  return {
    async startAndImport(captureId, signal) {
      const analysis = await dependencies.analysis.start(captureId, signal);
      if (analysis.status !== "completed" && analysis.status !== "WAITING_FOR_REVIEW") {
        return {
          captureId,
          jobId: analysis.jobId,
          analysisStatus: analysis.status,
          reviewPacketArtifactId: analysis.reviewPacketArtifactId,
          reviewRequestId: null
        };
      }
      if (!analysis.reviewPacketArtifactId) throw new Error("completed analysis is missing its ReviewPacket artifact");
      const imported = await dependencies.importer.importReviewPacket({ jobId: analysis.jobId });
      return {
        captureId,
        jobId: analysis.jobId,
        analysisStatus: imported.job.status,
        reviewPacketArtifactId: analysis.reviewPacketArtifactId,
        reviewRequestId: imported.requestId
      };
    }
  };
}

export async function loadControlHostProductionWorkflow(options: {
  env?: Readonly<Record<string, string | undefined>>;
  home?: string;
} = {}): Promise<ProductionAnalysisWorkflow> {
  const resolved = loadControlHostConfig(options.home);
  const caphub = resolved.config.caphub;
  if (!caphub?.enabled || !caphub.analysis.enabled) throw new AnalysisServiceError("ANALYSIS_DISABLED");
  if (!caphub.registry.enabled) throw new RegistryRuntimeError("REGISTRY_DISABLED");
  const env = options.env ?? process.env;
  const registry = await loadControlHostRegistryRuntime({ resolved, env });
  const analysis = await loadControlHostAnalysisService({
    env,
    home: options.home,
    registryRuntime: registry
  });
  const importer = createReviewPacketImporter({
    pool: registry.pool,
    captures: registry.captures,
    jobs: registry.jobs,
    artifacts: registry.artifacts,
    clock: () => new Date().toISOString()
  });
  return createProductionAnalysisWorkflow({ analysis, importer });
}
