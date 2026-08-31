import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareAssistantEntry } from "../../assistant/context";
import { NativePlanningStore } from "../native/store";
import { NodeGitRunner } from "../providers/git-runner";
import { getProjectDetail } from "./project";

describe("getProjectDetail", () => {
  let tempHome: string;
  let store: NativePlanningStore;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "alljobs-home-"));
    store = new NativePlanningStore(tempHome);

    await store.createProject({
      slug: "biz-project",
      name: "Business Project",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    await store.createRoadmapItem("biz-project", {
      id: "m-1",
      title: "Launch v1",
      kind: "milestone",
      status: "active",
      order: 10,
      focus: "primary"
    });

    await store.createTask("biz-project", {
      id: "T-1",
      title: "Task 1",
      project: "biz-project",
      status: "doing",
      roadmap_item: "m-1",
      source: { provider: "native" }
    });
  });

  afterEach(async () => {
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
  });

  it("loads business project detail with roadmap, tasks, attention, and metrics", async () => {
    const detail = await getProjectDetail("biz-project", { root: tempHome });
    expect(detail).not.toBeNull();
    if (!detail) return;

    expect(detail.project.slug).toBe("biz-project");
    expect(detail.roadmap.length).toBe(1);
    expect(detail.tasks.length).toBe(1);
    expect(detail.metrics.activeTasks).toBe(1);
    expect(detail.metrics.doneCount).toBe(0);
  });

  it("resolves the projection cache from control-host config when no options are given (H1)", async () => {
    await store.createProject({
      slug: "code-proj",
      name: "Code Project",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      archived: false
    });

    await writeFile(
      join(tempHome, "config.json"),
      JSON.stringify({ trustedCodeRoots: [tempHome], refreshIntervalSeconds: 300 }),
      "utf8"
    );
    await mkdir(join(tempHome, "cache"), { recursive: true });
    await writeFile(
      join(tempHome, "cache", "code-proj.json"),
      JSON.stringify({
        project: "code-proj",
        revision: "abc1234",
        fetchedAt: new Date().toISOString(),
        freshness: "fresh",
        roadmap: [
          { id: "phase-1", title: "Core", kind: "phase", status: "active", order: 10 }
        ],
        backlog: [],
        tasks: [],
        issues: [],
        provenance: []
      }),
      "utf8"
    );

    // Web pages call getProjectDetail(slug) with no options at all
    process.env.ALLJOBS_DATA_ROOT = tempHome;
    process.env.ALLJOBS_HOME = tempHome;
    try {
      const detail = await getProjectDetail("code-proj");
      expect(detail).not.toBeNull();
      expect(detail?.roadmap.length).toBe(1);
      expect(detail?.roadmap[0].id).toBe("phase-1");
      expect(detail?.backlogControl).toMatchObject({
        source: { mode: "cached", writable: false },
        ordering: "initialized",
        writable: false
      });
      expect(detail?.backlogControl?.blockers).toContainEqual(expect.objectContaining({ code: "SOURCE_NOT_WRITABLE" }));
      expect(detail?.documents).toEqual([]);
      expect(detail?.backlogControl?.blockers).toContainEqual(expect.objectContaining({
        code: "BACKLOG_DOCUMENT_NOT_CANONICAL",
        message: "Backlog control is unavailable because document health evidence is unavailable."
      }));
    } finally {
      delete process.env.ALLJOBS_DATA_ROOT;
      delete process.env.ALLJOBS_HOME;
    }
  });

  it("prefers the registered local working tree and exposes its source facts", async () => {
    const trustedRoot = join(tempHome, "trusted");
    const repository = join(trustedRoot, "code-proj");
    const runner = new NodeGitRunner();
    await mkdir(join(repository, "docs"), { recursive: true });
    await runner.run(["init", "-b", "main"], { cwd: repository });
    await runner.run(["config", "user.name", "Test User"], { cwd: repository });
    await runner.run(["config", "user.email", "test@example.com"], { cwd: repository });
    await writeFile(join(repository, "docs", "ROADMAP.md"), `# Roadmap\n\n## phase-1: Core\n\n\`\`\`yaml alljobs\nid: phase-1\nkind: phase\nstatus: active\norder: 10\n\`\`\`\n`, "utf8");
    await writeFile(join(repository, "docs", "BACKLOG.md"), `# Backlog\n\n## AJ-B-001: Local item\n\n\`\`\`yaml alljobs\nid: AJ-B-001\nwork_mode: implementation\nphase: phase-1\nstatus: ready\npriority: P1\ndependencies: []\n\`\`\`\n`, "utf8");
    await runner.run(["add", "docs"], { cwd: repository });
    await runner.run(["commit", "-m", "initial planning"], { cwd: repository });
    await writeFile(join(repository, "docs", "BACKLOG.md"), `# Backlog\n\n## AJ-B-001: Local item\n\n\`\`\`yaml alljobs\nid: AJ-B-001\nwork_mode: implementation\nphase: phase-1\nstatus: ready\npriority: P0\ndependencies: []\n\`\`\`\n`, "utf8");

    await store.createProject({
      slug: "code-proj",
      name: "Code Project",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      trusted_path: repository,
      archived: false
    });
    await writeFile(
      join(tempHome, "config.json"),
      JSON.stringify({ trustedCodeRoots: [trustedRoot], refreshIntervalSeconds: 300 }),
      "utf8"
    );

    const detail = await getProjectDetail("code-proj", { root: tempHome });

    expect(detail?.planningSource).toMatchObject({ mode: "local-working-tree", writable: true, backlogModified: true });
    expect(detail?.backlogDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(detail?.backlog[0].priority).toBe("P0");
    expect(detail?.backlogControl).toMatchObject({
      source: { mode: "local-working-tree", writable: true, backlogModified: true },
      ordering: "uninitialized",
      writable: true
    });
    expect(detail?.backlogControl?.blockers).toContainEqual(expect.objectContaining({ code: "ORDERING_NOT_INITIALIZED" }));
    expect(detail?.digest).not.toBe(detail?.backlogDigest);
  });

  it("exposes an invalid local source as a non-writable Backlog control state", async () => {
    const trustedRoot = join(tempHome, "trusted");
    const repository = join(trustedRoot, "invalid-code-proj");
    await mkdir(repository, { recursive: true });
    await store.createProject({
      slug: "invalid-code-proj",
      name: "Invalid Code Project",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      trusted_path: repository,
      archived: false
    });
    await writeFile(
      join(tempHome, "config.json"),
      JSON.stringify({ trustedCodeRoots: [trustedRoot], refreshIntervalSeconds: 300 }),
      "utf8"
    );

    const detail = await getProjectDetail("invalid-code-proj", { root: tempHome });

    expect(detail?.backlogControl).toMatchObject({
      source: { mode: "local-working-tree", writable: false },
      writable: false
    });
    expect(detail?.backlogControl?.blockers).toContainEqual(expect.objectContaining({ code: "PLANNING_FILE_MISSING" }));
  });

  it("exposes a missing local Backlog separately without turning candidates into planning data", async () => {
    const trustedRoot = join(tempHome, "trusted");
    const repository = join(trustedRoot, "missing-backlog-proj");
    const runner = new NodeGitRunner();
    await mkdir(join(repository, "docs"), { recursive: true });
    await runner.run(["init", "-b", "main"], { cwd: repository });
    await runner.run(["config", "user.name", "Test User"], { cwd: repository });
    await runner.run(["config", "user.email", "test@example.com"], { cwd: repository });
    await writeFile(
      join(repository, "docs", "ROADMAP.md"),
      `# Roadmap\n\n## phase-1: Core\n\n\`\`\`yaml alljobs\nid: phase-1\nkind: phase\nstatus: active\norder: 10\n\`\`\`\n`,
      "utf8"
    );
    await runner.run(["add", "docs/ROADMAP.md"], { cwd: repository });
    await runner.run(["commit", "-m", "add roadmap"], { cwd: repository });

    await store.createProject({
      slug: "missing-backlog-proj",
      name: "Missing Backlog Project",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      trusted_path: repository,
      archived: false
    });
    await writeFile(
      join(tempHome, "config.json"),
      JSON.stringify({ trustedCodeRoots: [trustedRoot], refreshIntervalSeconds: 300 }),
      "utf8"
    );

    const detail = await getProjectDetail("missing-backlog-proj", { root: tempHome });

    expect(detail?.documents).toContainEqual(expect.objectContaining({
      document: "backlog",
      state: "missing",
      sourcePath: expect.stringMatching(/missing-backlog-proj\/docs\/BACKLOG\.md$/),
      diagnostics: [expect.objectContaining({ code: "PLANNING_FILE_MISSING" })],
      candidates: []
    }));
    expect(detail?.roadmap).toHaveLength(1);
    expect(detail?.backlog).toEqual([]);
    expect(detail?.metrics.totalBacklog).toBe(0);
    expect(detail?.backlogControl?.writable).toBe(false);
    expect(detail?.backlogControl?.blockers).toContainEqual(expect.objectContaining({
      code: "BACKLOG_DOCUMENT_NOT_CANONICAL"
    }));
  });

  it("surfaces relation issues for native roadmap and tasks (M8)", async () => {
    await store.createRoadmapItem("biz-project", {
      id: "m-2",
      title: "Conflicting order",
      kind: "milestone",
      status: "planned",
      order: 10
    });

    const detail = await getProjectDetail("biz-project", { root: tempHome });
    expect(detail).not.toBeNull();
    expect(detail?.issues.some(i => i.code === "DUPLICATE_ROADMAP_ORDER")).toBe(true);
  });
});

describe("prepareAssistantEntry (page bridge)", () => {
  it("is disabled for a project when the control host has no assistant config", async () => {
    const tempHome = await mkdtemp(join(tmpdir(), "alljobs-entry-"));
    const store = new NativePlanningStore(tempHome);
    await store.createProject({
      slug: "biz-project",
      name: "Business Project",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    try {
      const entry = await prepareAssistantEntry("biz-project", { root: tempHome });
      expect(entry).toMatchObject({ enabled: false, code: "NOT_CONFIGURED" });
    } finally {
      await rm(tempHome, { recursive: true, force: true });
    }
  });

  it("returns a browser-safe enabled entry for a configured code project", async () => {
    const tempHome = await mkdtemp(join(tmpdir(), "alljobs-entry-"));
    const trustedRoot = join(tempHome, "trusted");
    const repository = join(trustedRoot, "code-proj");
    const runner = new NodeGitRunner();
    await mkdir(join(repository, "docs"), { recursive: true });
    await runner.run(["init", "-b", "main"], { cwd: repository });
    await runner.run(["config", "user.name", "Test User"], { cwd: repository });
    await runner.run(["config", "user.email", "test@example.com"], { cwd: repository });
    await writeFile(
      join(repository, "docs", "ROADMAP.md"),
      `# Roadmap\n\n## phase-1: Core\n\n\`\`\`yaml alljobs\nid: phase-1\nkind: phase\nstatus: active\norder: 10\n\`\`\`\n`,
      "utf8"
    );
    await writeFile(
      join(repository, "docs", "BACKLOG.md"),
      `# Backlog\n\n## AJ-B-001: Local item\n\n\`\`\`yaml alljobs\nid: AJ-B-001\nwork_mode: implementation\nphase: phase-1\nstatus: ready\npriority: P1\ndependencies: []\n\`\`\`\n\nVisible dirty local value\n`,
      "utf8"
    );
    await runner.run(["add", "docs"], { cwd: repository });
    await runner.run(["commit", "-m", "initial"], { cwd: repository });

    const store = new NativePlanningStore(tempHome);
    await store.createProject({
      slug: "code-proj",
      name: "Code Project",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      trusted_path: repository,
      archived: false
    });
    await writeFile(
      join(tempHome, "config.json"),
      JSON.stringify({ trustedCodeRoots: [trustedRoot], refreshIntervalSeconds: 300, assistant: { enabled: true } }),
      "utf8"
    );

    try {
      const entry = await prepareAssistantEntry("code-proj", { root: tempHome });
      expect(entry.enabled).toBe(true);
      if (!entry.enabled) return;

      expect(entry.manifest_digest).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.receipt.sources.map(source => source.path)).toEqual(
        expect.arrayContaining(["docs/ROADMAP.md", "docs/BACKLOG.md"])
      );

      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain("Visible dirty local value");
      expect(serialized).not.toContain(tempHome);
    } finally {
      await rm(tempHome, { recursive: true, force: true });
    }
  });
});
