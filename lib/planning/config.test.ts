import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSISTANT_LIMITS } from "../assistant/limits";
import { controlHostAssistantConfigSchema, controlHostConfigSchema, loadControlHostConfig } from "./config";

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
