import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectRegistryEntry } from "../domain/types";
import { GitMarkdownProvider } from "./git-markdown";
import { NodeGitRunner } from "./git-runner";

const sampleRoadmap = `# AllJobs Roadmap

## phase-1: Core V1
\`\`\`yaml alljobs
id: phase-1
kind: phase
status: active
order: 10
focus: primary
\`\`\`
Core rebuild.
`;

const sampleBacklog = `# AllJobs Backlog

## AJ-B-001: First Backlog Item
\`\`\`yaml alljobs
id: AJ-B-001
work_mode: implementation
phase: phase-1
status: ready
priority: P0
dependencies: []
\`\`\`
Implementation detail.
`;

describe("GitMarkdownProvider", () => {
  let tempRepo: string;
  const runner = new NodeGitRunner();
  const provider = new GitMarkdownProvider(runner);

  const testProject: ProjectRegistryEntry = {
    slug: "sample-code",
    name: "Sample Code",
    type: "code",
    work_modes: ["implementation"],
    execution_locations: [],
    archived: false
  };

  beforeEach(async () => {
    tempRepo = await mkdtemp(join(tmpdir(), "alljobs-git-test-"));
    // Init git repo
    await runner.run(["init", "-b", "main"], { cwd: tempRepo });
    await runner.run(["config", "user.name", "Test User"], { cwd: tempRepo });
    await runner.run(["config", "user.email", "test@example.com"], { cwd: tempRepo });

    await mkdir(join(tempRepo, "docs"), { recursive: true });
    await writeFile(join(tempRepo, "docs/ROADMAP.md"), sampleRoadmap, "utf8");
    await writeFile(join(tempRepo, "docs/BACKLOG.md"), sampleBacklog, "utf8");

    await runner.run(["add", "docs"], { cwd: tempRepo });
    await runner.run(["commit", "-m", "chore: add planning docs"], { cwd: tempRepo });
  });

  afterEach(async () => {
    if (tempRepo) {
      await rm(tempRepo, { recursive: true, force: true });
    }
  });

  it("reads Roadmap and Backlog directly from git commit tree", async () => {
    const projection = await provider.projectRoadmap(testProject, {
      trustedPath: tempRepo,
      ref: "main"
    });

    expect(projection.freshness).toBe("fresh");
    expect(projection.project).toBe("sample-code");
    expect(projection.revision).not.toBe("unknown");
    expect(projection.roadmap.length).toBe(1);
    expect(projection.roadmap[0].id).toBe("phase-1");
    expect(projection.backlog.length).toBe(1);
    expect(projection.backlog[0].id).toBe("AJ-B-001");
    expect(projection.provenance.length).toBe(2);
    expect(projection.documents).toEqual([
      expect.objectContaining({ document: "roadmap", state: "canonical" }),
      expect.objectContaining({ document: "backlog", state: "canonical" })
    ]);
  });

  it("retains a canonical sibling when one fixed document is absent from the commit", async () => {
    await runner.run(["rm", "docs/BACKLOG.md"], { cwd: tempRepo });
    await runner.run(["commit", "-m", "remove Backlog"], { cwd: tempRepo });

    const projection = await provider.projectRoadmap(testProject, {
      trustedPath: tempRepo,
      ref: "main"
    });

    expect(projection.roadmap).toHaveLength(1);
    expect(projection.backlog).toEqual([]);
    expect(projection.documents).toEqual([
      expect.objectContaining({ document: "roadmap", state: "canonical" }),
      expect.objectContaining({
        document: "backlog",
        state: "missing",
        sourcePath: "docs/BACKLOG.md"
      })
    ]);
  });

  it("returns unavailable triage for every required document when no repository path is provided", async () => {
    const projection = await provider.projectRoadmap(testProject);

    expect(projection.documents).toEqual([
      expect.objectContaining({ document: "roadmap", state: "unavailable" }),
      expect.objectContaining({ document: "backlog", state: "unavailable" })
    ]);
  });

  it("omits Roadmap triage for an operations-only project", async () => {
    const projection = await provider.projectRoadmap({
      ...testProject,
      work_modes: ["operations"]
    }, {
      trustedPath: tempRepo,
      ref: "main"
    });

    expect(projection.roadmap).toEqual([]);
    expect(projection.documents).toEqual([
      expect.objectContaining({ document: "backlog", state: "canonical" })
    ]);
  });
});
