import type { CapabilityPackage } from "../lib/caphub/packages/types";
import type { RegistryVersion } from "../lib/caphub/registry/types";
import type { ExportRuntime, ExportTargetName } from "../lib/caphub/exports/runtime";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { consoleIo, parseFlags, rejectForbiddenArgs, reportError, requireDryRun, type CliIo } from "./caphub-cli";

/** Read only the exact active manifest directory named by the validated
 * pointer + operation binding. Paths are normalized relative to that manifest
 * directory so base and next files share adapter-relative paths. */
export async function readActiveAdapterFiles(rootDir: string): Promise<Array<{ path: string; content: string }>> {
  const { readActiveManifestDirectory } = await import("../lib/caphub/deployments/publisher");
  const { readdir } = await import("node:fs/promises");
  const { readFile: readFileAsync } = await import("node:fs/promises");
  const active = await readActiveManifestDirectory(rootDir);
  if (active === null) return [];
  const directory = active.directory;
  const files: Array<{ path: string; content: string }> = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("UNSAFE_TARGET_ROOT: active manifest contains a symlink");
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name !== ".caphub-version.json") {
        files.push({ path: full.slice(directory.length + 1), content: await readFileAsync(full, "utf8") });
      }
    }
  }
  await walk(directory);
  return files;
}

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

  return {
    loadRuntime: () => context.runtime,
    loadReleaseSnapshot: context.releaseSnapshot,
    previewExport: async ({ target, release: _release, pkg }) => {
      const rendered = adapters[target](pkg);
      if (!rendered.ok) {
        throw new Error(`${rendered.code}: ${rendered.diagnostics.join("; ")}`);
      }
      const rootDir = context.runtime.resolveTargetRoot(target);
      const snapshot = await readActiveAdapterFiles(rootDir);
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
