import { existsSync } from "node:fs";
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
  let tempData: string;
  let tempRoot: string;
  let tempRepo: string;
  let paths: ControlHostResolvedPaths;
  let store: NativePlanningStore;
  const runner = new NodeGitRunner();

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "alljobs-home-"));
    // The store's data root deliberately differs from the control-host home
    // so tests cannot pass while init files land in the wrong root.
    tempData = await mkdtemp(join(tmpdir(), "alljobs-data-"));
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

    paths = {
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
    await mkdir(paths.mirrorsDir, { recursive: true });

    store = new NativePlanningStore(tempData);
  });

  afterEach(async () => {
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
    if (tempData) await rm(tempData, { recursive: true, force: true });
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });

  it("applies valid registration proposal and writes project registry", async () => {
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

    // Bare mirror staged under the control-host mirrors dir
    expect(existsSync(resolve(paths.mirrorsDir, "my-code.git"))).toBe(true);
  });

  it("rejects stale registration proposal with STALE_WRITE and zero writes", async () => {
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

  it("initializes business project files under the store data root (H4)", async () => {
    const proposal = await inspectCandidate({
      slug: "biz-launch",
      name: "Biz Launch",
      type: "business",
      workModes: ["operations"],
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

    // Native files live in the store's data root, not the control-host home
    expect(existsSync(join(tempData, "roadmaps", "biz-launch.md"))).toBe(true);
    expect(existsSync(join(tempData, "tasks", "biz-launch.md"))).toBe(true);
    expect(existsSync(join(tempHome, "roadmaps", "biz-launch.md"))).toBe(false);
    expect(existsSync(join(tempHome, "tasks", "biz-launch.md"))).toBe(false);

    // And the store can actually read them back
    const { items } = await store.readRoadmap("biz-launch");
    expect(items).toEqual([]);
  });

  it("rolls back the registry entry when the mirror clone fails (M3)", async () => {
    // A trusted child path that is NOT a git repository: inspect passes
    // (rev-parse failure is a warning), but the bare clone must fail.
    const notARepo = join(tempRoot, "not-a-repo");
    await mkdir(notARepo, { recursive: true });

    const proposal = await inspectCandidate({
      slug: "broken-code",
      name: "Broken Code",
      type: "code",
      workModes: ["implementation"],
      candidatePath: notARepo,
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

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("FILESYSTEM_ERROR");

    // All-or-nothing: the registry entry was compensated away
    expect(await store.getProject("broken-code")).toBeNull();
    expect(await store.listProjects()).toEqual([]);
  });
});
