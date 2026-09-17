import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CapabilityPackage } from "../lib/caphub/packages/types";
import { testCapabilityPackage } from "../lib/caphub/packages/fixtures";
import type { RegistryVersion } from "../lib/caphub/registry/types";
import { ExportRuntime, ExportRuntimeError } from "../lib/caphub/exports/runtime";
import { controlHostConfigSchema } from "../lib/planning/config";
import { caphubExportMain } from "./caphub-export";
import { caphubProjectMain } from "./caphub-project";
import { caphubPublishMain } from "./caphub-publish";

const RELEASE: RegistryVersion = {
  record_id: `rel_${"1".repeat(32)}`,
  kind: "release",
  version: 1,
  schema_version: 1,
  payload: testCapabilityPackage({ dependencies: [] }),
  payload_digest: "a".repeat(64),
  previous_version: null,
  created_at: "2026-09-16T09:00:00.000Z"
};

let codexRoot = "";
let obsidianRoot = "";
const tempDirs: string[] = [];

beforeAll(async () => {
  codexRoot = await realpath(await mkdtemp(join(tmpdir(), "caphub-cli-codex-")));
  obsidianRoot = await realpath(await mkdtemp(join(tmpdir(), "caphub-cli-obsidian-")));
  tempDirs.push(codexRoot, obsidianRoot);
});

afterAll(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

function io() {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    io: {
      log: (message: string) => lines.push(message),
      error: (message: string) => errors.push(message)
    }
  };
}

function runtimeFor(enabled: boolean): ExportRuntime {
  const parsed = controlHostConfigSchema.safeParse({
    trustedCodeRoots: ["/workspace"],
    caphub: {
      enabled,
      registry: { enabled },
      exports: {
        enabled,
        obsidian: { enabled, root: obsidianRoot, alias: "obsidian-fixture" },
        targets: {
          codex: { enabled, root: codexRoot, alias: "codex-fixture" },
          claude: { enabled: false },
          hermes: { enabled: false }
        }
      }
    }
  });
  if (!parsed.success) throw new Error("fixture config invalid");
  return new ExportRuntime(parsed.data);
}

describe("caphub CLI entrypoints", () => {
  it("project requires --dry-run, gates on the runtime, and prints only relative paths and digests", async () => {
    const disabled = io();
    const code = await caphubProjectMain(["--dry-run", "--release", RELEASE.record_id], {
      loadRuntime: () => runtimeFor(false),
      loadReleaseSnapshot: async () => RELEASE,
      planProjection: async () => {
        throw new Error("must not plan while disabled");
      }
    }, disabled.io);
    expect(code).toBe(1);
    expect(disabled.errors.join(" ")).toContain("P4_EXPORT_DISABLED");

    const noDryRun = io();
    expect(await caphubProjectMain(["--release", RELEASE.record_id], {
      loadRuntime: () => runtimeFor(true),
      loadReleaseSnapshot: async () => RELEASE,
      planProjection: async () => {
        throw new Error("must not plan without dry-run");
      }
    }, noDryRun.io)).toBe(1);
    expect(noDryRun.errors.join(" ")).toContain("--dry-run");

    const { lines, io: okIo } = io();
    const code2 = await caphubProjectMain(["--dry-run", "--release", RELEASE.record_id], {
      loadRuntime: () => runtimeFor(true),
      loadReleaseSnapshot: async () => RELEASE,
      planProjection: async () => ({
        entries: [{
          schema_version: 1,
          record_id: RELEASE.record_id,
          record_version: 1,
          record_digest: RELEASE.payload_digest,
          relative_path: "Caphub/20 Capabilities/tool.md",
          managed_digest: "b".repeat(64),
          preimage_digest: null,
          postimage_digest: "c".repeat(64),
          action: "create",
          conflict_reason: null
        }],
        preimage_digest: "d".repeat(64),
        postimage_digest: "e".repeat(64),
        diff: "create Caphub/20 Capabilities/tool.md\n",
        truncated: false
      })
    }, okIo);
    expect(code2).toBe(0);
    const report = JSON.parse(lines[0] ?? "{}");
    expect(report.entries[0].path).toBe("Caphub/20 Capabilities/tool.md");
    expect(JSON.stringify(report)).not.toMatch(/\/Users\/|\/private\/tmp/);
  });

  it("export previews are read-only and bounded", async () => {
    const { lines, io: previewIo } = io();
    const code = await caphubExportMain(["--dry-run", "--target", "codex", "--release", RELEASE.record_id], {
      loadRuntime: () => runtimeFor(true),
      loadReleaseSnapshot: async () => RELEASE,
      previewExport: async () => ({
        manifestDigest: "f".repeat(64),
        fileCount: 1,
        diff: "create $CODEX_HOME/skills/pdf-table-extract/SKILL.md\n",
        truncated: false,
        diagnostics: ["no resources inlined"]
      })
    }, previewIo);
    expect(code).toBe(0);
    const report = JSON.parse(lines[0] ?? "{}");
    expect(report.preview_manifest_digest).toBe("f".repeat(64));
    expect(report.file_count).toBe(1);

    const withRoot = io();
    expect(await caphubExportMain(["--dry-run", "--target", "codex", "--release", RELEASE.record_id, "--root", "/tmp/evil"], {
      loadRuntime: () => runtimeFor(true),
      loadReleaseSnapshot: async () => RELEASE,
      previewExport: async () => {
        throw new Error("must not run with a root argument");
      }
    }, withRoot.io)).toBe(1);
    expect(withRoot.errors.join(" ")).toContain("--root");
  });

  it("publish requires an exact plan id, confirmation, and enabled gates", async () => {
    const calls: Array<{ planId: string; confirmation: string }> = [];
    const deps = {
      loadRuntime: () => runtimeFor(true),
      publishPlan: async (input: { planId: string; confirmation: string }) => {
        calls.push(input);
        return { pointer: { deployment_id: `dep_${"2".repeat(32)}` } };
      }
    };

    const missing = io();
    expect(await caphubPublishMain(["--plan", "not-a-plan"], deps, missing.io)).toBe(1);

    const noConfirm = io();
    expect(await caphubPublishMain(["--plan", `dpl_${"3".repeat(32)}`], deps, noConfirm.io)).toBe(1);

    const disabled = io();
    expect(await caphubPublishMain(["--plan", `dpl_${"3".repeat(32)}`, "--confirm", "APPROVE DEPLOYMENT 33333333"], {
      ...deps,
      loadRuntime: () => runtimeFor(false)
    }, disabled.io)).toBe(1);
    expect(disabled.errors.join(" ")).toContain("P4_EXPORT_DISABLED");
    expect(calls).toHaveLength(0);

    const { io: okIo } = io();
    expect(await caphubPublishMain(["--plan", `dpl_${"3".repeat(32)}`, "--confirm", "APPROVE DEPLOYMENT 33333333"], deps, okIo)).toBe(0);
    expect(calls).toEqual([{ planId: `dpl_${"3".repeat(32)}`, confirmation: "APPROVE DEPLOYMENT 33333333" }]);
  });

  it("runtime errors expose only stable codes", () => {
    const error = new ExportRuntimeError("P4_EXPORT_DISABLED");
    const serialized = JSON.stringify(error);
    expect(serialized).toContain('"code":"P4_EXPORT_DISABLED"');
    expect(serialized).not.toContain("/private/tmp");
    expect(serialized).not.toContain("message");
  });
});

describe("readActiveAdapterFiles (acceptance fix 6)", () => {
  it("binds to the exact active manifest and ignores sibling manifests", async () => {
    const { readActiveAdapterFiles } = await import("./caphub-export");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join: joinPath } = await import("node:path");
    const root = await realpath(await mkdtemp(join(tmpdir(), "caphub-cli-active-")));
    tempDirs.push(root);
    const releaseId = `rel_${"ab".repeat(16)}`;
    const pointerBase = {
      deployment_id: `dep_${"cd".repeat(16)}`,
      release_id: releaseId,
      release_version: 1,
      release_digest: "e".repeat(64)
    };
    const pointer = {
      ...pointerBase,
      pointer_digest: "f".repeat(64)
    };
    const manifestA = "a1".repeat(32);
    const manifestB = "b2".repeat(32);
    for (const [manifest, body] of [[manifestA, "# inactive manifest A\n"], [manifestB, "# active manifest B\n"]] as const) {
      const dir = joinPath(root, "versions", releaseId, "1", manifest);
      await mkdir(joinPath(dir, "$CODEX_HOME", "skills", "tool"), { recursive: true });
      await writeFile(joinPath(dir, ".caphub-version.json"), JSON.stringify({
        schema_version: 1, action: "publish", release: { record_id: releaseId, version: 1, digest: "e".repeat(64) },
        manifest_digest: manifest,
        files: [{ path: "$CODEX_HOME/skills/tool/SKILL.md", sha256: "0".repeat(64), bytes: body.length }]
      }));
      await writeFile(joinPath(dir, "$CODEX_HOME", "skills", "tool", "SKILL.md"), body);
    }
    await mkdir(joinPath(root, "operations"), { recursive: true });
    await writeFile(joinPath(root, "operations", `${pointerBase.deployment_id}.json`), JSON.stringify({
      schema_version: 1, deployment_id: pointerBase.deployment_id, plan_digest: "1".repeat(64),
      action: "publish", stage: "completed",
      release: { record_id: releaseId, version: 1, digest: "e".repeat(64) },
      manifest_digest: manifestB, created_at: "2026-09-16T09:00:00.000Z"
    }));
    await writeFile(joinPath(root, "current.json"), JSON.stringify(pointer));

    const files = await readActiveAdapterFiles(root);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("$CODEX_HOME/skills/tool/SKILL.md");
    expect(files[0]?.content).toBe("# active manifest B\n");
  });
});
