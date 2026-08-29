import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ControlHostResolvedPaths } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import { withProjectLock } from "../native/lock";
import { NativePlanningStore } from "../native/store";
import { NodeGitRunner } from "../providers/git-runner";
import {
  applyBacklogOrderingChange,
  proposeBacklogOrderingChange,
  type BacklogMutationDependencies
} from "./mutations";

const roadmap = [
  "# Roadmap", "", "## phase-1: Foundation", "", "```yaml alljobs",
  "id: phase-1", "kind: phase", "status: active", "order: 10", "```", ""
].join("\n");

const backlog = (extra = "") => [
  "# Backlog", "", "## AJ-B-001: First", "", "```yaml alljobs",
  "id: AJ-B-001", "work_mode: implementation", "phase: phase-1", "status: ready",
  "priority: P0", "rank: 100", "dependencies: []", "```", "",
  "## AJ-B-002: Move me", "", "```yaml alljobs", "id: AJ-B-002",
  "work_mode: implementation", "phase: phase-1", "status: ready", "priority: P1",
  "rank: 100", "dependencies: []", "```", "", "Human note kept outside the target section.", extra, ""
].join("\n");

describe("Backlog ordering mutations", () => {
  let tempHome: string;
  let repository: string;
  let backlogPath: string;
  let paths: ControlHostResolvedPaths;
  let store: NativePlanningStore;
  let deps: BacklogMutationDependencies;
  const gitRunner = new NodeGitRunner();
  const intent = { kind: "change-priority" as const, itemId: "AJ-B-002", targetPriority: "P0" as const };

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "alljobs-backlog-mutations-"));
    const trustedRoot = join(tempHome, "trusted");
    repository = join(trustedRoot, "sample");
    backlogPath = join(repository, "docs", "BACKLOG.md");
    paths = {
      homeDir: tempHome, configPath: join(tempHome, "config.json"), mirrorsDir: join(tempHome, "mirrors"),
      logsDir: join(tempHome, "logs"), cacheDir: join(tempHome, "cache"),
      config: { trustedCodeRoots: [trustedRoot], refreshIntervalSeconds: 300 }
    };
    await mkdir(join(repository, "docs"), { recursive: true });
    await Promise.all([mkdir(paths.mirrorsDir, { recursive: true }), mkdir(paths.logsDir, { recursive: true }), mkdir(paths.cacheDir, { recursive: true })]);
    await gitRunner.run(["init", "-b", "main"], { cwd: repository });
    await gitRunner.run(["config", "user.name", "Test User"], { cwd: repository });
    await gitRunner.run(["config", "user.email", "test@example.com"], { cwd: repository });
    await writeFile(join(repository, "docs", "ROADMAP.md"), roadmap, "utf8");
    await writeFile(backlogPath, backlog(), "utf8");
    await gitRunner.run(["add", "docs"], { cwd: repository });
    await gitRunner.run(["commit", "-m", "initial planning"], { cwd: repository });
    await writeFile(backlogPath, backlog("Uncommitted human note."), "utf8");
    store = new NativePlanningStore(tempHome);
    const project: ProjectRegistryEntry = {
      slug: "sample", name: "Sample", type: "code", work_modes: ["implementation"],
      execution_locations: [], trusted_path: repository, git_branch: "main", archived: false
    };
    await store.createProject(project);
    deps = { paths, store, gitRunner };
  });

  afterEach(async () => { await rm(tempHome, { recursive: true, force: true }); });

  it("builds a digest-bound proposal from a dirty local Backlog without writing it", async () => {
    const before = await readFile(backlogPath, "utf8");
    const result = await proposeBacklogOrderingChange({ projectSlug: "sample", intent }, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await readFile(backlogPath, "utf8")).toBe(before);
    expect(result.proposal.backlogModified).toBe(true);
    expect(result.proposal.changes).toEqual([{ itemId: "AJ-B-002", priority: "P0", rank: 200 }]);
    expect(result.proposal.expectedFileDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.proposal.proposalDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.proposal.diff).toContain("AJ-B-002");
  });

  it("applies only the reviewed fields and leaves Git HEAD unchanged", async () => {
    const headBefore = await gitRunner.run(["rev-parse", "HEAD"], { cwd: repository });
    const proposed = await proposeBacklogOrderingChange({ projectSlug: "sample", intent }, deps);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const result = await applyBacklogOrderingChange(proposed.proposal, proposed.proposal.proposalDigest, deps);
    const content = await readFile(backlogPath, "utf8");
    const headAfter = await gitRunner.run(["rev-parse", "HEAD"], { cwd: repository });

    expect(result).toMatchObject({ ok: true, changes: [{ itemId: "AJ-B-002", priority: "P0", rank: 200 }] });
    expect(content).toContain("priority: P0\nrank: 200");
    expect(content).toContain("Uncommitted human note.");
    expect(headAfter.stdout).toBe(headBefore.stdout);
    expect(await readFile(join(tempHome, "log", "activity.jsonl"), "utf8")).toContain("BACKLOG_ORDERING_APPLIED");
  });

  it("keeps a successful repository write successful when activity logging fails", async () => {
    const proposed = await proposeBacklogOrderingChange({ projectSlug: "sample", intent }, deps);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const result = await applyBacklogOrderingChange(proposed.proposal, proposed.proposal.proposalDigest, {
      ...deps,
      recordEvent: async () => { throw new Error("log unavailable"); }
    });

    expect(result).toMatchObject({ ok: true, warnings: ["ACTIVITY_LOG_FAILED"] });
    expect(await readFile(backlogPath, "utf8")).toContain("priority: P0\nrank: 200");
  });

  it("returns STALE_WRITE and preserves an external whole-file change", async () => {
    const proposed = await proposeBacklogOrderingChange({ projectSlug: "sample", intent }, deps);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const staleContent = `${await readFile(backlogPath, "utf8")}\nUnrelated human edit.\n`;
    await writeFile(backlogPath, staleContent, "utf8");

    await expect(applyBacklogOrderingChange(proposed.proposal, proposed.proposal.proposalDigest, deps))
      .resolves.toMatchObject({ ok: false, code: "STALE_WRITE" });
    expect(await readFile(backlogPath, "utf8")).toBe(staleContent);
  });

  it("keeps bytes unchanged for archived, locked, write-failure, tampered, invalid, and symlink cases", async () => {
    const before = await readFile(backlogPath, "utf8");
    const project = await store.getProject("sample");
    if (!project) throw new Error("missing test project");
    project.archived = true;
    await writeFile(join(tempHome, "projects", "sample.json"), `${JSON.stringify(project, null, 2)}\n`, "utf8");
    await expect(proposeBacklogOrderingChange({ projectSlug: "sample", intent }, deps))
      .resolves.toMatchObject({ ok: false, code: "SOURCE_NOT_WRITABLE" });
    expect(await readFile(backlogPath, "utf8")).toBe(before);

    project.archived = false;
    await writeFile(join(tempHome, "projects", "sample.json"), `${JSON.stringify(project, null, 2)}\n`, "utf8");
    const proposed = await proposeBacklogOrderingChange({ projectSlug: "sample", intent }, deps);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    await withProjectLock("sample", async () => {
      await expect(applyBacklogOrderingChange(proposed.proposal, proposed.proposal.proposalDigest, deps))
        .resolves.toMatchObject({ ok: false, code: "LOCKED" });
    }, tempHome);
    expect(await readFile(backlogPath, "utf8")).toBe(before);

    await expect(applyBacklogOrderingChange(proposed.proposal, "tampered", deps))
      .resolves.toMatchObject({ ok: false, code: "STALE_WRITE" });
    await expect(applyBacklogOrderingChange({ ...proposed.proposal, changes: [] }, proposed.proposal.proposalDigest, deps))
      .resolves.toMatchObject({ ok: false, code: "STALE_WRITE" });
    expect(await readFile(backlogPath, "utf8")).toBe(before);
    const failingDeps = { ...deps, atomicReplace: async () => { throw new Error("disk full"); } };
    await expect(applyBacklogOrderingChange(proposed.proposal, proposed.proposal.proposalDigest, failingDeps))
      .resolves.toMatchObject({ ok: false, code: "WRITE_FAILED" });
    expect(await readFile(backlogPath, "utf8")).toBe(before);

    const invalidContent = backlog().replace("phase: phase-1", "phase: missing");
    await writeFile(backlogPath, invalidContent, "utf8");
    await expect(proposeBacklogOrderingChange({ projectSlug: "sample", intent }, deps))
      .resolves.toMatchObject({ ok: false, code: "INVALID_BACKLOG" });
    expect(await readFile(backlogPath, "utf8")).toBe(invalidContent);

    await writeFile(backlogPath, backlog("<<<<<<< HEAD"), "utf8");
    const conflictContent = await readFile(backlogPath, "utf8");
    await expect(proposeBacklogOrderingChange({ projectSlug: "sample", intent }, deps))
      .resolves.toMatchObject({ ok: false, code: "INVALID_BACKLOG" });
    expect(await readFile(backlogPath, "utf8")).toBe(conflictContent);
    await rm(backlogPath);
    await symlink(join(repository, "docs", "ROADMAP.md"), backlogPath);
    const symlinkContent = await readFile(backlogPath, "utf8");
    await expect(proposeBacklogOrderingChange({ projectSlug: "sample", intent }, deps))
      .resolves.toMatchObject({ ok: false, code: "INVALID_BACKLOG" });
    expect(await readFile(backlogPath, "utf8")).toBe(symlinkContent);
  });

  it("rejects a missing local workspace even when a cached projection exists", async () => {
    const project = await store.getProject("sample");
    if (!project) throw new Error("missing test project");
    project.trusted_path = join(paths.config.trustedCodeRoots[0], "missing");
    await writeFile(join(tempHome, "projects", "sample.json"), JSON.stringify(project), "utf8");
    await writeFile(join(paths.cacheDir, "sample.json"), JSON.stringify({
      project: "sample", revision: "cached", fetchedAt: new Date().toISOString(), freshness: "stale",
      roadmap: [], backlog: [], tasks: [], issues: [], provenance: []
    }), "utf8");
    const before = await readFile(backlogPath, "utf8");

    await expect(proposeBacklogOrderingChange({ projectSlug: "sample", intent }, deps))
      .resolves.toMatchObject({ ok: false, code: "SOURCE_NOT_WRITABLE" });
    expect(await readFile(backlogPath, "utf8")).toBe(before);
  });

  it("uses ALLJOBS_DATA_ROOT for default mutation project lookup", async () => {
    const dataRoot = join(tempHome, "separate-data-root");
    const isolatedStore = new NativePlanningStore(dataRoot);
    const isolatedProject: ProjectRegistryEntry = {
      slug: "isolated-data",
      name: "Isolated data root",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      trusted_path: repository,
      git_branch: "main",
      archived: false
    };
    await isolatedStore.createProject(isolatedProject);
    await writeFile(paths.configPath, `${JSON.stringify(paths.config, null, 2)}\n`, "utf8");

    const previousHome = process.env.ALLJOBS_HOME;
    const previousDataRoot = process.env.ALLJOBS_DATA_ROOT;
    process.env.ALLJOBS_HOME = tempHome;
    process.env.ALLJOBS_DATA_ROOT = dataRoot;
    try {
      await expect(proposeBacklogOrderingChange({ projectSlug: "isolated-data", intent }))
        .resolves.toMatchObject({ ok: true });
    } finally {
      if (previousHome === undefined) delete process.env.ALLJOBS_HOME;
      else process.env.ALLJOBS_HOME = previousHome;
      if (previousDataRoot === undefined) delete process.env.ALLJOBS_DATA_ROOT;
      else process.env.ALLJOBS_DATA_ROOT = previousDataRoot;
    }
  });
});
