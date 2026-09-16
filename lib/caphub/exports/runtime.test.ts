import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { controlHostConfigSchema, type ControlHostConfig } from "../../planning/config";
import { ExportRuntime, ExportRuntimeError } from "./runtime";

let created: string[] = [];

async function freshDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "caphub-runtime-")));
  created.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of created) {
    await rm(dir, { recursive: true, force: true });
  }
  created = [];
});

function configWithExports(exportsConfig: Record<string, unknown>): ControlHostConfig {
  const parsed = controlHostConfigSchema.safeParse({
    trustedCodeRoots: ["/workspace"],
    caphub: {
      enabled: true,
      registry: { enabled: true },
      exports: exportsConfig
    }
  });
  if (!parsed.success) throw new Error("fixture config invalid");
  return parsed.data;
}

describe("ExportRuntime gating", () => {
  it("fails P4_EXPORT_DISABLED before any side effect when any layer is off", () => {
    const disabledCaphub = controlHostConfigSchema.parse({ trustedCodeRoots: ["/workspace"] });
    expect(() => new ExportRuntime(disabledCaphub).assertEnabled("codex"))
      .toThrowError(expect.objectContaining({ code: "P4_EXPORT_DISABLED" }));

    const noRegistry = controlHostConfigSchema.parse({
      trustedCodeRoots: ["/workspace"],
      caphub: { enabled: true, exports: { enabled: true, targets: { codex: { enabled: true, root: "/tmp/x", alias: "a" } } } }
    });
    expect(() => new ExportRuntime(noRegistry).assertEnabled("codex"))
      .toThrowError(expect.objectContaining({ code: "P4_EXPORT_DISABLED" }));

    const exportsOff = configWithExports({ enabled: false, targets: { codex: { enabled: true, root: "/tmp/x", alias: "a" } } });
    expect(() => new ExportRuntime(exportsOff).assertEnabled("codex"))
      .toThrowError(expect.objectContaining({ code: "P4_EXPORT_DISABLED" }));

    const targetOff = configWithExports({ enabled: true, targets: { codex: { enabled: false } } });
    expect(() => new ExportRuntime(targetOff).assertEnabled("codex"))
      .toThrowError(expect.objectContaining({ code: "P4_EXPORT_DISABLED" }));
  });

  it("resolves validated roots only for enabled targets and hides roots in the public view", async () => {
    const codexRoot = await freshDir();
    const obsidianRoot = await freshDir();
    const config = configWithExports({
      enabled: true,
      obsidian: { enabled: true, root: obsidianRoot, alias: "obsidian-primary" },
      targets: {
        codex: { enabled: true, root: codexRoot, alias: "codex-primary" },
        claude: { enabled: false },
        hermes: { enabled: false }
      }
    });
    const runtime = new ExportRuntime(config);
    expect(runtime.assertEnabled("codex")).toBeUndefined();
    expect(runtime.resolveTargetRoot("codex")).toBe(codexRoot);
    expect(runtime.resolveTargetRoot("obsidian")).toBe(obsidianRoot);

    const view = runtime.publicView();
    expect(JSON.stringify(view)).not.toContain(codexRoot);
    expect(JSON.stringify(view)).not.toContain(obsidianRoot);
    expect(view.targets.codex).toEqual({ enabled: true, alias: "codex-primary" });
    expect(view.targets.obsidian).toEqual({ enabled: true, alias: "obsidian-primary" });
  });

  it("rejects missing directories, symlink roots, duplicate aliases, and shared roots", async () => {
    const shared = await freshDir();
    const config = configWithExports({
      enabled: true,
      targets: {
        codex: { enabled: true, root: shared, alias: "same-alias" },
        claude: { enabled: true, root: shared, alias: "same-alias" },
        hermes: { enabled: false }
      }
    });
    const runtime = new ExportRuntime(config);
    expect(() => runtime.assertEnabled("codex")).toThrowError(expect.objectContaining({ code: "UNSAFE_TARGET_ROOT" }));

    const missing = join(await freshDir(), "missing");
    const missingConfig = configWithExports({
      enabled: true,
      targets: { codex: { enabled: true, root: missing, alias: "codex-x" }, claude: { enabled: false }, hermes: { enabled: false } }
    });
    expect(() => new ExportRuntime(missingConfig).assertEnabled("codex"))
      .toThrowError(expect.objectContaining({ code: "UNSAFE_TARGET_ROOT" }));

    const real = await freshDir();
    const linkDir = join(await freshDir(), "link");
    await symlink(real, linkDir);
    const linkConfig = configWithExports({
      enabled: true,
      targets: { codex: { enabled: true, root: linkDir, alias: "codex-y" }, claude: { enabled: false }, hermes: { enabled: false } }
    });
    expect(() => new ExportRuntime(linkConfig).assertEnabled("codex"))
      .toThrowError(expect.objectContaining({ code: "UNSAFE_TARGET_ROOT" }));
  });

  it("keeps serialized errors free of roots and internal detail", () => {
    const secretRoot = "/private/tmp/caphub-secret-root";
    const config = configWithExports({
      enabled: true,
      targets: { codex: { enabled: true, root: secretRoot, alias: "codex-secret" }, claude: { enabled: false }, hermes: { enabled: false } }
    });
    try {
      new ExportRuntime(config).assertEnabled("codex");
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ExportRuntimeError);
      const serialized = JSON.stringify(error as ExportRuntimeError);
      expect(serialized).not.toContain(secretRoot);
    }
  });
});
