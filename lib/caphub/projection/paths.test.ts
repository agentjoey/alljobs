import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectionPathError, resolveSafeDescendant, validateTargetRoot, writeTargetSentinel } from "./paths";

const ALIAS = "obsidian-fixture";

let created: string[] = [];

async function freshRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "caphub-projection-")));
  created.push(root);
  return root;
}

afterEach(async () => {
  for (const root of created) {
    await rm(root, { recursive: true, force: true });
  }
  created = [];
});

describe("validateTargetRoot", () => {
  it("accepts an owned sentinel-bound temporary root", async () => {
    const root = await freshRoot();
    await writeTargetSentinel(root, ALIAS);
    const validated = await validateTargetRoot({ root, alias: ALIAS });
    expect(validated.root).toBe(root);
    expect(validated.alias).toBe(ALIAS);
  });

  it("rejects relative, broad, home, and workspace roots", async () => {
    for (const root of ["relative/path", "/", homedir(), process.cwd(), "~/vault", "$HOME/vault", "/tmp/glob*vault", "a\\b"]) {
      await expect(validateTargetRoot({ root, alias: ALIAS }), root).rejects.toThrow(ProjectionPathError);
    }
  });

  it("rejects missing directories and symlink roots", async () => {
    await expect(validateTargetRoot({ root: "/definitely/missing/caphub-root", alias: ALIAS }))
      .rejects.toThrow(ProjectionPathError);

    const real = await freshRoot();
    const linkRoot = join(await freshRoot(), "link");
    await symlink(real, linkRoot);
    await writeTargetSentinel(real, ALIAS);
    await expect(validateTargetRoot({ root: linkRoot, alias: ALIAS })).rejects.toThrow(ProjectionPathError);
  });

  it("rejects missing, foreign, or alias-mismatched sentinel files", async () => {
    const root = await freshRoot();
    await expect(validateTargetRoot({ root, alias: ALIAS })).rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });

    await writeTargetSentinel(root, "other-alias");
    await expect(validateTargetRoot({ root, alias: ALIAS })).rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });

    await rm(join(root, ".caphub-target.json"));
    await writeFile(join(root, ".caphub-target.json"), '{"schema_version":1,"caphub":false,"alias":"obsidian-fixture"}\n');
    await expect(validateTargetRoot({ root, alias: ALIAS })).rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });
  });

  it("rejects a sentinel nested under another managed root", async () => {
    const root = await freshRoot();
    await writeTargetSentinel(root, ALIAS);
    const deep = join(root, "sub", "dir");
    await mkdir(deep, { recursive: true });
    await writeTargetSentinel(deep, ALIAS);
    await expect(validateTargetRoot({ root: deep, alias: ALIAS })).rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });
  });
});

describe("resolveSafeDescendant", () => {
  it("resolves safe relative paths under the root", async () => {
    const root = await freshRoot();
    await writeTargetSentinel(root, ALIAS);
    const validated = await validateTargetRoot({ root, alias: ALIAS });
    const resolved = await resolveSafeDescendant(validated, "Caphub/20 Capabilities/tool.md");
    expect(resolved).toBe(join(root, "Caphub/20 Capabilities/tool.md"));
  });

  it("rejects traversal, absolute paths, and separator tricks", async () => {
    const root = await freshRoot();
    await writeTargetSentinel(root, ALIAS);
    const validated = await validateTargetRoot({ root, alias: ALIAS });
    for (const relative of ["../escape.md", "a/../../escape.md", "/abs/escape.md", "a\\b.md", "..", "a//b/../../c", ""]) {
      await expect(resolveSafeDescendant(validated, relative), relative).rejects.toThrow(ProjectionPathError);
    }
  });

  it("rejects descendant symlink escapes", async () => {
    const root = await freshRoot();
    await writeTargetSentinel(root, ALIAS);
    const validated = await validateTargetRoot({ root, alias: ALIAS });
    const outside = await freshRoot();
    await mkdir(join(root, "Caphub"), { recursive: true });
    await symlink(outside, join(root, "Caphub", "link"));
    await expect(resolveSafeDescendant(validated, "Caphub/link/escape.md")).rejects.toMatchObject({
      code: "UNSAFE_TARGET_ROOT"
    });
  });
});
