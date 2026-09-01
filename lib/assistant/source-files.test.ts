import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NativePlanningStore } from "../planning/native/store";
import type { ProjectRegistryEntry } from "../planning/domain/types";
import {
  createAssistantReadTools,
  listProjectFiles,
  readProjectFiles,
  sourceBudgetFromGate,
  type SourceReadBudget
} from "./source-files";
import { createSourceGate } from "./source-gates";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

interface Fixture {
  tempHome: string;
  trustedRoot: string;
  repository: string;
  project: ProjectRegistryEntry;
}

async function setupFixture(): Promise<Fixture> {
  const tempHome = await mkdtemp(join(tmpdir(), "alljobs-srcfiles-"));
  tempDirs.push(tempHome);
  const trustedRoot = join(tempHome, "trusted");
  const repository = join(trustedRoot, "code-project");
  await mkdir(join(repository, "src", "deep"), { recursive: true });
  await mkdir(join(repository, "docs"), { recursive: true });
  await mkdir(join(repository, "node_modules", "pkg"), { recursive: true });

  await writeFile(join(repository, "src", "index.ts"), "export const index = 1;\n", "utf8");
  await writeFile(join(repository, "src", "util.ts"), "export function util() {}\n", "utf8");
  await writeFile(join(repository, "src", "deep", "nested.ts"), "export const nested = true;\n", "utf8");
  await writeFile(join(repository, "docs", "README.md"), "# Readme\n", "utf8");
  await writeFile(join(repository, ".env"), "SECRET=1\n", "utf8");
  await writeFile(join(repository, ".env.local"), "SECRET=2\n", "utf8");
  await writeFile(join(repository, "secret.pem"), "-----BEGIN PRIVATE KEY-----\n", "utf8");
  await writeFile(join(repository, "node_modules", "pkg", "index.js"), "module.exports = {};\n", "utf8");
  await writeFile(join(repository, "src", "binary.ts"), "const a = '\u0000\u0000\u0000';\n", "utf8");
  await writeFile(join(repository, "src", "oversize.ts"), "// pad\n".repeat(10000), "utf8");
  await writeFile(join(repository, "src", "note.png"), "not really a png", "utf8");
  await writeFile(join(repository, "src", "escape.ts"), "export const escape = 'regular';\n", "utf8");
  await writeFile(join(tempHome, "outside-secret.txt"), "secret outside content\n", "utf8");
  await symlink(join(tempHome, "outside-secret.txt"), join(repository, "src", "link.ts"));

  const store = new NativePlanningStore(tempHome);
  const project: ProjectRegistryEntry = {
    slug: "code-project",
    name: "Code project",
    type: "code",
    work_modes: ["implementation"],
    execution_locations: [],
    trusted_path: repository,
    archived: false
  };
  await store.createProject(project);
  await writeFile(
    join(tempHome, "config.json"),
    JSON.stringify({ trustedCodeRoots: [trustedRoot], refreshIntervalSeconds: 300, assistant: { enabled: true } }),
    "utf8"
  );
  return { tempHome, trustedRoot, repository, project };
}

function budget(overrides: Partial<SourceReadBudget> = {}): SourceReadBudget {
  return {
    max_files: 100,
    max_bytes: 1024 * 1024,
    max_tool_calls: 100,
    remaining_files: 100,
    remaining_bytes: 1024 * 1024,
    remaining_tool_calls: 100,
    ...overrides
  };
}

function read(fixture: Fixture, paths: string[], b: SourceReadBudget = budget()) {
  return readProjectFiles({ project: fixture.project, paths, budget: b, root: fixture.tempHome });
}

function list(fixture: Fixture, prefix?: string, b: SourceReadBudget = budget()) {
  return listProjectFiles({ project: fixture.project, budget: b, prefix, root: fixture.tempHome });
}

describe("listProjectFiles", () => {
  it("returns a deterministic sorted list of readable files, excluding unsafe paths", async () => {
    const fixture = await setupFixture();
    const first = await list(fixture);
    const second = await list(fixture);

    expect(first.paths).toEqual(second.paths);
    expect([...first.paths].sort()).toEqual(first.paths);

    expect(first.paths).toEqual(
      expect.arrayContaining(["src/index.ts", "src/util.ts", "src/deep/nested.ts", "docs/README.md"])
    );
    expect(first.paths).not.toContain(".env");
    expect(first.paths).not.toContain(".env.local");
    expect(first.paths).not.toContain("secret.pem");
    expect(first.paths.some((p) => p.startsWith("node_modules/"))).toBe(false);
    expect(first.paths).not.toContain("src/link.ts");
    expect(first.paths).not.toContain("src/note.png");
    expect(first.remaining_tool_calls).toBe(99);
  });

  it("filters listing by a repository-relative prefix", async () => {
    const fixture = await setupFixture();
    const result = await list(fixture, "src");
    expect(result.paths.length).toBeGreaterThan(0);
    expect(result.paths.every((p) => p.startsWith("src/"))).toBe(true);
  });

  it("never returns more paths than the source-file budget permits", async () => {
    const fixture = await setupFixture();
    const result = await list(fixture, undefined, budget({ remaining_files: 1 }));
    expect(result.paths).toHaveLength(1);
  });

  it("spends the shared source-file budget across repeated listings", async () => {
    const fixture = await setupFixture();
    const sharedBudget = budget({ remaining_files: 2 });

    const first = await list(fixture, undefined, sharedBudget);
    const second = await list(fixture, undefined, sharedBudget);

    expect(first.paths).toHaveLength(2);
    expect(second.paths).toEqual([]);
  });

  it("exhausts the tool-call budget", async () => {
    const fixture = await setupFixture();
    await expect(list(fixture, undefined, budget({ remaining_tool_calls: 0 }))).rejects.toMatchObject({
      code: "SOURCE_TOOL_CALLS_EXHAUSTED"
    });
  });
});

describe("readProjectFiles", () => {
  it("reads a regular text file into a fragment with a digest", async () => {
    const fixture = await setupFixture();
    const result = await read(fixture, ["src/index.ts"]);

    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0]).toMatchObject({
      source_id: "src/index.ts",
      path: "src/index.ts",
      content: "export const index = 1;\n",
      heading: null,
      line_start: null,
      line_end: null
    });
    expect(result.fragments[0].file_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.remaining_tool_calls).toBe(99);
    expect(result.remaining_bytes).toBe(1024 * 1024 - result.fragments[0].content.length);
  });

  it("rejects traversal", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["../secret.txt"])).rejects.toMatchObject({ code: "SOURCE_PATH_REJECTED" });
  });

  it("rejects absolute paths", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, [join(fixture.repository, "src", "index.ts")])).rejects.toMatchObject({
      code: "SOURCE_PATH_REJECTED"
    });
  });

  it("rejects excluded environment files", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, [".env"])).rejects.toMatchObject({ code: "SOURCE_PATH_EXCLUDED" });
    await expect(read(fixture, [".env.local"])).rejects.toMatchObject({ code: "SOURCE_PATH_EXCLUDED" });
    await expect(read(fixture, ["secret.pem"])).rejects.toMatchObject({ code: "SOURCE_PATH_EXCLUDED" });
  });

  it("rejects excluded directories", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["node_modules/pkg/index.js"])).rejects.toMatchObject({
      code: "SOURCE_PATH_EXCLUDED"
    });
  });

  it("rejects every symlink", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["src/link.ts"])).rejects.toMatchObject({ code: "SOURCE_SYMLINK_REJECTED" });
  });

  it("rejects a non-regular path (directory)", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["src"])).rejects.toMatchObject({ code: "SOURCE_FILE_NOT_REGULAR" });
  });

  it("rejects binary (NUL) content even with a text extension", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["src/binary.ts"])).rejects.toMatchObject({ code: "SOURCE_FILE_BINARY" });
  });

  it("rejects an oversized file", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["src/oversize.ts"])).rejects.toMatchObject({ code: "SOURCE_FILE_TOO_LARGE" });
  });

  it("rejects a disallowed extension", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["src/note.png"])).rejects.toMatchObject({ code: "SOURCE_EXTENSION_REJECTED" });
  });

  it("rejects a missing file", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["src/missing.ts"])).rejects.toMatchObject({ code: "SOURCE_FILE_NOT_FOUND" });
  });

  it("rejects when the requested file count exceeds the budget", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["src/index.ts", "src/util.ts"], budget({ remaining_files: 1 }))).rejects.toMatchObject({
      code: "SOURCE_FILES_EXCEEDED"
    });
  });

  it("rejects when total bytes exceed the budget", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["src/index.ts"], budget({ remaining_bytes: 2 }))).rejects.toMatchObject({
      code: "SOURCE_BYTES_EXCEEDED"
    });
  });

  it("exhausts the tool-call budget", async () => {
    const fixture = await setupFixture();
    await expect(read(fixture, ["src/index.ts"], budget({ remaining_tool_calls: 0 }))).rejects.toMatchObject({
      code: "SOURCE_TOOL_CALLS_EXHAUSTED"
    });
  });

  it("fails closed when the registered workspace disappears", async () => {
    const fixture = await setupFixture();
    await rm(fixture.repository, { recursive: true, force: true });
    await expect(read(fixture, ["src/index.ts"])).rejects.toMatchObject({ code: "SOURCE_WORKSPACE_UNAVAILABLE" });
  });

  it("rejects a symlink escape introduced after the gate was created", async () => {
    const fixture = await setupFixture();
    const gate = createSourceGate({
      projectSlug: "code-project",
      questionDigest: "q".repeat(64),
      manifestDigest: "m".repeat(64),
      mode: "standard"
    });

    await rm(join(fixture.repository, "src", "escape.ts"));
    await symlink(join(fixture.tempHome, "outside-secret.txt"), join(fixture.repository, "src", "escape.ts"));

    const b = sourceBudgetFromGate(gate);
    await expect(read(fixture, ["src/escape.ts"], b)).rejects.toMatchObject({ code: "SOURCE_SYMLINK_REJECTED" });
  });

  it("bounds tool calls across a shared read-tools session", async () => {
    const fixture = await setupFixture();
    const gate = createSourceGate({
      projectSlug: "code-project",
      questionDigest: "q".repeat(64),
      manifestDigest: "m".repeat(64),
      mode: "standard"
    });
    const tools = createAssistantReadTools({ project: fixture.project, gate, root: fixture.tempHome });

    await tools.list_project_files!({ prefix: "src" });
    await tools.list_project_files!({});
    await tools.list_project_files!({ prefix: "docs" });
    await tools.list_project_files!({ prefix: "src/deep" });

    await expect(tools.list_project_files!({})).rejects.toMatchObject({
      code: "SOURCE_TOOL_CALLS_EXHAUSTED"
    });
  });
});
