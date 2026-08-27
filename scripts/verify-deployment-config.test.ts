import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("verify-deployment-config script", () => {
  it("executes cleanly and validates deployment invariants", () => {
    const scriptPath = resolve(process.cwd(), "scripts/verify-deployment-config.mjs");
    const output = execFileSync("node", [scriptPath], { encoding: "utf8" });
    expect(output).toContain("All deployment configs and invariants verified successfully.");
  });
});
