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
});
