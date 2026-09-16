import { loadControlHostConfig } from "@/lib/planning/config";
import { CapabilityRegistryDetail } from "@/components/caphub/reviews/registry-detail";
import { CapabilityExportPanel } from "@/components/caphub/exports/capability-export";
import { createRegistryQueries, type CapabilityDetailDto, type CapabilityExportDto } from "@/lib/caphub/registry/queries";
import { registryRecordIdSchema } from "@/lib/caphub/registry/schemas";
import { loadControlHostRegistryRuntime } from "@/lib/caphub/registry/runtime";
import { ExportRuntime } from "@/lib/caphub/exports/runtime";

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
      readPointer: async () => null,
      projectionSummary: async () => ({ state: "unavailable", conflicts: [] })
    });
  } catch {}
  if (!view) return <section className="registry-state" role="alert"><h1>Capability Registry is unavailable.</h1><p>Safe error <code>REGISTRY_UNAVAILABLE</code>.</p></section>;
  return <>
    <CapabilityRegistryDetail view={view} />
    <div className="registry-detail-page"><div className="registry-detail-grid"><main><CapabilityExportPanel view={exportView} /></main></div></div>
  </>;
}
