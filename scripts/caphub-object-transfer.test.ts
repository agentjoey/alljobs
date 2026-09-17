import { describe, expect, it, vi } from "vitest";
import { parseCaphubObjectTransferArgs, runCaphubObjectTransfer } from "./caphub-object-transfer";

const DIGEST = "a".repeat(64);

describe("caphub object transfer command boundary", () => {
  it("accepts only a no-write dry run or an explicitly confirmed digest-bound apply", () => {
    expect(parseCaphubObjectTransferArgs([])).toEqual({ action: "dry-run" });
    expect(parseCaphubObjectTransferArgs(["--dry-run"])).toEqual({ action: "dry-run" });
    expect(parseCaphubObjectTransferArgs([
      "--apply", "--digest", DIGEST, "--confirm", "COPY-CAPHUB-OBJECTS"
    ])).toEqual({ action: "apply", expectedSourceDigest: DIGEST });
    for (const args of [
      ["--apply"], ["--apply", "--digest", DIGEST, "--confirm", "wrong"],
      ["--apply", "--digest", "bad", "--confirm", "COPY-CAPHUB-OBJECTS"],
      ["--root", "/tmp"], ["--bucket", "caphub-objects"], ["--delete"]
    ]) expect(() => parseCaphubObjectTransferArgs(args)).toThrow();
  });

  it("does not load a mutation dependency for the dry-run command", async () => {
    const plan = vi.fn(async () => ({ sourceDigest: DIGEST, objectCount: 2 }));
    const apply = vi.fn(async () => ({ sourceDigest: DIGEST, objectCount: 2, verifiedObjectCount: 2 }));
    await expect(runCaphubObjectTransfer([], { plan, apply })).resolves.toEqual({ sourceDigest: DIGEST, objectCount: 2 });
    expect(apply).not.toHaveBeenCalled();
  });
});
