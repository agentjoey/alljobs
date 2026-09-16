import type { CapabilityPackage } from "../lib/caphub/packages/types";
import type { RegistryVersion } from "../lib/caphub/registry/types";
import type { ExportRuntime, ExportTargetName } from "../lib/caphub/exports/runtime";
import { pathToFileURL } from "node:url";
import { consoleIo, parseFlags, rejectForbiddenArgs, reportError, requireDryRun, type CliIo } from "./caphub-cli";

export interface ExportCliDeps {
  loadRuntime(): ExportRuntime;
  loadReleaseSnapshot(recordId: string): Promise<RegistryVersion | null>;
  previewExport(input: {
    target: Exclude<ExportTargetName, "obsidian" | "packageRepository">;
    release: RegistryVersion;
    pkg: CapabilityPackage;
  }): Promise<{ manifestDigest: string; fileCount: number; diff: string; truncated: boolean; diagnostics: string[] }>;
}

export async function caphubExportMain(
  argv: string[],
  deps: ExportCliDeps,
  io: CliIo = consoleIo
): Promise<number> {
  try {
    const flags = parseFlags(argv);
    requireDryRun(flags);
    rejectForbiddenArgs(flags, ["root", "path", "target-root"]);
    const target = flags.get("target");
    if (target !== "codex" && target !== "claude" && target !== "hermes") {
      throw new Error("missing or unsupported --target (codex|claude|hermes)");
    }
    const releaseId = flags.get("release");
    if (typeof releaseId !== "string" || releaseId.length === 0) {
      throw new Error("missing --release <record-id>");
    }

    const runtime = deps.loadRuntime();
    runtime.assertEnabled(target);
    const release = await deps.loadReleaseSnapshot(releaseId);
    if (!release) {
      throw new Error(`release ${releaseId} not found`);
    }
    const pkg = release.payload as CapabilityPackage;
    const preview = await deps.previewExport({ target, release, pkg });
    io.log(JSON.stringify({
      schema_version: 1,
      target,
      release: { record_id: release.record_id, version: release.version, digest: release.payload_digest },
      preview_manifest_digest: preview.manifestDigest,
      file_count: preview.fileCount,
      diff: preview.diff,
      truncated: preview.truncated,
      diagnostics: preview.diagnostics
    }, null, 2));
    return 0;
  } catch (error) {
    return reportError(io, error);
  }
}

export interface PublishCliDeps {
  loadRuntime(): ExportRuntime;
  publishPlan(input: { planId: string; confirmation: string }): Promise<{ pointer: unknown }>;
}

export async function caphubPublishMain(
  argv: string[],
  deps: PublishCliDeps,
  io: CliIo = consoleIo
): Promise<number> {
  try {
    const flags = parseFlags(argv);
    rejectForbiddenArgs(flags, ["root", "path", "target-root", "dry-run"]);
    if (flags.get("dry-run") === true) {
      throw new Error("--dry-run is not a publish mode; refusing to pretend");
    }
    const planId = flags.get("plan");
    if (typeof planId !== "string" || !/^dpl_[a-f0-9]{32}$/.test(planId)) {
      throw new Error("missing or invalid --plan <dpl_record-id>");
    }
    const confirmation = flags.get("confirm");
    if (typeof confirmation !== "string" || confirmation.length === 0) {
      throw new Error("missing --confirm with the exact approved confirmation phrase");
    }

    const runtime = deps.loadRuntime();
    runtime.assertEnabled();
    const result = await deps.publishPlan({ planId, confirmation });
    io.log(JSON.stringify({ schema_version: 1, published: true, pointer: result.pointer }, null, 2));
    return 0;
  } catch (error) {
    return reportError(io, error);
  }
}

async function loadExportCliDeps(): Promise<ExportCliDeps> {
  const { loadControlHostExportContext } = await import("./caphub-cli");
  const { renderCodexPreview } = await import("../lib/caphub/adapters/codex");
  const { renderClaudePreview } = await import("../lib/caphub/adapters/claude");
  const { renderHermesPreview } = await import("../lib/caphub/adapters/hermes");
  const { diffPackageFiles } = await import("../lib/caphub/packages/diff");
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { createHash } = await import("node:crypto");
  const { readFile } = await import("node:fs/promises");
  const context = await loadControlHostExportContext();
  const adapters = { codex: renderCodexPreview, claude: renderClaudePreview, hermes: renderHermesPreview } as const;

  async function activeFiles(rootDir: string): Promise<Array<{ path: string; content: string }>> {
    let pointer: { release_id: string; release_version: number } | null = null;
    try {
      pointer = JSON.parse(await readFile(join(rootDir, "current.json"), "utf8"));
    } catch {
      pointer = null;
    }
    if (!pointer) return [];
    const files: Array<{ path: string; content: string }> = [];
    async function walk(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && entry.name !== ".caphub-version.json") {
          files.push({ path: full.slice(rootDir.length + 1), content: await readFile(full, "utf8") });
        }
      }
    }
    await walk(join(rootDir, "versions", pointer.release_id, String(pointer.release_version)));
    return files;
  }

  return {
    loadRuntime: () => context.runtime,
    loadReleaseSnapshot: context.releaseSnapshot,
    previewExport: async ({ target, release: _release, pkg }) => {
      const rendered = adapters[target](pkg);
      if (!rendered.ok) {
        throw new Error(`${rendered.code}: ${rendered.diagnostics.join("; ")}`);
      }
      const rootDir = context.runtime.resolveTargetRoot(target);
      const snapshot = await activeFiles(rootDir);
      const diff = diffPackageFiles({
        baseFiles: snapshot.map((file) => ({
          path: file.path,
          media_type: "text/markdown" as const,
          content: file.content,
          sha256: createHash("sha256").update(file.content, "utf8").digest("hex"),
          bytes: Buffer.byteLength(file.content, "utf8")
        })),
        nextFiles: rendered.result.files,
        redactRoots: [rootDir]
      });
      return {
        manifestDigest: rendered.result.output_manifest_digest,
        fileCount: rendered.result.files.length,
        diff: diff.entries.map((entry) => `${entry.action} ${entry.path}`).join("\n") + "\n",
        truncated: diff.truncated,
        diagnostics: rendered.result.diagnostics
      };
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  caphubExportMain(process.argv.slice(2), await loadExportCliDeps()).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Caphub export failed"}\n`);
    process.exitCode = 1;
  });
}
