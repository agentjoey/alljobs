import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, normalize, resolve } from "node:path";
import { z } from "zod";
import { ASSISTANT_LIMITS } from "../assistant/limits";
import { CAPHUB_ANALYSIS_LIMITS } from "../caphub/analysis/limits";
import { monitoringProviderSchema } from "../monitoring/domain/schemas";

const assistantAllowedOriginSchema = z.string().url().refine((value) => {
  const origin = new URL(value);
  return origin.protocol === "https:" && origin.origin === value;
}, "Assistant allowed origins must be exact HTTPS origins without a path.");

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
  protocol: z.literal("openai-compatible").default("openai-compatible"),
  base_url: z.literal("https://api.minimax.io/v1").default("https://api.minimax.io/v1"),
  model: z.literal("MiniMax-M3").default("MiniMax-M3"),
  allowedOrigins: z.array(assistantAllowedOriginSchema).max(8).default([]),
  standard: fixedStandardLimitsSchema.default(ASSISTANT_LIMITS.standard),
  deep: fixedDeepLimitsSchema.default(ASSISTANT_LIMITS.deep)
}).strict();

const secretEnvNameSchema = z
  .string()
  .max(128)
  .regex(/^[A-Z][A-Z0-9_]*$/, "Secret references must be valid uppercase environment-variable names");

const managedDatabaseHostSchema = z
  .string()
  .max(253)
  .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i,
    "Managed database hosts must be normalized DNS names")
  .transform((value) => value.toLowerCase());

const exactHttpsOriginSchema = z.string().url().refine((value) => {
  try {
    const origin = new URL(value);
    return origin.protocol === "https:"
      && origin.origin === value
      && !origin.username
      && !origin.password
      && !origin.hostname.endsWith(".");
  } catch {
    return false;
  }
}, "Source origins must be exact HTTPS origins without paths, queries, credentials, or trailing-dot hosts.");

const boundedPositiveInteger = (maximum: number) => z.number().int().min(1).max(maximum);

const controlHostCaphubAnalysisLimitsSchema = z.object({
  concurrency: z.literal(CAPHUB_ANALYSIS_LIMITS.concurrency),
  maxImages: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxImages),
  maxAggregateImageBytes: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxAggregateImageBytes),
  maxAggregatePixels: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxAggregatePixels),
  maxPixelsPerImage: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxPixelsPerImage),
  preprocessingTimeoutMs: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.preprocessingTimeoutMs),
  ocrTimeoutMsPerImage: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.ocrTimeoutMsPerImage),
  providerTimeoutMs: z.object({
    minimax: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.providerTimeoutMs.minimax),
    kimi: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.providerTimeoutMs.kimi),
    deepseek: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.providerTimeoutMs.deepseek)
  }).strict(),
  maxSchemaCorrections: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxSchemaCorrections),
  maxProviderCallsPerJob: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxProviderCallsPerJob),
  maxInputBytes: z.object({
    extraction: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxInputBytes.extraction),
    research: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxInputBytes.research),
    assessment: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxInputBytes.assessment),
    critic: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxInputBytes.critic)
  }).strict(),
  maxTotalTokensPerJob: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxTotalTokensPerJob),
  maxSearchQueries: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxSearchQueries),
  maxFetchedSources: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxFetchedSources),
  sourceFetchTimeoutMs: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.sourceFetchTimeoutMs),
  maxCompressedSourceBytes: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxCompressedSourceBytes),
  maxDecompressedSourceBytes: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxDecompressedSourceBytes),
  maxRedirects: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxRedirects),
  maxOutputTokens: z.object({
    extraction: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxOutputTokens.extraction),
    research: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxOutputTokens.research),
    assessment: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxOutputTokens.assessment),
    critic: boundedPositiveInteger(CAPHUB_ANALYSIS_LIMITS.maxOutputTokens.critic)
  }).strict()
}).strict();

export const controlHostCaphubAnalysisConfigSchema = z.object({
  enabled: z.boolean().default(false),
  concurrency: z.literal(CAPHUB_ANALYSIS_LIMITS.concurrency).default(CAPHUB_ANALYSIS_LIMITS.concurrency),
  miniMaxBaseUrl: z.literal("https://api.minimax.io/v1").default("https://api.minimax.io/v1"),
  miniMaxModel: z.literal("MiniMax-M3").default("MiniMax-M3"),
  miniMaxSecretEnv: secretEnvNameSchema.default("MINIMAX_API_KEY"),
  deepSeekApiBaseUrl: z.literal("https://api.deepseek.com").default("https://api.deepseek.com"),
  deepSeekApiModel: z.literal("deepseek-flash").default("deepseek-flash"),
  deepSeekApiSecretEnv: secretEnvNameSchema.default("DEEPSEEK_API_KEY"),
  sourceAllowedOrigins: z.array(exactHttpsOriginSchema).max(32).default([]),
  limits: controlHostCaphubAnalysisLimitsSchema.default(CAPHUB_ANALYSIS_LIMITS)
}).strict();

const DEFAULT_CAPHUB_ANALYSIS_CONFIG = controlHostCaphubAnalysisConfigSchema.parse({});

export const controlHostCaphubRegistryConfigSchema = z.object({
  enabled: z.boolean().default(false),
  databaseUrlEnv: secretEnvNameSchema.default("CAPHUB_DATABASE_URL"),
  migrationDatabaseUrlEnv: secretEnvNameSchema.default("CAPHUB_MIGRATION_DATABASE_URL"),
  connectionMode: z.enum(["local_socket", "tls_verify_full"]).default("tls_verify_full"),
  managedHosts: z.array(managedDatabaseHostSchema).min(1).max(2).default(["registry.example.test"]),
  maxConnections: z.number().int().min(1).max(16).default(4),
  statementTimeoutMs: z.number().int().min(100).max(30_000).default(5_000)
}).strict();

const DEFAULT_CAPHUB_REGISTRY_CONFIG = controlHostCaphubRegistryConfigSchema.parse({});

export const controlHostCaphubStorageConfigSchema = z.union([
  z.object({ mode: z.literal("local").default("local") }).strict(),
  z.object({
    mode: z.literal("neon_s3"),
    bucket: z.literal("caphub-objects"),
    accessKeyIdEnv: secretEnvNameSchema.default("CAPHUB_S3_ACCESS_KEY_ID"),
    secretAccessKeyEnv: secretEnvNameSchema.default("CAPHUB_S3_SECRET_ACCESS_KEY"),
    endpointEnv: secretEnvNameSchema.default("CAPHUB_S3_ENDPOINT"),
    regionEnv: secretEnvNameSchema.default("CAPHUB_S3_REGION"),
    managedEndpointHosts: z.array(managedDatabaseHostSchema).min(1).max(2).default(["objects.example.test"])
  }).strict()
]).default({ mode: "local" });

const DEFAULT_CAPHUB_STORAGE_CONFIG = controlHostCaphubStorageConfigSchema.parse({});

const exportAliasSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "Export target aliases must be lowercase labels");

const exportRootSchema = z.string()
  .min(1)
  .max(500)
  .refine((value) => value.startsWith("/") && !value.endsWith("/") && !value.includes("\\")
    && !value.includes("~") && !value.includes("$") && !value.includes("*") && !value.includes("?")
    && !/\s/.test(value), {
    message: "Export roots must be explicit absolute paths without variables, ~, globs, whitespace, or backslashes"
  })
  .refine((value) => value !== "/", {
    message: "Export roots must not be the filesystem root"
  });

const exportTargetConfigSchema = z.object({
  enabled: z.boolean().default(false),
  root: exportRootSchema.optional(),
  alias: exportAliasSchema.optional()
}).strict().superRefine((value, context) => {
  if ((value.root !== undefined) !== (value.alias !== undefined)) {
    context.addIssue({
      code: "custom",
      path: value.root !== undefined ? ["alias"] : ["root"],
      message: "Export roots and aliases must be supplied together and paired"
    });
  }
});

const DEFAULT_EXPORT_TARGET = exportTargetConfigSchema.parse({});

export const controlHostCaphubExportsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  obsidian: exportTargetConfigSchema.default({ enabled: false }),
  packageRepository: exportTargetConfigSchema.default({ enabled: false }),
  targets: z.object({
    codex: exportTargetConfigSchema.default({ enabled: false }),
    claude: exportTargetConfigSchema.default({ enabled: false }),
    hermes: exportTargetConfigSchema.default({ enabled: false })
  }).strict().default({
    codex: DEFAULT_EXPORT_TARGET,
    claude: DEFAULT_EXPORT_TARGET,
    hermes: DEFAULT_EXPORT_TARGET
  })
}).strict();

const DEFAULT_CAPHUB_EXPORTS_CONFIG = controlHostCaphubExportsConfigSchema.parse({});

// Caphub is disabled unless explicitly enabled. Its browser origins are exact
// HTTPS origins and its state root is always derived below ALLJOBS_HOME.
export const controlHostCaphubConfigSchema = z.object({
  enabled: z.boolean().default(false),
  allowedOrigins: z.array(assistantAllowedOriginSchema).max(8).default([]),
  maxUploadBytes: z.number().int().min(1_048_576).max(20_971_520).default(10_485_760),
  analysis: controlHostCaphubAnalysisConfigSchema.default(DEFAULT_CAPHUB_ANALYSIS_CONFIG),
  registry: controlHostCaphubRegistryConfigSchema.default(DEFAULT_CAPHUB_REGISTRY_CONFIG),
  storage: controlHostCaphubStorageConfigSchema.default(DEFAULT_CAPHUB_STORAGE_CONFIG),
  exports: controlHostCaphubExportsConfigSchema.default(DEFAULT_CAPHUB_EXPORTS_CONFIG)
}).strict().superRefine((value, context) => {
  if (value.storage.mode === "neon_s3" && (!value.enabled || !value.registry.enabled)) {
    context.addIssue({
      code: "custom",
      path: ["storage"],
      message: "Neon Object Storage requires enabled Caphub and Registry"
    });
  }
});

const monitoringCredentialRefKeySchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Credential reference keys must be lowercase letters, digits, and hyphens");

// Secret values live only in the server environment; the config names the
// environment variable and the provider it is valid for, never the token.
export const controlHostMonitoringCredentialSchema = z.object({
  provider: monitoringProviderSchema,
  tokenEnv: z
    .string()
    .max(128)
    .regex(/^[A-Z][A-Z0-9_]*$/, "tokenEnv must be a valid environment-variable name (uppercase, digits, underscores)")
}).strict();

const monitoringProbeOriginSchema = z.string().url().refine((value) => {
  try {
    const origin = new URL(value);
    return origin.protocol === "https:" && origin.origin === value && !origin.username && !origin.password
      && !origin.hostname.endsWith(".");
  } catch {
    return false;
  }
}, "probeAllowedHosts values must be exact HTTPS origins without a path, query, or user information.");

// Monitoring is disabled by default; the state root is always derived from the
// resolved ALLJOBS_HOME and is never configurable to an arbitrary path.
export const controlHostMonitoringConfigSchema = z.object({
  enabled: z.boolean().default(false),
  refreshIntervalSeconds: z.number().int().min(60).max(86_400).default(300),
  concurrency: z.number().int().min(1).max(4).default(3),
  credentials: z.record(monitoringCredentialRefKeySchema, controlHostMonitoringCredentialSchema).default({}),
  probeAllowedHosts: z.record(monitoringCredentialRefKeySchema, monitoringProbeOriginSchema).default({})
}).strict();

export const controlHostConfigSchema = z.object({
  trustedCodeRoots: z.array(z.string().min(1, "Trusted code root cannot be empty")).min(1, "At least one trustedCodeRoot is required"),
  refreshIntervalSeconds: z.number().int().min(10, "Minimum refresh interval is 10 seconds").default(300),
  mirrorsDir: z.string().optional(),
  logsDir: z.string().optional(),
  cacheDir: z.string().optional(),
  assistant: controlHostAssistantConfigSchema.optional(),
  caphub: controlHostCaphubConfigSchema.optional(),
  monitoring: controlHostMonitoringConfigSchema.optional()
});

export type ControlHostConfig = z.infer<typeof controlHostConfigSchema>;

export interface ControlHostResolvedPaths {
  homeDir: string;
  configPath: string;
  mirrorsDir: string;
  logsDir: string;
  cacheDir: string;
  // Always set by loadControlHostConfig; optional so existing test fixtures
  // that construct this shape literally keep compiling.
  stateDir?: string;
  caphubStateDir?: string;
  monitoringStateDir?: string;
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

const CONTROL_HOST_DIRECTORY_MODE = 0o700;
const UNSAFE_DIRECTORY_WRITE_BITS = 0o022;

function assertOwnedDirectory(path: string): string {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("Control Host state directories must be real directories, not symlinks");
  }
  if (typeof process.getuid !== "function" || stat.uid !== process.getuid()) {
    throw new Error("Control Host state directories must be owned by the current uid");
  }
  if ((stat.mode & UNSAFE_DIRECTORY_WRITE_BITS) !== 0) {
    throw new Error("Control Host state directories must not be group or other writable");
  }
  return realpathSync(path);
}

function ensureOwnedDirectChildDirectory(parent: string, child: string): void {
  const realParent = assertOwnedDirectory(parent);
  try {
    mkdirSync(child, { mode: CONTROL_HOST_DIRECTORY_MODE });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  if (dirname(assertOwnedDirectory(child)) !== realParent) {
    throw new Error("Control Host state directories must remain direct children of their resolved parent");
  }
}

function ensureCaphubStateDirectory(homeDir: string, stateDir: string, caphubStateDir: string): void {
  ensureOwnedDirectChildDirectory(homeDir, stateDir);
  ensureOwnedDirectChildDirectory(stateDir, caphubStateDir);
  // Recheck the parent after creating the child so a substituted state path
  // fails closed before the resolved paths are returned to a route.
  ensureOwnedDirectChildDirectory(homeDir, stateDir);
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
  // Monitoring state root is always <ALLJOBS_HOME>/state/monitoring — never
  // configurable, so directory creation only ever touches descendants of the
  // resolved Control Host home.
  const stateDir = resolve(homeDir, "state");
  const caphubStateDir = resolve(stateDir, "caphub");
  const monitoringStateDir = resolve(stateDir, "monitoring");

  if (!existsSync(mirrorsDir)) mkdirSync(mirrorsDir, { recursive: true });
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  ensureCaphubStateDirectory(homeDir, stateDir, caphubStateDir);
  if (!existsSync(monitoringStateDir)) mkdirSync(monitoringStateDir, { recursive: true });

  return {
    homeDir,
    configPath,
    mirrorsDir,
    logsDir,
    cacheDir,
    stateDir,
    caphubStateDir,
    monitoringStateDir,
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
