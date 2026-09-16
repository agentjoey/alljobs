// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { main, parseCaphubAnalyzeArgs, runCaphubAnalyze } from "./caphub-analyze";

const CAPTURE_ID = `cap_${"a".repeat(32)}`;

describe("caphub-analyze command boundary", () => {
  it("accepts exactly one validated Capture ID and no path, URL, prompt, provider, or secret option", () => {
    expect(parseCaphubAnalyzeArgs([CAPTURE_ID])).toBe(CAPTURE_ID);
    for (const args of [
      [], [CAPTURE_ID, "extra"], ["../capture"], ["https://example.com"],
      ["--prompt=x"], ["--provider=kimi"], ["--api-key=secret"], ["/tmp/capture"]
    ]) expect(() => parseCaphubAnalyzeArgs(args)).toThrow();
  });

  it("returns identifiers from an injected server-side service without accepting dependency arguments", async () => {
    const start = vi.fn(async () => ({
      jobId: `job_${"b".repeat(32)}`,
      status: "completed" as const,
      reviewPacketArtifactId: `art_${"c".repeat(64)}`
    }));
    await expect(runCaphubAnalyze([CAPTURE_ID], async () => ({ start }))).resolves.toMatchObject({ status: "completed" });
    expect(start).toHaveBeenCalledWith(CAPTURE_ID);
  });

  it("uses the same strict parser and fixed loader at the executable entry point", async () => {
    const start = vi.fn(async () => ({
      jobId: `job_${"b".repeat(32)}`,
      status: "completed" as const,
      reviewPacketArtifactId: `art_${"c".repeat(64)}`
    }));
    const loadService = vi.fn(async () => ({ start }));
    const write = vi.fn();

    await main([CAPTURE_ID], loadService, write);
    expect(loadService).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(CAPTURE_ID);
    expect(write).toHaveBeenCalledWith(expect.stringContaining(`job_${"b".repeat(32)}`));

    await expect(main(["--api-key=secret"], loadService, write)).rejects.toThrow(/Usage|invalid/i);
  });

  it("runs the package command in an explicit server-only module condition and stays disabled by default", () => {
    const home = mkdtempSync(join(tmpdir(), "alljobs-caphub-cli-"));
    try {
      chmodSync(home, 0o700);
      const trusted = join(home, "trusted");
      mkdirSync(trusted, { mode: 0o700 });
      writeFileSync(join(home, "config.json"), JSON.stringify({
        trustedCodeRoots: [trusted],
        caphub: { enabled: false }
      }), { mode: 0o600 });
      const result = spawnSync("npm", ["run", "caphub:analyze", "--", CAPTURE_ID], {
        cwd: process.cwd(),
        env: { ...process.env, ALLJOBS_HOME: home },
        encoding: "utf8"
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("ANALYSIS_DISABLED");
      expect(result.stderr).not.toContain("Client Component module");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
