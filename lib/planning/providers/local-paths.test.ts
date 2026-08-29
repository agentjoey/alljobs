import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ControlHostConfig } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import { resolveLocalPlanningPaths } from "./local-paths";

const project = (trustedPath: string, workModes: ProjectRegistryEntry["work_modes"] = ["implementation"]): ProjectRegistryEntry => ({
  slug: "code-project",
  name: "Code project",
  type: "code",
  work_modes: workModes,
  execution_locations: [],
  trusted_path: trustedPath,
  archived: false
});

describe("resolveLocalPlanningPaths", () => {
  let tempRoot: string;
  let trustedRoot: string;
  let config: ControlHostConfig;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "alljobs-local-paths-"));
    trustedRoot = join(tempRoot, "trusted");
    await mkdir(trustedRoot);
    config = { trustedCodeRoots: [trustedRoot], refreshIntervalSeconds: 300 };
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  async function workspace(name = "project") {
    const root = join(trustedRoot, name);
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "ROADMAP.md"), "# Roadmap\n", "utf8");
    await writeFile(join(root, "docs", "BACKLOG.md"), "# Backlog\n", "utf8");
    return root;
  }

  it("accepts a trusted direct child with regular planning files", async () => {
    const root = await workspace();
    const canonicalRoot = await realpath(root);

    await expect(resolveLocalPlanningPaths(project(root), config)).resolves.toMatchObject({
      ok: true,
      workspacePath: canonicalRoot,
      roadmapPath: join(canonicalRoot, "docs", "ROADMAP.md"),
      backlogPath: join(canonicalRoot, "docs", "BACKLOG.md")
    });
  });

  it("reports an absent workspace as the only fallback-eligible state", async () => {
    await expect(resolveLocalPlanningPaths(project(join(trustedRoot, "missing")), config)).resolves.toMatchObject({
      ok: false,
      state: "workspace-unavailable"
    });
  });

  it("rejects a workspace symlink that escapes its trusted root", async () => {
    const outside = join(tempRoot, "outside");
    await mkdir(join(outside, "docs"), { recursive: true });
    await writeFile(join(outside, "docs", "ROADMAP.md"), "# Roadmap\n");
    await writeFile(join(outside, "docs", "BACKLOG.md"), "# Backlog\n");
    const link = join(trustedRoot, "escape");
    await symlink(outside, link);

    await expect(resolveLocalPlanningPaths(project(link), config)).resolves.toMatchObject({
      ok: false,
      state: "unsafe",
      code: "UNTRUSTED_WORKSPACE"
    });
  });

  it("rejects a Backlog symlink even when it points inside the workspace", async () => {
    const root = await workspace();
    const target = join(root, "backlog-source.md");
    await writeFile(target, "# Backlog\n");
    await rm(join(root, "docs", "BACKLOG.md"));
    await symlink(target, join(root, "docs", "BACKLOG.md"));

    await expect(resolveLocalPlanningPaths(project(root), config)).resolves.toMatchObject({
      ok: false,
      state: "unsafe",
      code: "PLANNING_FILE_SYMLINK"
    });
  });

  it("rejects a docs directory symlink that would make regular files escape the workspace", async () => {
    const root = join(trustedRoot, "project");
    const outsideDocs = join(tempRoot, "outside-docs");
    await mkdir(outsideDocs, { recursive: true });
    await writeFile(join(outsideDocs, "ROADMAP.md"), "# Roadmap\n");
    await writeFile(join(outsideDocs, "BACKLOG.md"), "# Backlog\n");
    await mkdir(root, { recursive: true });
    await symlink(outsideDocs, join(root, "docs"));

    await expect(resolveLocalPlanningPaths(project(root), config)).resolves.toMatchObject({
      ok: false,
      state: "unsafe",
      code: "PLANNING_DIRECTORY_SYMLINK"
    });
  });

  it("rejects a directory in place of a required planning file", async () => {
    const root = await workspace();
    await rm(join(root, "docs", "BACKLOG.md"));
    await mkdir(join(root, "docs", "BACKLOG.md"));

    await expect(resolveLocalPlanningPaths(project(root), config)).resolves.toMatchObject({
      ok: false,
      state: "invalid-file",
      code: "PLANNING_FILE_NOT_REGULAR"
    });
  });

  it("rejects a planning file over 2 MiB", async () => {
    const root = await workspace();
    await writeFile(join(root, "docs", "BACKLOG.md"), Buffer.alloc(2 * 1024 * 1024 + 1));

    await expect(resolveLocalPlanningPaths(project(root), config)).resolves.toMatchObject({
      ok: false,
      state: "invalid-file",
      code: "PLANNING_FILE_TOO_LARGE"
    });
  });

  it("does not require a Roadmap for operations-only code projects", async () => {
    const root = await workspace();
    await rm(join(root, "docs", "ROADMAP.md"));

    await expect(resolveLocalPlanningPaths(project(root, ["operations"]), config)).resolves.toMatchObject({ ok: true });
  });
});
