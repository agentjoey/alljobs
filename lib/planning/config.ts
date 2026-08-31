import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, normalize, resolve } from "node:path";
import { z } from "zod";
import { ASSISTANT_LIMITS } from "../assistant/limits";

const fixedStandardLimitsSchema = z.object({
  contextBytes: z.literal(ASSISTANT_LIMITS.standard.contextBytes),
  outputTokens: z.literal(ASSISTANT_LIMITS.standard.outputTokens),
  sourceFiles: z.literal(ASSISTANT_LIMITS.standard.sourceFiles),
  sourceBytes: z.literal(ASSISTANT_LIMITS.standard.sourceBytes),
  toolCalls: z.literal(ASSISTANT_LIMITS.standard.toolCalls)
}).strict();

const fixedDeepLimitsSchema = z.object({
  contextBytes: z.literal(ASSISTANT_LIMITS.deep.contextBytes),
  outputTokens: z.literal(ASSISTANT_LIMITS.deep.outputTokens),
  sourceFiles: z.literal(ASSISTANT_LIMITS.deep.sourceFiles),
  sourceBytes: z.literal(ASSISTANT_LIMITS.deep.sourceBytes),
  toolCalls: z.literal(ASSISTANT_LIMITS.deep.toolCalls)
}).strict();

export const controlHostAssistantConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.literal("minimax").default("minimax"),
  model: z.literal("MiniMax-M3").default("MiniMax-M3"),
  standard: fixedStandardLimitsSchema.default(ASSISTANT_LIMITS.standard),
  deep: fixedDeepLimitsSchema.default(ASSISTANT_LIMITS.deep)
}).strict();

export const controlHostConfigSchema = z.object({
  trustedCodeRoots: z.array(z.string().min(1, "Trusted code root cannot be empty")).min(1, "At least one trustedCodeRoot is required"),
  refreshIntervalSeconds: z.number().int().min(10, "Minimum refresh interval is 10 seconds").default(300),
  mirrorsDir: z.string().optional(),
  logsDir: z.string().optional(),
  cacheDir: z.string().optional(),
  assistant: controlHostAssistantConfigSchema.optional()
});

export type ControlHostConfig = z.infer<typeof controlHostConfigSchema>;

export interface ControlHostResolvedPaths {
  homeDir: string;
  configPath: string;
  mirrorsDir: string;
  logsDir: string;
  cacheDir: string;
  config: ControlHostConfig;
}

export function resolveControlHostHome(customHome?: string): string {
  if (customHome) {
    return resolve(customHome);
  }
  if (process.env.ALLJOBS_HOME) {
    return resolve(process.env.ALLJOBS_HOME);
  }
  return resolve(homedir(), ".alljobs");
}

export function loadControlHostConfig(customHome?: string): ControlHostResolvedPaths {
  const homeDir = resolveControlHostHome(customHome);
  const configPath = resolve(homeDir, "config.json");

  if (!existsSync(configPath)) {
    throw new Error(`Control Host configuration not found at "${configPath}". Create it from config/alljobs.example.json.`);
  }

  let raw: unknown;
  try {
    const content = readFileSync(configPath, "utf8");
    raw = JSON.parse(content);
  } catch (err: any) {
    throw new Error(`Failed to parse Control Host configuration at "${configPath}": ${err.message}`);
  }

  const parsed = controlHostConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid Control Host configuration at "${configPath}": ${errorDetails}`);
  }

  const config = parsed.data;

  // Resolve directories
  const mirrorsDir = config.mirrorsDir ? resolve(config.mirrorsDir) : resolve(homeDir, "mirrors");
  const logsDir = config.logsDir ? resolve(config.logsDir) : resolve(homeDir, "logs");
  const cacheDir = config.cacheDir ? resolve(config.cacheDir) : resolve(homeDir, "cache");

  if (!existsSync(mirrorsDir)) mkdirSync(mirrorsDir, { recursive: true });
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

  return {
    homeDir,
    configPath,
    mirrorsDir,
    logsDir,
    cacheDir,
    config
  };
}

/**
 * Checks whether a candidate path is a direct child of one of the configured trusted roots.
 * Resolves symlinks via realpath to prevent escapes.
 */
export function isDirectChildOfTrustedRoots(
  candidatePath: string,
  config: ControlHostConfig
): { trusted: boolean; realCandidatePath?: string; matchedRoot?: string; reason?: string } {
  if (!candidatePath || !isAbsolute(candidatePath)) {
    return { trusted: false, reason: "Candidate path must be an absolute path" };
  }

  let realCandidate: string;
  try {
    realCandidate = realpathSync(candidatePath);
  } catch {
    // If not existing on disk yet, check normalized path
    realCandidate = normalize(candidatePath);
  }

  const candidateParent = dirname(realCandidate);

  for (const root of config.trustedCodeRoots) {
    let realRoot: string;
    try {
      realRoot = realpathSync(root);
    } catch {
      realRoot = normalize(root);
    }

    // Direct child check: parent of candidate must exactly match the trusted root
    if (candidateParent === realRoot) {
      return {
        trusted: true,
        realCandidatePath: realCandidate,
        matchedRoot: realRoot
      };
    }
  }

  return {
    trusted: false,
    reason: `Candidate path "${candidatePath}" is not a direct child of any configured trusted root (${config.trustedCodeRoots.join(", ")})`
  };
}
