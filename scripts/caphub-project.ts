import type { CapabilityPackage } from "../lib/caphub/packages/types";
import type { RegistryVersion } from "../lib/caphub/registry/types";
import type { ExportRuntime } from "../lib/caphub/exports/runtime";
import type { ProjectionPlan } from "../lib/caphub/projection/planner";
import { pathToFileURL } from "node:url";
import { consoleIo, parseFlags, rejectForbiddenArgs, reportError, requireDryRun, type CliIo } from "./caphub-cli";

export interface ProjectCliDeps {
  loadRuntime(): ExportRuntime;
  loadReleaseSnapshot(recordId: string): Promise<RegistryVersion | null>;
  planProjection(input: {
    release: RegistryVersion;
    pkg: CapabilityPackage;
  }): Promise<ProjectionPlan>;
}

export async function caphubProjectMain(
  argv: string[],
  deps: ProjectCliDeps,
  io: CliIo = consoleIo
): Promise<number> {
  try {
    const flags = parseFlags(argv);
    requireDryRun(flags);
    rejectForbiddenArgs(flags, ["root", "path", "vault", "target-root"]);
    const releaseId = flags.get("release");
    if (typeof releaseId !== "string" || releaseId.length === 0) {
      throw new Error("missing --release <record-id>");
    }

    const runtime = deps.loadRuntime();
    runtime.assertEnabled("obsidian");
    const release = await deps.loadReleaseSnapshot(releaseId);
    if (!release) {
      throw new Error(`release ${releaseId} not found`);
    }
    const pkg = release.payload as CapabilityPackage;
    const plan = await deps.planProjection({ release, pkg });
    io.log(JSON.stringify({
      schema_version: 1,
      release: { record_id: release.record_id, version: release.version, digest: release.payload_digest },
      counts: {
        create: plan.entries.filter((entry) => entry.action === "create").length,
        update: plan.entries.filter((entry) => entry.action === "update").length,
        conflict: plan.entries.filter((entry) => entry.action === "conflict").length,
        orphan: plan.entries.filter((entry) => entry.action === "orphan").length
      },
      preimage_digest: plan.preimage_digest,
      postimage_digest: plan.postimage_digest,
      diff: plan.diff,
      truncated: plan.truncated,
      entries: plan.entries.map((entry) => ({
        path: entry.relative_path,
        action: entry.action,
        managed_digest: entry.managed_digest,
        postimage_digest: entry.postimage_digest
      }))
    }, null, 2));
    return 0;
  } catch (error) {
    return reportError(io, error);
  }
}

async function loadProjectDeps(): Promise<ProjectCliDeps> {
  const { loadControlHostExportContext } = await import("./caphub-cli");
  const { validateTargetRoot } = await import("../lib/caphub/projection/paths");
  const { planProjection, projectionMarkdownForPackage } = await import("../lib/caphub/projection/planner");
  const context = await loadControlHostExportContext();
  return {
    loadRuntime: () => context.runtime,
    loadReleaseSnapshot: context.releaseSnapshot,
    planProjection: async ({ release, pkg }) => {
      const root = await validateTargetRoot({
        root: context.runtime.resolveTargetRoot("obsidian"),
        alias: context.runtime.publicView().targets.obsidian.alias ?? "obsidian"
      });
      return planProjection({
        root,
        documents: [{
          record_id: release.record_id,
          record_version: release.version,
          record_digest: release.payload_digest,
          relative_path: `Caphub/20 Capabilities/${pkg.slug}.md`,
          managed_markdown: projectionMarkdownForPackage(pkg)
        }]
      });
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  caphubProjectMain(process.argv.slice(2), await loadProjectDeps()).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Caphub projection failed"}\n`);
    process.exitCode = 1;
  });
}
