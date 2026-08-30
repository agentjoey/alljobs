import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ControlHostConfig } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import { computeDigest } from "../native/digest";
import { NodeGitRunner } from "./git-runner";
import { readLocalWorkingTreePlanning } from "./local-working-tree";

const roadmap = `# Roadmap

## phase-1: Foundation

\`\`\`yaml alljobs
id: phase-1
kind: phase
status: active
order: 10
\`\`\`
`;

const backlog = (priority: "P0" | "P1") => `# Backlog

## AJ-B-001: Local source test

\`\`\`yaml alljobs
id: AJ-B-001
work_mode: implementation
phase: phase-1
status: ready
priority: ${priority}
dependencies: []
\`\`\`
`;

describe("readLocalWorkingTreePlanning", () => {
  let tempRoot: string;
  let repository: string;
  let project: ProjectRegistryEntry;
  const gitRunner = new NodeGitRunner();

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "alljobs-local-working-tree-"));
    const trustedRoot = join(tempRoot, "trusted");
    repository = join(trustedRoot, "code-project");
    await mkdir(join(repository, "docs"), { recursive: true });
    await gitRunner.run(["init", "-b", "main"], { cwd: repository });
    await gitRunner.run(["config", "user.name", "Test User"], { cwd: repository });
    await gitRunner.run(["config", "user.email", "test@example.com"], { cwd: repository });
    await writeFile(join(repository, "docs", "ROADMAP.md"), roadmap, "utf8");
    await writeFile(join(repository, "docs", "BACKLOG.md"), backlog("P1"), "utf8");
    await gitRunner.run(["add", "docs"], { cwd: repository });
    await gitRunner.run(["commit", "-m", "initial planning"], { cwd: repository });
    project = {
      slug: "code-project",
      name: "Code Project",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      trusted_path: repository,
      git_branch: "main",
      archived: false
    };
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const config = (): ControlHostConfig => ({
    trustedCodeRoots: [join(tempRoot, "trusted")],
    refreshIntervalSeconds: 300
  });

  it("reads uncommitted Backlog bytes before any mirror and reports provenance", async () => {
    const localBacklog = backlog("P0");
    await writeFile(join(repository, "docs", "BACKLOG.md"), localBacklog, "utf8");

    const result = await readLocalWorkingTreePlanning({ project, config: config(), gitRunner });

    expect(result.source.mode).toBe("local-working-tree");
    expect(result.source.backlogModified).toBe(true);
    expect(result.projection.backlog[0].priority).toBe("P0");
    expect(result.source.backlogDigest).toBe(computeDigest(localBacklog));
    expect(result.source.writable).toBe(true);
    expect(result.source.headRevision).toMatch(/^[0-9a-f]{40}$/);
  });

  it("keeps a malformed present local source visible and non-writable", async () => {
    await writeFile(join(repository, "docs", "BACKLOG.md"), `# Backlog\n\n## AJ-B-001: Broken\n\n\`\`\`yaml alljobs\n: invalid: [yaml\n\`\`\`\n`, "utf8");

    const result = await readLocalWorkingTreePlanning({ project, config: config(), gitRunner });

    expect(result.source.mode).toBe("local-working-tree");
    expect(result.source.writable).toBe(false);
    expect(result.projection.issues.some((issue) => issue.code === "MALFORMED_YAML")).toBe(true);
  });

  it("retains a canonical Roadmap when the local Backlog is missing", async () => {
    await rm(join(repository, "docs", "BACKLOG.md"));

    const result = await readLocalWorkingTreePlanning({ project, config: config(), gitRunner });

    expect(result.source.mode).toBe("local-working-tree");
    expect(result.source.writable).toBe(false);
    expect(result.projection.roadmap).toHaveLength(1);
    expect(result.projection.backlog).toEqual([]);
    expect(result.projection.documents).toContainEqual(expect.objectContaining({
      document: "roadmap",
      state: "canonical"
    }));
    expect(result.projection.documents).toContainEqual(expect.objectContaining({
      document: "backlog",
      state: "missing",
      sourcePath: expect.stringMatching(/docs\/BACKLOG\.md$/)
    }));
  });

  it("keeps an uncommitted local Roadmap when Git HEAD contains only the Backlog", async () => {
    await gitRunner.run(["rm", "docs/ROADMAP.md"], { cwd: repository });
    await gitRunner.run(["commit", "-m", "remove Roadmap from HEAD"], { cwd: repository });
    await writeFile(join(repository, "docs", "ROADMAP.md"), roadmap, "utf8");

    const result = await readLocalWorkingTreePlanning({ project, config: config(), gitRunner });

    expect(result.projection.roadmap).toHaveLength(1);
    expect(result.projection.documents).toContainEqual(expect.objectContaining({
      document: "roadmap",
      state: "canonical"
    }));
    expect(result.projection.issues).not.toContainEqual(expect.objectContaining({
      code: "GIT_HEAD_CONTENT_UNAVAILABLE"
    }));
    expect(result.source.roadmapModified).toBe(true);
  });

  it("does not project bytes through an unsafe local Backlog symlink", async () => {
    await rm(join(repository, "docs", "BACKLOG.md"));
    await symlink(join(repository, "docs", "ROADMAP.md"), join(repository, "docs", "BACKLOG.md"));

    const result = await readLocalWorkingTreePlanning({ project, config: config(), gitRunner });

    expect(result.projection.roadmap).toHaveLength(1);
    expect(result.projection.backlog).toEqual([]);
    expect(result.projection.documents).toContainEqual(expect.objectContaining({
      document: "backlog",
      state: "unavailable",
      diagnostics: [expect.objectContaining({ code: "PLANNING_FILE_SYMLINK" })]
    }));
    expect(result.projection.provenance).not.toContainEqual(expect.objectContaining({
      location: "docs/BACKLOG.md"
    }));
  });

  it("does not execute commands selected by repository configuration while reading", async () => {
    const marker = join(tempRoot, "repository-command-ran");
    const command = join(tempRoot, "repository-command.sh");
    await writeFile(command, `#!/bin/sh\nprintf executed > "${marker}"\n`, "utf8");
    await chmod(command, 0o755);
    await gitRunner.run(["config", "core.fsmonitor", command], { cwd: repository });
    await gitRunner.run(["config", "filter.untrusted.clean", command], { cwd: repository });
    await writeFile(join(repository, ".gitattributes"), "docs/BACKLOG.md filter=untrusted\n", "utf8");
    await writeFile(join(repository, "docs", "BACKLOG.md"), backlog("P0"), "utf8");

    const result = await readLocalWorkingTreePlanning({ project, config: config(), gitRunner });

    expect(result.source.headRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(result.source.backlogModified).toBe(true);
    await expect(readFile(marker, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("hashes raw Backlog bytes and rejects malformed UTF-8 as non-writable", async () => {
    const backlogPath = join(repository, "docs", "BACKLOG.md");
    const malformed = Buffer.concat([Buffer.from(backlog("P1"), "utf8"), Buffer.from([0xff])]);
    await writeFile(backlogPath, malformed);

    const result = await readLocalWorkingTreePlanning({ project, config: config(), gitRunner });

    expect(result.source.backlogDigest).toBe(computeDigest(malformed));
    expect(result.source.writable).toBe(false);
    expect(result.projection.issues).toContainEqual(expect.objectContaining({ code: "INVALID_UTF8" }));
    expect(await readFile(backlogPath)).toEqual(malformed);
  });
});
