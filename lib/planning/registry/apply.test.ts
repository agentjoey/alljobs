import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ControlHostResolvedPaths } from "../config";
import { NativePlanningStore } from "../native/store";
import { NodeGitRunner } from "../providers/git-runner";
import { applyRegistration } from "./apply";
import { inspectCandidate } from "./inspect";

describe("applyRegistration", () => {
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

  it("applies valid registration proposal and writes project registry", async () => {
    const paths: ControlHostResolvedPaths = {
      homeDir: tempHome,
      configPath: resolve(tempHome, "config.json"),
      mirrorsDir: resolve(tempHome, "mirrors"),
      logsDir: resolve(tempHome, "logs"),
      cacheDir: resolve(tempHome, "cache"),
      config: {
        trustedCodeRoots: [tempRoot],
        refreshIntervalSeconds: 300
      }
    };

    const store = new NativePlanningStore(tempHome);

    const proposal = await inspectCandidate({
      slug: "my-code",
      name: "My Code",
      type: "code",
      workModes: ["implementation"],
      candidatePath: tempRepo,
      gitBranch: "main",
      config: paths.config,
      store,
      gitRunner: runner
    });

    expect(proposal.blockers).toEqual([]);

    const result = await applyRegistration(proposal, proposal.proposalDigest, {
      paths,
      store,
      gitRunner: runner
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slug).toBe("my-code");

    // Verify project exists in store
    const registered = await store.getProject("my-code");
    expect(registered).not.toBeNull();
    expect(registered?.slug).toBe("my-code");
  });

  it("rejects stale registration proposal with STALE_WRITE and zero writes", async () => {
    const paths: ControlHostResolvedPaths = {
      homeDir: tempHome,
      configPath: resolve(tempHome, "config.json"),
      mirrorsDir: resolve(tempHome, "mirrors"),
      logsDir: resolve(tempHome, "logs"),
      cacheDir: resolve(tempHome, "cache"),
      config: {
        trustedCodeRoots: [tempRoot],
        refreshIntervalSeconds: 300
      }
    };

    const store = new NativePlanningStore(tempHome);

    const proposal = await inspectCandidate({
      slug: "my-code",
      name: "My Code",
      type: "code",
      workModes: ["implementation"],
      candidatePath: tempRepo,
      gitBranch: "main",
      config: paths.config,
      store,
      gitRunner: runner
    });

    const result = await applyRegistration(proposal, "stale-bogus-digest-12345", {
      paths,
      store,
      gitRunner: runner
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("STALE_WRITE");

    // Verify ZERO writes occurred
    const list = await store.listProjects();
    expect(list).toEqual([]);
  });
});
