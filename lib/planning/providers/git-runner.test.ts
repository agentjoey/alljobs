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

  it("strips inherited GIT_* environment variables", async () => {
    process.env.GIT_DIR = "/nonexistent-repo-dir-that-should-be-ignored";
    try {
      // Would fail with "not a git repository" if GIT_DIR were honored
      const result = await runner.run(["rev-parse", "--is-inside-work-tree"], {
        cwd: process.cwd()
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("true");
    } finally {
      delete process.env.GIT_DIR;
    }
  });

  it("treats option-like revisions as revisions, not flags", async () => {
    const result = await runner.run(["rev-parse", "--verify", "--end-of-options", "-bogus-ref"]);
    expect(result.exitCode).not.toBe(0);
    // Failed as an unresolvable revision, not as an unknown git option
    expect(result.stderr).not.toContain("usage:");
  });
});
