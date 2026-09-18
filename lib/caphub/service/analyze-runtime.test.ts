// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadControlHostAnalysisService } from "./analyze-runtime";

const homes: string[] = [];

function controlHostHome(caphub: unknown): string {
  const home = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "alljobs-caphub-runtime-")));
  homes.push(home);
  chmodSync(home, 0o700);
  const trusted = join(home, "trusted");
  mkdirSync(trusted, { mode: 0o700 });
  writeFileSync(join(home, "config.json"), JSON.stringify({
    trustedCodeRoots: [trusted],
    caphub
  }), { mode: 0o600 });
  return home;
}

afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true });
});

describe("fixed Control Host analysis composition", () => {
  it("fails before reading secret values while analysis is disabled", async () => {
    const home = controlHostHome({ enabled: false });
    const env = new Proxy({}, {
      get() { throw new Error("secret environment must not be read"); }
    });
    await expect(loadControlHostAnalysisService({ home, env }))
      .rejects.toMatchObject({ code: "ANALYSIS_DISABLED" });
  });

  it("constructs the fixed API-mode service without making a provider call", async () => {
    const home = controlHostHome({
      enabled: true,
      analysis: { enabled: true }
    });
    const service = await loadControlHostAnalysisService({
      home,
      env: {
        MINIMAX_API_KEY: "fixture-minimax",
        DEEPSEEK_API_KEY: "fixture-deepseek"
      }
    });
    await expect(service.start("not-a-capture-id"))
      .rejects.toMatchObject({ code: "INVALID_CAPTURE_ID" });
  });

  it("requires only the fixed DeepSeek secret for research and assessment", async () => {
    const home = controlHostHome({ enabled: true, analysis: { enabled: true } });
    await expect(loadControlHostAnalysisService({
      home,
      env: { MINIMAX_API_KEY: "fixture-minimax" }
    })).rejects.toThrow("DEEPSEEK_API_KEY");
  });
});
