import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ControlHostResolvedPaths } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import { NativePlanningStore } from "../native/store";
import { NodeGitRunner } from "./git-runner";
import { refreshProject } from "./refresh";

const sampleRoadmap = `# AllJobs Roadmap

## phase-1: Core V1
\`\`\`yaml alljobs
id: phase-1
kind: phase
status: active
order: 10
\`\`\`
`;

const sampleBacklog = `# AllJobs Backlog

## AJ-B-001: Task One
\`\`\`yaml alljobs
id: AJ-B-001
work_mode: implementation
phase: phase-1
status: ready
priority: P0
dependencies: []
\`\`\`
`;

describe("refreshProject", () => {
  let tempHome: string;
  let tempRepo: string;
  const runner = new NodeGitRunner();

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "alljobs-home-"));
    tempRepo = await mkdtemp(join(tmpdir(), "alljobs-repo-"));

    // Set up source repository
    await runner.run(["init", "-b", "main"], { cwd: tempRepo });
    await runner.run(["config", "user.name", "Test User"], { cwd: tempRepo });
    await runner.run(["config", "user.email", "test@example.com"], { cwd: tempRepo });

    await mkdir(join(tempRepo, "docs"), { recursive: true });
    await writeFile(join(tempRepo, "docs/ROADMAP.md"), sampleRoadmap, "utf8");
    await writeFile(join(tempRepo, "docs/BACKLOG.md"), sampleBacklog, "utf8");
    await runner.run(["add", "docs"], { cwd: tempRepo });
    await runner.run(["commit", "-m", "initial docs"], { cwd: tempRepo });
  });

  afterEach(async () => {
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
    if (tempRepo) await rm(tempRepo, { recursive: true, force: true });
  });

  it("clones bare mirror and produces fresh projection with cached snapshot", async () => {
    const paths: ControlHostResolvedPaths = {
      homeDir: tempHome,
      configPath: resolve(tempHome, "config.json"),
      mirrorsDir: resolve(tempHome, "mirrors"),
      logsDir: resolve(tempHome, "logs"),
      cacheDir: resolve(tempHome, "cache"),
      config: {
        trustedCodeRoots: [dirname(tempRepo)],
        refreshIntervalSeconds: 300
      }
    };

    await mkdir(paths.mirrorsDir, { recursive: true });
    await mkdir(paths.cacheDir, { recursive: true });
    await mkdir(paths.logsDir, { recursive: true });

    const store = new NativePlanningStore(tempHome);

    const project: ProjectRegistryEntry = {
      slug: "sample-code",
      name: "Sample Code",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      git_remote: tempRepo,
      git_branch: "main",
      archived: false
    };

    const projection = await refreshProject(project, { paths, gitRunner: runner, store });

    expect(projection.freshness).toBe("fresh");
    expect(projection.project).toBe("sample-code");
    expect(projection.roadmap.length).toBe(1);
    expect(projection.backlog.length).toBe(1);
    expect(projection.issues).toEqual([]);
  });
});

function dirname(p: string) {
  return resolve(p, "..");
}
