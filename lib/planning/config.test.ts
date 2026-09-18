import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSISTANT_LIMITS } from "../assistant/limits";
import {
  controlHostAssistantConfigSchema,
  controlHostCaphubAnalysisConfigSchema,
  controlHostCaphubRegistryConfigSchema,
  controlHostConfigSchema,
  loadControlHostConfig
} from "./config";
import { CAPHUB_ANALYSIS_LIMITS } from "../caphub/analysis/limits";

describe("control host assistant config", () => {
  it("parses a valid enabled assistant config with fixed provider and model", () => {
    const parsed = controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M3" }
    });
    expect(parsed.assistant?.model).toBe("MiniMax-M3");
    expect(parsed.assistant?.provider).toBe("minimax");
    expect(parsed.assistant?.protocol).toBe("openai-compatible");
    expect(parsed.assistant?.base_url).toBe("https://api.minimax.io/v1");
    expect(parsed.assistant?.enabled).toBe(true);
  });

  it("defaults standard and deep limits to the fixed server limits", () => {
    const parsed = controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M3" }
    });
    expect(parsed.assistant?.standard).toEqual(ASSISTANT_LIMITS.standard);
    expect(parsed.assistant?.deep).toEqual(ASSISTANT_LIMITS.deep);
  });

  it("leaves assistant undefined when omitted", () => {
    const parsed = controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"] });
    expect(parsed.assistant).toBeUndefined();
  });

  it("rejects a non-minimax provider", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "openai", model: "MiniMax-M3" }
    })).toThrow();
  });

  it("rejects a non-Token-Plan protocol or base URL", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M3", protocol: "anthropic-compatible" }
    })).toThrow();
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M3", base_url: "https://example.test/v1" }
    })).toThrow();
  });

  it("rejects a model other than MiniMax-M3", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M2" }
    })).toThrow();
  });

  it("rejects an api_key field (no credential field exists)", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M3", api_key: "sk-secret" }
    })).toThrow();
  });

  it("rejects unknown assistant keys", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: true, provider: "minimax", model: "MiniMax-M3", system_prompt: "override" }
    })).toThrow();
  });

  it("rejects a mutated standard budget", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: {
        enabled: true,
        provider: "minimax",
        model: "MiniMax-M3",
        standard: {
          contextBytes: 256 * 1024,
          outputTokens: 999_999,
          sourceFiles: 6,
          sourceBytes: 192 * 1024,
          toolCalls: 4
        }
      }
    })).toThrow();
  });

  it("rejects a mutated deep budget", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: {
        enabled: true,
        provider: "minimax",
        model: "MiniMax-M3",
        deep: {
          contextBytes: 512 * 1024,
          outputTokens: 8192,
          sourceFiles: 999,
          sourceBytes: 384 * 1024,
          toolCalls: 8
        }
      }
    })).toThrow();
  });

  it("accepts an explicitly disabled assistant", () => {
    const parsed = controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      assistant: { enabled: false }
    });
    expect(parsed.assistant?.enabled).toBe(false);
  });

  it("parses the standalone assistant config schema with fixed limits", () => {
    const parsed = controlHostAssistantConfigSchema.parse({
      enabled: false,
      provider: "minimax",
      model: "MiniMax-M3",
      standard: {
        contextBytes: 256 * 1024,
        outputTokens: 4096,
        sourceFiles: 6,
        sourceBytes: 192 * 1024,
        toolCalls: 4
      },
      deep: {
        contextBytes: 512 * 1024,
        outputTokens: 8192,
        sourceFiles: 12,
        sourceBytes: 384 * 1024,
        toolCalls: 8
      }
    });
    expect(parsed.standard.contextBytes).toBe(256 * 1024);
  });
});

describe("control host monitoring config", () => {
  const monitoringConfig = {
    enabled: false,
    credentials: {
      "railway-primary": { provider: "railway", tokenEnv: "ALLJOBS_MONITORING_RAILWAY_TOKEN" }
    },
    probeAllowedHosts: {
      "example-production": "https://app.example.com"
    }
  };

  it("leaves monitoring undefined (feature disabled) when the block is omitted", () => {
    const parsed = controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"] });
    expect(parsed.monitoring).toBeUndefined();
  });

  it("defaults monitoring to disabled with bounded refresh and concurrency defaults", () => {
    const parsed = controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"], monitoring: {} });
    expect(parsed.monitoring?.enabled).toBe(false);
    expect(parsed.monitoring?.refreshIntervalSeconds).toBe(300);
    expect(parsed.monitoring?.concurrency).toBe(3);
    expect(parsed.monitoring?.credentials).toEqual({});
    expect(parsed.monitoring?.probeAllowedHosts).toEqual({});
  });

  it("parses an explicit disabled monitoring block with credential references", () => {
    const parsed = controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"], monitoring: monitoringConfig });
    expect(parsed.monitoring?.enabled).toBe(false);
    expect(parsed.monitoring?.credentials["railway-primary"]?.tokenEnv).toBe("ALLJOBS_MONITORING_RAILWAY_TOKEN");
  });

  it("bounds refresh interval and concurrency", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      monitoring: { refreshIntervalSeconds: 59 }
    })).toThrow();
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      monitoring: { refreshIntervalSeconds: 86401 }
    })).toThrow();
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      monitoring: { concurrency: 0 }
    })).toThrow();
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      monitoring: { concurrency: 5 }
    })).toThrow();
  });

  it("rejects unknown monitoring keys (strict)", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      monitoring: { enabled: false, webhook_url: "https://hooks.example.com/x" }
    })).toThrow();
  });

  it("rejects credential providers outside the closed adapter set", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      monitoring: { credentials: { "some-ref": { provider: "heroku", tokenEnv: "ALLJOBS_MONITORING_TOKEN" } } }
    })).toThrow();
  });

  it("rejects tokenEnv values that are not valid environment-variable names", () => {
    for (const tokenEnv of ["lowercase", "1LEADING_DIGIT", "HAS-DASH", "HAS SPACE", ""]) {
      expect(() => controlHostConfigSchema.parse({
        trustedCodeRoots: ["/workspace"],
        monitoring: { credentials: { "railway-primary": { provider: "railway", tokenEnv } } }
      })).toThrow();
    }
  });

  it("rejects credential entries carrying a literal token value", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      monitoring: {
        credentials: { "railway-primary": { provider: "railway", tokenEnv: "ALLJOBS_MONITORING_RAILWAY_TOKEN", token: "sk-secret" } }
      }
    })).toThrow();
  });

  it("requires probeAllowedHosts values to be exact HTTPS origins", () => {
    for (const origin of ["http://app.example.com", "https://app.example.com/path", "https://app.example.com.", "not-a-url"]) {
      expect(() => controlHostConfigSchema.parse({
        trustedCodeRoots: ["/workspace"],
        monitoring: { probeAllowedHosts: { "example-production": origin } }
      })).toThrow();
    }
  });
});

describe("control host Caphub config", () => {
  it("defaults an included Caphub block to disabled with the bounded upload limit", () => {
    const parsed = controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"], caphub: {} });
    expect(parsed.caphub?.enabled).toBe(false);
    expect(parsed.caphub?.allowedOrigins).toEqual([]);
    expect(parsed.caphub?.maxUploadBytes).toBe(10_485_760);
  });

  it("accepts only exact HTTPS Caphub allowed origins", () => {
    const parsed = controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      caphub: { allowedOrigins: ["https://alljobs.agentjoey.ai"] }
    });
    expect(parsed.caphub?.allowedOrigins).toEqual(["https://alljobs.agentjoey.ai"]);

    for (const origin of ["http://alljobs.agentjoey.ai", "https://alljobs.agentjoey.ai/caphub", "https://user:pass@alljobs.agentjoey.ai"]) {
      expect(() => controlHostConfigSchema.parse({
        trustedCodeRoots: ["/workspace"],
        caphub: { allowedOrigins: [origin] }
      })).toThrow();
    }
  });

  it("bounds Caphub uploads to one through twenty mebibytes", () => {
    for (const maxUploadBytes of [1_048_575, 20_971_521]) {
      expect(() => controlHostConfigSchema.parse({
        trustedCodeRoots: ["/workspace"],
        caphub: { maxUploadBytes }
      })).toThrow();
    }

    for (const maxUploadBytes of [1_048_576, 20_971_520]) {
      const parsed = controlHostConfigSchema.parse({
        trustedCodeRoots: ["/workspace"],
        caphub: { maxUploadBytes }
      });
      expect(parsed.caphub?.maxUploadBytes).toBe(maxUploadBytes);
    }
  });

  it("rejects unknown Caphub keys, including configurable filesystem roots", () => {
    expect(() => controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      caphub: { enabled: false, stateDir: "/elsewhere" }
    })).toThrow();
  });
});

describe("control host Caphub analysis config", () => {
  it("defaults an included analysis block to disabled with fixed providers and bounded limits", () => {
    const parsed = controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"], caphub: {} });

    expect(parsed.caphub?.analysis).toEqual({
      enabled: false,
      concurrency: 1,
      miniMaxBaseUrl: "https://api.minimax.io/v1",
      miniMaxModel: "MiniMax-M3",
      miniMaxSecretEnv: "MINIMAX_API_KEY",
      deepSeekApiBaseUrl: "https://api.deepseek.com",
      deepSeekApiModel: "deepseek-flash",
      deepSeekApiSecretEnv: "DEEPSEEK_API_KEY",
      sourceAllowedOrigins: [],
      autoStart: false,
      limits: CAPHUB_ANALYSIS_LIMITS
    });
  });

  it("allows only concurrency one and secret environment-variable names", () => {
    expect(() => controlHostCaphubAnalysisConfigSchema.parse({ concurrency: 2 })).toThrow();

    for (const field of ["miniMaxSecretEnv", "deepSeekApiSecretEnv"] as const) {
      for (const value of ["lowercase", "1LEADING", "HAS-DASH", "HAS SPACE", ""]) {
        expect(() => controlHostCaphubAnalysisConfigSchema.parse({ [field]: value })).toThrow();
      }
    }

    const parsed = controlHostCaphubAnalysisConfigSchema.parse({
      miniMaxSecretEnv: "CAPHUB_MINIMAX_TOKEN",
      deepSeekApiSecretEnv: "CAPHUB_DEEPSEEK_TOKEN"
    });
    expect(parsed.miniMaxSecretEnv).toBe("CAPHUB_MINIMAX_TOKEN");
    expect(parsed.deepSeekApiSecretEnv).toBe("CAPHUB_DEEPSEEK_TOKEN");
  });

  it("fixes provider endpoints and models without accepting literal credentials", () => {
    const mutations = [
      { miniMaxBaseUrl: "https://example.com/v1" },
      { miniMaxModel: "MiniMax-M2" },
      { deepSeekApiBaseUrl: "https://example.test" },
      { deepSeekApiModel: "deepseek-v4.1-flash" },
      { apiKey: "literal-secret" }
    ];

    for (const mutation of mutations) {
      expect(() => controlHostCaphubAnalysisConfigSchema.parse(mutation)).toThrow();
    }
  });

  it("accepts only exact HTTPS source origins without credentials or trailing-dot hosts", () => {
    expect(controlHostCaphubAnalysisConfigSchema.parse({
      sourceAllowedOrigins: ["https://docs.example.com"]
    }).sourceAllowedOrigins).toEqual(["https://docs.example.com"]);

    for (const origin of [
      "http://docs.example.com",
      "https://docs.example.com/path",
      "https://docs.example.com?query=yes",
      "https://user:pass@docs.example.com",
      "https://docs.example.com."
    ]) {
      expect(() => controlHostCaphubAnalysisConfigSchema.parse({
        sourceAllowedOrigins: [origin]
      })).toThrow();
    }
  });

  it("allows budget reductions but rejects values above the fixed ceilings", () => {
    const reduced = controlHostCaphubAnalysisConfigSchema.parse({
      limits: {
        ...CAPHUB_ANALYSIS_LIMITS,
        maxImages: 4,
        maxVisualObservationOutputTokens: 900,
        maxVisualObservationBytes: 32_768,
        providerTimeoutMs: { minimax: 30_000, kimi: 60_000, deepseek: 60_000 },
        maxInputBytes: {
          extraction: 1_048_576,
          research: 524_288,
          assessment: 524_288,
          critic: 524_288
        },
        maxOutputTokens: {
          extraction: 2_048,
          research: 4_096,
          assessment: 3_072,
          critic: 2_048
        }
      }
    });
    expect(reduced.limits.maxImages).toBe(4);
    expect(reduced.limits.maxVisualObservationOutputTokens).toBe(900);
    expect(reduced.limits.maxVisualObservationBytes).toBe(32_768);

    for (const limits of [
      { ...CAPHUB_ANALYSIS_LIMITS, maxImages: CAPHUB_ANALYSIS_LIMITS.maxImages + 1 },
      { ...CAPHUB_ANALYSIS_LIMITS, maxVisualObservationOutputTokens: 1_801 },
      { ...CAPHUB_ANALYSIS_LIMITS, maxVisualObservationBytes: 65_537 },
      { ...CAPHUB_ANALYSIS_LIMITS, maxVisualObservationOutputTokens: 0 },
      { ...CAPHUB_ANALYSIS_LIMITS, maxVisualObservationBytes: 1.5 },
      { ...CAPHUB_ANALYSIS_LIMITS, maxTotalTokensPerJob: CAPHUB_ANALYSIS_LIMITS.maxTotalTokensPerJob + 1 },
      {
        ...CAPHUB_ANALYSIS_LIMITS,
        providerTimeoutMs: {
          ...CAPHUB_ANALYSIS_LIMITS.providerTimeoutMs,
          deepseek: CAPHUB_ANALYSIS_LIMITS.providerTimeoutMs.deepseek + 1
        }
      },
      {
        ...CAPHUB_ANALYSIS_LIMITS,
        maxInputBytes: {
          ...CAPHUB_ANALYSIS_LIMITS.maxInputBytes,
          extraction: CAPHUB_ANALYSIS_LIMITS.maxInputBytes.extraction + 1
        }
      },
      {
        ...CAPHUB_ANALYSIS_LIMITS,
        maxOutputTokens: {
          ...CAPHUB_ANALYSIS_LIMITS.maxOutputTokens,
          research: CAPHUB_ANALYSIS_LIMITS.maxOutputTokens.research + 1
        }
      }
    ]) {
      expect(() => controlHostCaphubAnalysisConfigSchema.parse({ limits })).toThrow();
    }
  });

  it("defaults new observation ceilings in older explicit analysis limits", () => {
    const {
      maxVisualObservationOutputTokens: _tokens,
      maxVisualObservationBytes: _bytes,
      ...legacyLimits
    } = CAPHUB_ANALYSIS_LIMITS;
    expect(controlHostCaphubAnalysisConfigSchema.parse({ limits: legacyLimits }).limits).toMatchObject({
      maxVisualObservationOutputTokens: 1_800,
      maxVisualObservationBytes: 65_536
    });
  });

  it("rejects unknown analysis and nested limit fields", () => {
    expect(() => controlHostCaphubAnalysisConfigSchema.parse({ systemPrompt: "override" })).toThrow();
    expect(() => controlHostCaphubAnalysisConfigSchema.parse({
      limits: { ...CAPHUB_ANALYSIS_LIMITS, unboundedCalls: 999 }
    })).toThrow();
  });
});

describe("control host Caphub Registry config", () => {
  it("defaults the optional Registry block to disabled and secret-by-reference", () => {
    expect(controlHostCaphubRegistryConfigSchema.parse({})).toEqual({
      enabled: false,
      databaseUrlEnv: "CAPHUB_DATABASE_URL",
      migrationDatabaseUrlEnv: "CAPHUB_MIGRATION_DATABASE_URL",
      connectionMode: "tls_verify_full",
      managedHosts: ["registry.example.test"],
      maxConnections: 4,
      statementTimeoutMs: 5_000
    });

    const parsed = controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"], caphub: {} });
    expect(parsed.caphub?.registry).toEqual({
      enabled: false,
      databaseUrlEnv: "CAPHUB_DATABASE_URL",
      migrationDatabaseUrlEnv: "CAPHUB_MIGRATION_DATABASE_URL",
      connectionMode: "tls_verify_full",
      managedHosts: ["registry.example.test"],
      maxConnections: 4,
      statementTimeoutMs: 5_000
    });
  });

  it("accepts only bounded Registry settings and uppercase environment-variable references", () => {
    expect(controlHostCaphubRegistryConfigSchema.parse({
      databaseUrlEnv: "CAPHUB_TEST_DATABASE_URL",
      migrationDatabaseUrlEnv: "CAPHUB_TEST_MIGRATION_DATABASE_URL",
      connectionMode: "local_socket",
      managedHosts: ["registry.example.test"],
      maxConnections: 1,
      statementTimeoutMs: 100
    })).toMatchObject({
      databaseUrlEnv: "CAPHUB_TEST_DATABASE_URL",
      migrationDatabaseUrlEnv: "CAPHUB_TEST_MIGRATION_DATABASE_URL",
      connectionMode: "local_socket",
      managedHosts: ["registry.example.test"],
      maxConnections: 1,
      statementTimeoutMs: 100
    });

    for (const mutation of [
      { databaseUrlEnv: "literal-postgres-url" },
      { migrationDatabaseUrlEnv: "literal-postgres-url" },
      { databaseUrl: "postgres://user:secret@example.test/db" },
      { sslMode: "disable" },
      { connectionMode: "disable" },
      { managedHosts: [] },
      { managedHosts: ["registry.example.test", "other.example.test", "third.example.test"] },
      { maxConnections: 0 },
      { maxConnections: 17 },
      { statementTimeoutMs: 99 },
      { statementTimeoutMs: 30_001 },
      { provider: "managed-postgres" }
    ]) {
      expect(() => controlHostCaphubRegistryConfigSchema.parse(mutation)).toThrow();
    }
  });
});

describe("control host Caphub Object Storage config", () => {
  it("defaults to local storage and accepts only the fixed private Neon S3 contract", () => {
    const local = controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"], caphub: {} });
    expect(local.caphub?.storage).toEqual({ mode: "local" });

    const neon = controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      caphub: {
        enabled: true,
        registry: { enabled: true },
        storage: {
          mode: "neon_s3",
          bucket: "caphub-objects",
          accessKeyIdEnv: "CAPHUB_S3_ACCESS_KEY_ID",
          secretAccessKeyEnv: "CAPHUB_S3_SECRET_ACCESS_KEY",
          endpointEnv: "CAPHUB_S3_ENDPOINT",
          regionEnv: "CAPHUB_S3_REGION",
          managedEndpointHosts: ["storage.example.test"]
        }
      }
    });
    expect(neon.caphub?.storage).toMatchObject({
      mode: "neon_s3", bucket: "caphub-objects", managedEndpointHosts: ["storage.example.test"]
    });
  });

  it("rejects an unbounded or prematurely enabled Neon S3 configuration", () => {
    for (const caphub of [
      { storage: { mode: "neon_s3" } },
      { enabled: true, storage: { mode: "neon_s3" } },
      { enabled: true, registry: { enabled: true }, storage: { mode: "neon_s3", bucket: "public-assets" } },
      { enabled: true, registry: { enabled: true }, storage: { mode: "neon_s3", endpoint: "https://secret.example.test" } },
      { enabled: true, registry: { enabled: true }, storage: { mode: "neon_s3", managedEndpointHosts: [] } }
    ]) {
      expect(() => controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"], caphub })).toThrow();
    }
  });
});

describe("control host monitoring resolved paths", () => {
  it("resolves stateDir and monitoringStateDir as descendants of ALLJOBS_HOME and creates only those", () => {
    const home = mkdtempSync(join(tmpdir(), "alljobs-monitoring-config-"));
    try {
      writeFileSync(join(home, "config.json"), JSON.stringify({
        trustedCodeRoots: ["/workspace"],
        monitoring: { enabled: false }
      }));
      const resolved = loadControlHostConfig(home);
      expect(resolved.stateDir).toBe(resolve(home, "state"));
      expect(resolved.monitoringStateDir).toBe(resolve(home, "state", "monitoring"));
      const stateDir = resolved.stateDir as string;
      const monitoringStateDir = resolved.monitoringStateDir as string;
      expect(monitoringStateDir.startsWith(resolved.homeDir + sep)).toBe(true);
      expect(existsSync(stateDir)).toBe(true);
      expect(existsSync(monitoringStateDir)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("parses config/alljobs.example.json with monitoring disabled and no token values", () => {
    const examplePath = resolve(process.cwd(), "config/alljobs.example.json");
    const raw = JSON.parse(readFileSync(examplePath, "utf8"));
    const parsed = controlHostConfigSchema.parse(raw);
    expect(parsed.monitoring?.enabled).toBe(false);
    expect(readFileSync(examplePath, "utf8")).not.toMatch(/sk-[A-Za-z0-9]|Bearer\s+[A-Za-z0-9]/);
  });
});

describe("control host Caphub resolved paths", () => {
  it("derives and creates Caphub state only beneath the Control Host state directory", () => {
    const home = mkdtempSync(join(tmpdir(), "alljobs-caphub-config-"));
    try {
      writeFileSync(join(home, "config.json"), JSON.stringify({
        trustedCodeRoots: ["/workspace"],
        caphub: { enabled: false }
      }));
      const resolved = loadControlHostConfig(home);
      expect(resolved.caphubStateDir).toBe(resolve(home, "state", "caphub"));
      const caphubStateDir = resolved.caphubStateDir as string;
      expect(caphubStateDir.startsWith(resolved.homeDir + sep)).toBe(true);
      expect(existsSync(caphubStateDir)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses a symlinked state directory without creating Caphub state outside the Control Host home", () => {
    const fixture = mkdtempSync(join(tmpdir(), "alljobs-caphub-config-symlink-"));
    const home = join(fixture, "home");
    const outside = join(fixture, "outside");
    mkdirSync(home, { mode: 0o700 });
    mkdirSync(outside, { mode: 0o700 });
    writeFileSync(join(home, "config.json"), JSON.stringify({
      trustedCodeRoots: ["/workspace"],
      caphub: { enabled: false }
    }));
    symlinkSync(outside, join(home, "state"));

    try {
      expect(() => loadControlHostConfig(home)).toThrow();
      expect(existsSync(join(outside, "caphub"))).toBe(false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});

describe("Caphub export configuration", () => {
  function parseCaphub(raw: unknown) {
    return controlHostConfigSchema.safeParse({
      trustedCodeRoots: ["/workspace"],
      ...(raw as Record<string, unknown>)
    });
  }

  it("defaults every export switch to false under strict unknown-key rejection", () => {
    const parsed = parseCaphub({ caphub: { enabled: true, registry: { enabled: true } } });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const exports = parsed.data.caphub?.exports;
    expect(exports?.enabled).toBe(false);
    expect(exports?.obsidian.enabled).toBe(false);
    expect(exports?.packageRepository.enabled).toBe(false);
    expect(exports?.targets.codex.enabled).toBe(false);
    expect(exports?.targets.claude.enabled).toBe(false);
    expect(exports?.targets.hermes.enabled).toBe(false);

    expect(parseCaphub({ caphub: { exports: { enabled: false, unknown: true } } }).success).toBe(false);
    expect(parseCaphub({ caphub: { exports: { targets: { codex: { enabled: false, extra: 1 } } } } }).success).toBe(false);
  });

  it("accepts paired absolute roots with fixed aliases for gated targets", () => {
    const parsed = parseCaphub({
      caphub: {
        enabled: true,
        registry: { enabled: true },
        exports: {
          enabled: true,
          obsidian: { enabled: true, root: "/private/tmp/caphub-vault-fixture", alias: "obsidian-primary" },
          targets: {
            codex: { enabled: true, root: "/private/tmp/caphub-codex-fixture", alias: "codex-primary" },
            claude: { enabled: false },
            hermes: { enabled: false }
          }
        }
      }
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an explicit owner-selected Obsidian vault path containing ordinary spaces", () => {
    const parsed = parseCaphub({
      caphub: {
        enabled: true,
        registry: { enabled: true },
        exports: {
          enabled: true,
          obsidian: {
            enabled: true,
            root: "/Users/owner/Library/Mobile Documents/iCloud~md~obsidian/Documents/Caphub",
            alias: "3b0bc2e2318652e8"
          }
        }
      }
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unpaired roots or aliases, broad roots, variables, and glob characters", () => {
    const base = {
      caphub: {
        enabled: true,
        registry: { enabled: true },
        exports: { enabled: true }
      }
    };
    expect(parseCaphub({
      caphub: {
        ...base.caphub,
        exports: { enabled: true, targets: { codex: { enabled: true, root: "/private/tmp/x" } } }
      }
    }).success).toBe(false);
    expect(parseCaphub({
      caphub: {
        ...base.caphub,
        exports: { enabled: true, targets: { codex: { enabled: true, alias: "codex-only" } } }
      }
    }).success).toBe(false);
    for (const root of ["/", "~/vault", "$HOME/vault", "/tmp/glob*", "/tmp/what?", "relative/path", "/tmp/back\\slash", "/tmp/with\nnewline", "/tmp/with\ttab"]) {
      const parsed = parseCaphub({
        caphub: {
          ...base.caphub,
          exports: { enabled: true, targets: { codex: { enabled: true, root, alias: "codex-x" } } }
        }
      });
      expect(parsed.success, root).toBe(false);
    }
  });
});
