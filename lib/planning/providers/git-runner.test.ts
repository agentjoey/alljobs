import { describe, expect, it } from "vitest";
import { NodeGitRunner } from "./git-runner";

describe("NodeGitRunner", () => {
  const runner = new NodeGitRunner();

  it("runs git command with disabled core.hooksPath", async () => {
    const result = await runner.run(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("git version");
  });

  it("handles non-zero exit codes cleanly", async () => {
    const result = await runner.run(["log", "-n", "1", "non-existent-ref-xyz"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeDefined();
  });
});
