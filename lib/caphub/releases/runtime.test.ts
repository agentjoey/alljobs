import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReleaseService } from "./service";
import { createReleaseService, loadControlHostReleaseService } from "./runtime";

describe("Caphub Release runtime", () => {
  it("constructs only the P4 Release service surface", () => {
    const service = createReleaseService({ pool: {} as never, clock: () => "2026-09-17T17:00:00.000Z" });
    expect(service).toBeInstanceOf(ReleaseService);
    expect(service).toHaveProperty("createCandidate");
    expect(service).toHaveProperty("finalizeApproval");
    expect(service).not.toHaveProperty("publish");
    expect(service).not.toHaveProperty("install");
    expect(service).not.toHaveProperty("rollback");
  });

  it("fails closed before loading a Registry when Caphub or Registry is disabled", async () => {
    for (const caphub of [
      { enabled: false },
      { enabled: true, registry: { enabled: false }, exports: { enabled: true } }
    ]) {
      const home = mkdtempSync(join(tmpdir(), "caphub-release-runtime-"));
      try {
        chmodSync(home, 0o700);
        const trusted = join(home, "trusted");
        mkdirSync(trusted, { mode: 0o700 });
        writeFileSync(join(home, "config.json"), JSON.stringify({ trustedCodeRoots: [trusted], caphub }), { mode: 0o600 });
        await expect(loadControlHostReleaseService({ home })).rejects.toThrow(/disabled|Registry/i);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    }
  });
});
