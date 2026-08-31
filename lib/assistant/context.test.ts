import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NativePlanningStore } from "../planning/native/store";
import { NodeGitRunner } from "../planning/providers/git-runner";
import { assembleAssistantContext, ContextAssemblyError, prepareAssistantEntry } from "./context";

const ROADMAP = `# Roadmap\n\n## phase-1: Core\n\n\`\`\`yaml alljobs\nid: phase-1\nkind: phase\nstatus: active\norder: 10\n\`\`\`\n`;
const BACKLOG = `# Backlog\n\n## AJ-B-001: Local item\n\n\`\`\`yaml alljobs\nid: AJ-B-001\nwork_mode: implementation\nphase: phase-1\nstatus: ready\npriority: P1\ndependencies: []\n\`\`\`\n`;

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

interface Workspace {
  tempHome: string;
  repository: string;
  trustedRoot: string;
  store: NativePlanningStore;
  runner: NodeGitRunner;
}

async function setupWorkspace(options: {
  slug?: string;
  files?: Record<string, string>;
  contextPaths?: string[];
  dirtyBacklog?: string;
} = {}): Promise<Workspace> {
  const slug = options.slug ?? "sample-code";
  const tempHome = await mkdtemp(join(tmpdir(), "alljobs-ctx-"));
  tempDirs.push(tempHome);
  const trustedRoot = join(tempHome, "trusted");
  const repository = join(trustedRoot, slug);
  const runner = new NodeGitRunner();
  await mkdir(join(repository, "docs"), { recursive: true });
  await runner.run(["init", "-b", "main"], { cwd: repository });
  await runner.run(["config", "user.name", "Test User"], { cwd: repository });
  await runner.run(["config", "user.email", "test@example.com"], { cwd: repository });

  const files: Record<string, string> = {
    "docs/ROADMAP.md": ROADMAP,
    "docs/BACKLOG.md": BACKLOG,
    ...(options.files ?? {})
  };
  for (const [relative, content] of Object.entries(files)) {
    await writeFile(join(repository, ...relative.split("/")), content, "utf8");
  }
  await runner.run(["add", "."], { cwd: repository });
  await runner.run(["commit", "-m", "initial"], { cwd: repository });

  if (options.dirtyBacklog) {
    await writeFile(join(repository, "docs", "BACKLOG.md"), options.dirtyBacklog, "utf8");
  }

  const store = new NativePlanningStore(tempHome);
  await store.createProject({
    slug,
    name: "Sample Code",
    type: "code",
    work_modes: ["implementation"],
    execution_locations: [],
    trusted_path: repository,
    ...(options.contextPaths ? { assistant: { context_paths: options.contextPaths } } : {}),
    archived: false
  });
  await writeFile(
    join(tempHome, "config.json"),
    JSON.stringify({
      trustedCodeRoots: [trustedRoot],
      refreshIntervalSeconds: 300,
      assistant: { enabled: true }
    }),
    "utf8"
  );
  return { tempHome, repository, trustedRoot, store, runner };
}

describe("assembleAssistantContext", () => {
  it("reads real local sources into fragments and builds a browser-safe receipt", async () => {
    const { tempHome } = await setupWorkspace();
    const bundle = await assembleAssistantContext({ projectSlug: "sample-code", root: tempHome });

    expect(bundle.receipt.source_mode).toBe("local-working-tree");
    expect(bundle.receipt.sources.map((source) => source.path)).toEqual(
      expect.arrayContaining(["docs/ROADMAP.md", "docs/BACKLOG.md"])
    );
    expect(bundle.fragments.some((fragment) => fragment.content.includes("AJ-B-001"))).toBe(true);
    expect(JSON.stringify(bundle.receipt)).not.toContain("AJ-B-001");
    expect(JSON.stringify(bundle.receipt)).not.toContain(tempHome);
  });

  it("prefers the dirty local value and marks the source modified", async () => {
    const dirty = `${BACKLOG}\nVisible dirty local value\n`;
    const { tempHome } = await setupWorkspace({ dirtyBacklog: dirty });
    const bundle = await assembleAssistantContext({ projectSlug: "sample-code", root: tempHome });

    const backlogFragment = bundle.fragments.find((fragment) => fragment.path === "docs/BACKLOG.md");
    expect(backlogFragment?.content).toContain("Visible dirty local value");

    const backlogSource = bundle.receipt.sources.find((source) => source.path === "docs/BACKLOG.md");
    expect(backlogSource?.modified).toBe(true);
    expect(JSON.stringify(bundle.receipt)).not.toContain("Visible dirty local value");
  });

  it("includes only allowlisted optional sources when selected", async () => {
    const { tempHome } = await setupWorkspace({
      files: { "docs/architecture.md": "# Architecture\n\nApproved design details\n" },
      contextPaths: ["docs/architecture.md"]
    });

    const selected = await assembleAssistantContext({
      projectSlug: "sample-code",
      root: tempHome,
      selectedOptionalSourceIds: ["docs/architecture.md"]
    });
    const optionalFragment = selected.fragments.find((fragment) => fragment.path === "docs/architecture.md");
    expect(optionalFragment?.content).toContain("Approved design");
    expect(selected.receipt.sources.find((source) => source.path === "docs/architecture.md")?.selected).toBe(true);
    expect(selected.receipt.sources.find((source) => source.path === "docs/architecture.md")?.optional).toBe(true);

    const deselected = await assembleAssistantContext({ projectSlug: "sample-code", root: tempHome });
    expect(deselected.fragments.some((fragment) => fragment.path === "docs/architecture.md")).toBe(false);
    expect(deselected.receipt.sources.find((source) => source.path === "docs/architecture.md")?.selected).toBe(false);
  });

  it("ignores selected source ids outside the allowlist", async () => {
    const { tempHome } = await setupWorkspace({
      files: { "docs/architecture.md": "# Architecture\n" },
      contextPaths: ["docs/architecture.md"]
    });

    const bundle = await assembleAssistantContext({
      projectSlug: "sample-code",
      root: tempHome,
      selectedOptionalSourceIds: ["docs/not-allowed.md"]
    });
    expect(bundle.fragments.some((fragment) => fragment.path === "docs/not-allowed.md")).toBe(false);
    expect(bundle.receipt.sources.some((source) => source.path === "docs/not-allowed.md")).toBe(false);
  });

  it("rejects a symlinked optional source without reading its target", async () => {
    const { tempHome, repository } = await setupWorkspace({ contextPaths: ["docs/notes.md"] });
    const outside = join(tempHome, "outside.txt");
    await writeFile(outside, "secret outside content", "utf8");
    await symlink(outside, join(repository, "docs", "notes.md"));

    const bundle = await assembleAssistantContext({
      projectSlug: "sample-code",
      root: tempHome,
      selectedOptionalSourceIds: ["docs/notes.md"]
    });

    expect(bundle.fragments.some((fragment) => fragment.content.includes("secret outside content"))).toBe(false);
    expect(bundle.receipt.issues.some((issue) => issue.code === "CONTEXT_FILE_SYMLINK")).toBe(true);
  });

  it("labels remote sources read-only with null modified", async () => {
    const { tempHome, repository, trustedRoot, runner } = await setupWorkspace({ slug: "remote-code" });
    const mirrorPath = join(tempHome, "mirrors", "remote-code.git");
    await mkdir(join(tempHome, "mirrors"), { recursive: true });
    await runner.run(["clone", "--bare", "--no-checkout", "--", repository, mirrorPath]);

    // A missing trusted_path makes the resolver fall through to the mirror.
    const store = new NativePlanningStore(tempHome);
    await store.removeProject("remote-code");
    await store.createProject({
      slug: "remote-code",
      name: "Remote Code",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      trusted_path: join(trustedRoot, "does-not-exist"),
      archived: false
    });

    const bundle = await assembleAssistantContext({ projectSlug: "remote-code", root: tempHome });

    expect(bundle.receipt.source_mode).toBe("remote-commit");
    expect(bundle.receipt.sources.every((source) => source.modified === null)).toBe(true);
    expect(bundle.fragments.some((fragment) => fragment.content.includes("AJ-B-001"))).toBe(true);
  });

  it("labels cached sources read-only with no raw fragments", async () => {
    const tempHome = await mkdtemp(join(tmpdir(), "alljobs-cache-"));
    tempDirs.push(tempHome);
    const store = new NativePlanningStore(tempHome);
    await store.createProject({
      slug: "cached-code",
      name: "Cached Code",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      archived: false
    });
    await writeFile(
      join(tempHome, "config.json"),
      JSON.stringify({ trustedCodeRoots: [tempHome], refreshIntervalSeconds: 300, assistant: { enabled: true } }),
      "utf8"
    );
    await mkdir(join(tempHome, "cache"), { recursive: true });
    await writeFile(
      join(tempHome, "cache", "cached-code.json"),
      JSON.stringify({
        project: "cached-code",
        revision: "abc1234",
        fetchedAt: new Date().toISOString(),
        freshness: "fresh",
        roadmap: [{ id: "phase-1", title: "Core", kind: "phase", status: "active", order: 10 }],
        backlog: [],
        tasks: [],
        issues: [],
        provenance: [
          { provider: "git-markdown", location: "docs/ROADMAP.md", revision: "abc1234", digest: "a".repeat(64), fetchedAt: new Date().toISOString() },
          { provider: "git-markdown", location: "docs/BACKLOG.md", revision: "abc1234", digest: "b".repeat(64), fetchedAt: new Date().toISOString() }
        ],
        documents: []
      }),
      "utf8"
    );

    const bundle = await assembleAssistantContext({ projectSlug: "cached-code", root: tempHome });

    expect(bundle.receipt.source_mode).toBe("cached");
    expect(bundle.receipt.sources.every((source) => source.modified === null)).toBe(true);
    expect(bundle.receipt.sources.map((source) => source.path)).toEqual(
      expect.arrayContaining(["docs/ROADMAP.md", "docs/BACKLOG.md"])
    );
    expect(bundle.fragments).toEqual([]);
  });

  it("uses nullable raw ranges for an unavailable required document", async () => {
    const { tempHome, repository } = await setupWorkspace();
    await rm(join(repository, "docs", "BACKLOG.md"));

    const bundle = await assembleAssistantContext({ projectSlug: "sample-code", root: tempHome });

    const backlogFragment = bundle.fragments.find((fragment) => fragment.path === "docs/BACKLOG.md");
    expect(backlogFragment).toBeDefined();
    expect(backlogFragment?.heading).toBeNull();
    expect(backlogFragment?.line_start).toBeNull();
    expect(backlogFragment?.line_end).toBeNull();
    expect(backlogFragment?.content).toBe("");
    expect(bundle.receipt.issues.some((issue) => issue.code === "PLANNING_FILE_MISSING")).toBe(true);
  });

  it("produces a deterministic digest that changes when a selected byte changes", async () => {
    const { tempHome, repository } = await setupWorkspace();
    const fixedReadAt = "2026-09-01T00:00:00.000Z";

    const first = await assembleAssistantContext({ projectSlug: "sample-code", root: tempHome, readAt: fixedReadAt });
    const repeat = await assembleAssistantContext({ projectSlug: "sample-code", root: tempHome, readAt: fixedReadAt });
    expect(repeat.manifest.manifest_digest).toBe(first.manifest.manifest_digest);

    await writeFile(
      join(repository, "docs", "BACKLOG.md"),
      BACKLOG.replace("priority: P1", "priority: P0"),
      "utf8"
    );
    const changed = await assembleAssistantContext({ projectSlug: "sample-code", root: tempHome, readAt: fixedReadAt });
    expect(changed.manifest.manifest_digest).not.toBe(first.manifest.manifest_digest);
  });

  it("fails explicitly with CONTEXT_LIMIT when required context exceeds the budget", async () => {
    const hugeBacklog = `# Backlog\n\n${"padding line\n".repeat(22000)}`;
    const { tempHome } = await setupWorkspace({ files: { "docs/BACKLOG.md": hugeBacklog } });

    await expect(
      assembleAssistantContext({ projectSlug: "sample-code", root: tempHome })
    ).rejects.toMatchObject({ code: "CONTEXT_LIMIT" });
  });

  it("throws a ContextAssemblyError for a missing project", async () => {
    const { tempHome } = await setupWorkspace();
    await expect(
      assembleAssistantContext({ projectSlug: "does-not-exist", root: tempHome })
    ).rejects.toBeInstanceOf(ContextAssemblyError);
  });
});

describe("prepareAssistantEntry", () => {
  it("is disabled (NOT_CONFIGURED) when the control host config is missing", async () => {
    const tempHome = await mkdtemp(join(tmpdir(), "alljobs-entry-"));
    tempDirs.push(tempHome);
    const store = new NativePlanningStore(tempHome);
    await store.createProject({
      slug: "biz",
      name: "Business",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    const entry = await prepareAssistantEntry("biz", { root: tempHome });
    expect(entry).toMatchObject({ enabled: false, code: "NOT_CONFIGURED" });
  });

  it("is disabled (NOT_CONFIGURED) when the assistant is not enabled", async () => {
    const { tempHome } = await setupWorkspace();
    await writeFile(
      join(tempHome, "config.json"),
      JSON.stringify({ trustedCodeRoots: [join(tempHome, "trusted")], refreshIntervalSeconds: 300, assistant: { enabled: false } }),
      "utf8"
    );

    const entry = await prepareAssistantEntry("sample-code", { root: tempHome });
    expect(entry).toMatchObject({ enabled: false, code: "NOT_CONFIGURED" });
  });

  it("returns a browser-safe enabled entry for a configured project", async () => {
    const { tempHome } = await setupWorkspace({ dirtyBacklog: `${BACKLOG}\nVisible dirty local value\n` });

    const entry = await prepareAssistantEntry("sample-code", { root: tempHome });

    expect(entry.enabled).toBe(true);
    if (!entry.enabled) return;

    expect(entry.manifest_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.receipt.source_mode).toBe("local-working-tree");
    expect(entry.receipt.sources.map((source) => source.path)).toEqual(
      expect.arrayContaining(["docs/ROADMAP.md", "docs/BACKLOG.md"])
    );

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("Visible dirty local value");
    expect(serialized).not.toContain(tempHome);
    expect(serialized).not.toContain("contextBytes");
    expect(serialized).not.toContain("MiniMax-M3");
    expect(serialized).not.toContain("fragments");
  });
});
