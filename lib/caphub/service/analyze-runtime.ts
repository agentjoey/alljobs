import "server-only";

import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadControlHostConfig } from "../../planning/config";
import { createPackagedTesseractRecognizer, decodeBarcodesWithZxing } from "../preprocess/image";
import { KimiProvider } from "../providers/kimi";
import { KimiApiAdapter } from "../providers/kimi-api";
import { createKimiLocalRun, KimiLocalAdapter } from "../providers/kimi-local";
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
import { loadControlHostRegistryRuntime } from "../registry/runtime";

function requiredSecret(
  env: Readonly<Record<string, string | undefined>>,
  name: string
): string {
  const value = env[name];
  if (!value) throw new Error(`Required Control Host secret environment variable is not set: ${name}`);
  return value;
}

async function resolveKimiExecutable(): Promise<string> {
  const candidates = [
    join(homedir(), ".local", "bin", "kimi"),
    "/opt/homebrew/bin/kimi",
    "/usr/local/bin/kimi"
  ];
  for (const candidate of candidates) {
    try {
      return await realpath(candidate);
    } catch {
      // Continue through the fixed trusted installation locations.
    }
  }
  throw new Error("Kimi local-login executable is unavailable in a fixed Control Host location");
}

async function createKimiProvider(options: {
  mode: "api_key" | "local_login";
  secretEnv: string;
  env: Readonly<Record<string, string | undefined>>;
}) {
  if (options.mode === "api_key") {
    return new KimiProvider({
      mode: "api_key",
      adapter: new KimiApiAdapter({ apiKey: requiredSecret(options.env, options.secretEnv) })
    });
  }
  const run = createKimiLocalRun({
    executablePath: await resolveKimiExecutable(),
    sourceHome: join(homedir(), ".kimi"),
    agentProfilePath: fileURLToPath(new URL("../providers/profiles/kimi-research.md", import.meta.url))
  });
  return new KimiProvider({ mode: "local_login", adapter: new KimiLocalAdapter({ run }) });
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
} = {}): Promise<AnalysisService> {
  const resolved = loadControlHostConfig(options.home);
  const caphub = resolved.config.caphub;
  if (!caphub?.enabled || !caphub.analysis.enabled) {
    throw new AnalysisServiceError("ANALYSIS_DISABLED");
  }
  const root = resolved.caphubStateDir;
  if (!root) throw new Error("Resolved Caphub state directory is unavailable");
  const env = options.env ?? process.env;
  const registry = caphub.registry.enabled
    ? await loadControlHostRegistryRuntime({ resolved, env })
    : null;
  const miniMax = new MiniMaxProvider({
    apiKey: requiredSecret(env, caphub.analysis.miniMaxSecretEnv)
  });
  const kimi = await createKimiProvider({
    mode: caphub.analysis.kimiMode,
    secretEnv: caphub.analysis.kimiApiSecretEnv,
    env
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
    researchProvider: kimi,
    assessmentProvider: kimi,
    criticProvider: miniMax,
    sourceGateway: () => createSourceGateway(caphub.analysis.sourceAllowedOrigins),
    jobs: registry?.jobs ?? new FilesystemAnalysisJobStore(root),
    artifacts: registry?.artifacts ?? new FilesystemStageArtifactStore(root),
    audits: registry?.modelAudits ?? new FilesystemModelCallAuditStore(root),
    clock: () => new Date()
  });
}
