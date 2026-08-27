import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ControlHostConfig } from "../config";
import { NativePlanningStore } from "../native/store";
import { NodeGitRunner } from "../providers/git-runner";
import { inspectCandidate } from "./inspect";

describe("inspectCandidate", () => {
  let tempHome: string;
  let tempRoot: string;
  let tempRepo: string;
  const runner = new NodeGitRunner();

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "alljobs-home-"));
    tempRoot = await mkdtemp(join(tmpdir(), "alljobs-trusted-"));
    tempRepo = join(tempRoot, "my-code-repo");
    await mkdir(tempRepo, { recursive: true });

    await runner.run(["init", "-b", "main"], { cwd: tempRepo });
    await runner.run(["config", "user.name", "Test User"], { cwd: tempRepo });
    await runner.run(["config", "user.email", "test@example.com"], { cwd: tempRepo });

    await mkdir(join(tempRepo, "docs"), { recursive: true });
    await writeFile(join(tempRepo, "docs/ROADMAP.md"), "# Roadmap\n", "utf8");
    await writeFile(join(tempRepo, "docs/BACKLOG.md"), "# Backlog\n", "utf8");
    await runner.run(["add", "docs"], { cwd: tempRepo });
    await runner.run(["commit", "-m", "init docs"], { cwd: tempRepo });
  });

  afterEach(async () => {
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });

  it("inspects valid code project with zero writes", async () => {
    const store = new NativePlanningStore(tempHome);
    const config: ControlHostConfig = {
      trustedCodeRoots: [tempRoot],
      refreshIntervalSeconds: 300
    };

    const proposal = await inspectCandidate({
      slug: "my-code",
      name: "My Code",
      type: "code",
      workModes: ["implementation"],
      candidatePath: tempRepo,
      gitBranch: "main",
      config,
      store,
      gitRunner: runner
    });

    expect(proposal.proposalDigest).toBeDefined();
    expect(proposal.blockers).toEqual([]);
    expect(proposal.inspectedRevision).toBeDefined();
    expect(proposal.documentFingerprints["docs/ROADMAP.md"]).toBeDefined();
    expect(proposal.documentFingerprints["docs/BACKLOG.md"]).toBeDefined();
    expect(proposal.writes.length).toBe(2);

    // Verify ZERO writes occurred
    const list = await store.listProjects();
    expect(list).toEqual([]);
  });

  it("blocks untrusted candidate path outside trusted roots", async () => {
    const store = new NativePlanningStore(tempHome);
    const config: ControlHostConfig = {
      trustedCodeRoots: ["/some/other/unrelated/path"],
      refreshIntervalSeconds: 300
    };

    const proposal = await inspectCandidate({
      slug: "my-code",
      name: "My Code",
      type: "code",
      workModes: ["implementation"],
      candidatePath: tempRepo,
      config,
      store,
      gitRunner: runner
    });

    expect(proposal.blockers.some(b => b.code === "UNTRUSTED_CODE_ROOT")).toBe(true);
  });
});
