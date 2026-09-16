import { loadControlHostConfig } from "@/lib/planning/config";
import { CapabilityRegistryDetail } from "@/components/caphub/reviews/registry-detail";
import { createRegistryQueries } from "@/lib/caphub/registry/queries";
import { registryRecordIdSchema } from "@/lib/caphub/registry/schemas";
import { loadControlHostRegistryRuntime } from "@/lib/caphub/registry/runtime";
import type { CapabilityDetailDto } from "@/lib/caphub/registry/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CapabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!registryRecordIdSchema.safeParse(id).success || !id.startsWith("cand_")) {
    return <CapabilityRegistryDetail view={{ kind: "not_found" }} />;
  }
  let view: CapabilityDetailDto | null = null;
  try {
    const resolved = loadControlHostConfig();
    const runtime = await loadControlHostRegistryRuntime({ resolved });
    view = await createRegistryQueries(runtime.pool).getCapabilityDetail(id);
  } catch {}
  if (!view) return <section className="registry-state" role="alert"><h1>Capability Registry is unavailable.</h1><p>Safe error <code>REGISTRY_UNAVAILABLE</code>.</p></section>;
  return <CapabilityRegistryDetail view={view} />;
}
