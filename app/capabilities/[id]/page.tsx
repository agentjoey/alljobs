import { loadControlHostConfig } from "@/lib/planning/config";
import { CapabilityRegistryDetail } from "@/components/caphub/reviews/registry-detail";
import { CapabilityExportPanel } from "@/components/caphub/exports/capability-export";
import { createRegistryQueries, type CapabilityDetailDto, type CapabilityExportDto } from "@/lib/caphub/registry/queries";
import { registryRecordIdSchema } from "@/lib/caphub/registry/schemas";
import { loadControlHostRegistryRuntime } from "@/lib/caphub/registry/runtime";
import { ExportRuntime } from "@/lib/caphub/exports/runtime";
import { validateTargetRoot } from "@/lib/caphub/projection/paths";
import { readTargetPointer } from "@/lib/caphub/deployments/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CapabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!registryRecordIdSchema.safeParse(id).success || !id.startsWith("cand_")) {
    return <CapabilityRegistryDetail view={{ kind: "not_found" }} />;
  }
  let view: CapabilityDetailDto | null = null;
  let exportView: CapabilityExportDto = { kind: "disabled" };
  try {
    const resolved = loadControlHostConfig();
    const runtime = await loadControlHostRegistryRuntime({ resolved });
    const queries = createRegistryQueries(runtime.pool);
    view = await queries.getCapabilityDetail(id);
    const exportRuntime = new ExportRuntime(resolved.config);
    const exportsEnabled = (() => {
      try {
        exportRuntime.assertEnabled();
        return true;
      } catch {
        return false;
      }
    })();
    exportView = await queries.getCapabilityExportState(id, {
      exportsEnabled,
      readPointer: async (targetAlias) => {
        try {
          const target = (["obsidian", "codex", "claude", "hermes"] as const)
            .find((name) => exportRuntime.publicView().targets[name].alias === targetAlias);
          if (!target) return null;
          const root = await validateTargetRoot({
            root: exportRuntime.resolveTargetRoot(target),
            alias: targetAlias
          });
          return readTargetPointer(root);
        } catch {
          return null;
        }
      },
      projectionSummary: async () => {
        try {
          const targetView = exportRuntime.publicView();
          if (!targetView.targets.obsidian.enabled || !targetView.targets.obsidian.alias) {
            return { state: "unavailable", conflicts: [] };
          }
          const current = await queries.getCapabilityExportState(id, { exportsEnabled: true });
          if (current.kind !== "ready") return { state: "unavailable", conflicts: [] };
          const { capabilityPackageSchema } = await import("@/lib/caphub/packages/schemas");
          const releaseRow = await runtime.pool.query<{ payload: unknown }>(
            "SELECT payload FROM caphub.registry_versions WHERE record_id = $1 AND version = $2",
            [current.release.recordId, current.release.version]
          );
          if (!releaseRow.rows[0]) return { state: "unavailable", conflicts: [] };
          const pkg = capabilityPackageSchema.parse(releaseRow.rows[0].payload);
          const root = await validateTargetRoot({
            root: exportRuntime.resolveTargetRoot("obsidian"),
            alias: targetView.targets.obsidian.alias
          });
          const { planProjection, projectionMarkdownForPackage } = await import("@/lib/caphub/projection/planner");
          const plan = await planProjection({
            root,
            documents: [{
              record_id: current.release.recordId,
              record_version: current.release.version,
              record_digest: current.release.digest,
              relative_path: `Caphub/20 Capabilities/${current.release.slug}.md`,
              managed_markdown: projectionMarkdownForPackage(pkg)
            }]
          });
          const conflicts = plan.entries
            .filter((entry) => entry.action === "conflict")
            .map((entry) => ({ path: entry.relative_path, reason: entry.conflict_reason ?? "conflict" }));
          return { state: conflicts.length > 0 ? "conflict" : "planned", conflicts };
        } catch {
          return { state: "unavailable", conflicts: [] };
        }
      }
    });
  } catch {}
  if (!view) return <section className="registry-state" role="alert"><h1>Capability Registry is unavailable.</h1><p>Safe error <code>REGISTRY_UNAVAILABLE</code>.</p></section>;
  return <>
    <CapabilityRegistryDetail view={view} />
    <div className="registry-detail-page"><div className="registry-detail-grid"><main><CapabilityExportPanel view={exportView} /></main></div></div>
  </>;
}
