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
