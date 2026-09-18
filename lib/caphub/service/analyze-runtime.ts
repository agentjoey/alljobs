import "server-only";

import { loadControlHostConfig } from "../../planning/config";
import { createPackagedTesseractRecognizer, decodeBarcodesWithZxing } from "../preprocess/image";
import { DeepSeekProvider } from "../providers/deepseek";
import { DeepSeekResponsesAdapter } from "../providers/deepseek-responses";
import { MiniMaxProvider } from "../providers/minimax";
import {
  DisabledResearchSourceGateway,
  LiveResearchSourceGateway,
  type ResearchSourceGateway
} from "../research/source-gateway";
import { ExactHttpsSourcePolicy } from "../research/source-policy";
import { FilesystemCaptureStore } from "../storage/filesystem";
import { LocalCaptureObjectStore } from "../storage/local-objects";
import {
  FilesystemAnalysisJobStore,
  FilesystemModelCallAuditStore,
  FilesystemStageArtifactStore
} from "../workflow/filesystem";
import { AnalysisServiceError, createAnalysisService, type AnalysisService } from "./analyze";
import { loadControlHostRegistryRuntime, type ControlHostRegistryRuntime } from "../registry/runtime";

function requiredSecret(
  env: Readonly<Record<string, string | undefined>>,
  name: string
): string {
  const value = env[name];
  if (!value) throw new Error(`Required Control Host secret environment variable is not set: ${name}`);
  return value;
}

function createSourceGateway(allowedOrigins: readonly string[]): ResearchSourceGateway {
  if (allowedOrigins.length === 0) return new DisabledResearchSourceGateway();
  return new LiveResearchSourceGateway({
    policy: new ExactHttpsSourcePolicy({ allowedOrigins })
  });
}

export async function loadControlHostAnalysisService(options: {
  env?: Readonly<Record<string, string | undefined>>;
  home?: string;
  registryRuntime?: ControlHostRegistryRuntime;
} = {}): Promise<AnalysisService> {
  const resolved = loadControlHostConfig(options.home);
  const caphub = resolved.config.caphub;
  if (!caphub?.enabled || !caphub.analysis.enabled) {
    throw new AnalysisServiceError("ANALYSIS_DISABLED");
  }
  const root = resolved.caphubStateDir;
  if (!root) throw new Error("Resolved Caphub state directory is unavailable");
  const env = options.env ?? process.env;
  const registry = options.registryRuntime ?? (caphub.registry.enabled
    ? await loadControlHostRegistryRuntime({ resolved, env })
    : null);
  const miniMax = new MiniMaxProvider({
    apiKey: requiredSecret(env, caphub.analysis.miniMaxSecretEnv)
  });
  const deepSeek = new DeepSeekProvider({
    adapter: new DeepSeekResponsesAdapter({
      apiKey: requiredSecret(env, caphub.analysis.deepSeekApiSecretEnv)
    })
  });
  const captures = registry?.captures ?? new FilesystemCaptureStore(root);
  const objects = registry?.objects ?? new LocalCaptureObjectStore(root);

  return createAnalysisService({
    config: { caphubEnabled: caphub.enabled, analysisEnabled: caphub.analysis.enabled },
    captures,
    readObject: (capture) => objects.readImmutable(capture.object),
    preprocessDependencies: {
      recognizeText: createPackagedTesseractRecognizer("eng"),
      decodeBarcodes: decodeBarcodesWithZxing
    },
    extractionProvider: miniMax,
    researchProvider: deepSeek,
    assessmentProvider: deepSeek,
    criticProvider: miniMax,
    sourceGateway: () => createSourceGateway(caphub.analysis.sourceAllowedOrigins),
    jobs: registry?.jobs ?? new FilesystemAnalysisJobStore(root),
    artifacts: registry?.artifacts ?? new FilesystemStageArtifactStore(root),
    audits: registry?.modelAudits ?? new FilesystemModelCallAuditStore(root),
    clock: () => new Date()
  });
}
