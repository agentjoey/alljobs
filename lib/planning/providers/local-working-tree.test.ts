import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
