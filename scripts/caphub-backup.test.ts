// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseCaphubBackupArgs, runCaphubBackup } from "./caphub-backup";

describe("caphub-backup command boundary", () => {
  it("accepts create or one bounded generation verification and rejects destructive/raw inputs", () => {
    expect(parseCaphubBackupArgs(["--create"])).toEqual({ action: "create" });
    expect(parseCaphubBackupArgs(["--verify", "20260917T150000000Z-generation"])).toEqual({
      action: "verify",
      generationId: "20260917T150000000Z-generation"
    });
    for (const args of [
      [], ["--verify"], ["--verify", "../escape"], ["--prune"], ["--delete"],
      ["--root", "/tmp"], ["--database-url", "postgresql://secret"], ["--output", "/tmp/dump"]
    ]) expect(() => parseCaphubBackupArgs(args)).toThrow();
  });

  it("dispatches only fixed create/verify operations", async () => {
    const create = vi.fn(async () => ({ generation_id: "created" }));
    const verify = vi.fn(async (generationId: string) => ({ generation_id: generationId }));
    await expect(runCaphubBackup(["--create"], { create, verify })).resolves.toEqual({ generation_id: "created" });
    await expect(runCaphubBackup(["--verify", "20260917T150000000Z-generation"], { create, verify }))
      .resolves.toEqual({ generation_id: "20260917T150000000Z-generation" });
  });
});
