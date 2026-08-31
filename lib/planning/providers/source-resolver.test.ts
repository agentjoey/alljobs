import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ControlHostResolvedPaths } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import { NodeGitRunner } from "./git-runner";
import { resolveCodePlanning } from "./source-resolver";

describe("resolveCodePlanning", () => {
  let tempHome: string;
  let paths: ControlHostResolvedPaths;
  const gitRunner = new NodeGitRunner();

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "alljobs-source-resolver-"));
    paths = {
      homeDir: tempHome,
      configPath: join(tempHome, "config.json"),
      mirrorsDir: join(tempHome, "mirrors"),
      logsDir: join(tempHome, "logs"),
      cacheDir: join(tempHome, "cache"),
      config: { trustedCodeRoots: [join(tempHome, "trusted")], refreshIntervalSeconds: 300 }
    };
    await mkdir(paths.cacheDir, { recursive: true });
    await mkdir(paths.mirrorsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempHome, { recursive: true, force: true });
  });

  const project = (trustedPath: string): ProjectRegistryEntry => ({
    slug: "code-project",
    name: "Code Project",
    type: "code",
    work_modes: ["implementation"],
    execution_locations: [],
    trusted_path: trustedPath,
    git_branch: "main",
    archived: false
  });

  async function cache(backlogId = "AJ-B-CACHE") {
    await writeFile(join(paths.cacheDir, "code-project.json"), JSON.stringify({
      project: "code-project",
      revision: "cache123",
      fetchedAt: "2026-08-29T00:00:00.000Z",
      freshness: "stale",
      roadmap: [],
      backlog: [{ id: backlogId, title: "Cached", work_mode: "operations", status: "idea", priority: "P2", dependencies: [] }],
      tasks: [],
      issues: [],
      provenance: []
    }), "utf8");
  }

  it("falls back to cached projection only when the registered workspace is unavailable", async () => {
    await cache();

    const result = await resolveCodePlanning({
      project: project(join(paths.config.trustedCodeRoots[0], "missing")), paths, gitRunner
    });

    expect(result.source).toMatchObject({ mode: "cached", writable: false, headRevision: "cache123" });
    expect(result.projection.backlog[0].id).toBe("AJ-B-CACHE");
  });

  it("uses an existing mirror before cache when the workspace is unavailable", async () => {
    const source = join(tempHome, "source");
    await mkdir(join(source, "docs"), { recursive: true });
    await gitRunner.run(["init", "-b", "main"], { cwd: source });
    await gitRunner.run(["config", "user.name", "Test User"], { cwd: source });
    await gitRunner.run(["config", "user.email", "test@example.com"], { cwd: source });
    await writeFile(join(source, "docs", "ROADMAP.md"), `# Roadmap\n\n## phase-1: Core\n\n\`\`\`yaml alljobs\nid: phase-1\nkind: phase\nstatus: active\norder: 10\n\`\`\`\n`, "utf8");
    await writeFile(join(source, "docs", "BACKLOG.md"), `# Backlog\n\n## AJ-B-001: Mirrored\n\n\`\`\`yaml alljobs\nid: AJ-B-001\nwork_mode: implementation\nphase: phase-1\nstatus: ready\npriority: P1\ndependencies: []\n\`\`\`\n`, "utf8");
    await gitRunner.run(["add", "docs"], { cwd: source });
    await gitRunner.run(["commit", "-m", "planning"], { cwd: source });
    await gitRunner.run(["clone", "--bare", source, join(paths.mirrorsDir, "code-project.git")]);
    await cache("AJ-B-CACHE");

    const result = await resolveCodePlanning({
      project: project(join(paths.config.trustedCodeRoots[0], "missing")), paths, gitRunner
    });

    expect(result.source).toMatchObject({ mode: "remote-commit", writable: false });
    expect(result.projection.backlog[0].id).toBe("AJ-B-001");
  });

  it("does not hide a present local Backlog failure behind cached data", async () => {
    await cache();
    const repository = join(paths.config.trustedCodeRoots[0], "code-project");
    await mkdir(join(repository, "docs"), { recursive: true });
    await gitRunner.run(["init", "-b", "main"], { cwd: repository });
    await gitRunner.run(["config", "user.name", "Test User"], { cwd: repository });
    await gitRunner.run(["config", "user.email", "test@example.com"], { cwd: repository });
    await writeFile(join(repository, "docs", "ROADMAP.md"), `# Roadmap\n\n## phase-1: Core\n\n\`\`\`yaml alljobs\nid: phase-1\nkind: phase\nstatus: active\norder: 10\n\`\`\`\n`, "utf8");
    await gitRunner.run(["add", "docs/ROADMAP.md"], { cwd: repository });
    await gitRunner.run(["commit", "-m", "Roadmap only"], { cwd: repository });

    const result = await resolveCodePlanning({ project: project(repository), paths, gitRunner });

    expect(result.source).toMatchObject({ mode: "local-working-tree", writable: false });
    expect(result.projection.roadmap).toHaveLength(1);
    expect(result.projection.backlog).toEqual([]);
    expect(result.projection.documents).toContainEqual(expect.objectContaining({
      document: "backlog",
      state: "missing",
      sourcePath: expect.stringMatching(/docs\/BACKLOG\.md$/)
    }));
    expect(result.source.mode).toBe("local-working-tree");
  });

  it("reports unavailable document evidence when no local, mirror, or cache source exists", async () => {
    const result = await resolveCodePlanning({
      project: project(join(paths.config.trustedCodeRoots[0], "missing")), paths, gitRunner
    });

    expect(result.projection.documents).toEqual([
      expect.objectContaining({ document: "roadmap", state: "unavailable" }),
      expect.objectContaining({ document: "backlog", state: "unavailable" })
    ]);
  });
});
