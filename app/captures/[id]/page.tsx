import { loadControlHostConfig } from "@/lib/planning/config";
import { CaptureRegistryDetail } from "@/components/caphub/reviews/registry-detail";
import { createRegistryQueries } from "@/lib/caphub/registry/queries";
import { captureIdSchema } from "@/lib/caphub/domain/schemas";
import { loadControlHostRegistryRuntime } from "@/lib/caphub/registry/runtime";
import type { CaptureDetailDto } from "@/lib/caphub/registry/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!captureIdSchema.safeParse(id).success) return <CaptureRegistryDetail view={{ kind: "not_found" }} />;
  let view: CaptureDetailDto | null = null;
  try {
    const resolved = loadControlHostConfig();
    const runtime = await loadControlHostRegistryRuntime({ resolved });
    view = await createRegistryQueries(runtime.pool).getCaptureDetail(id);
  } catch {}
  if (!view) return <section className="registry-state" role="alert"><h1>Capture Registry is unavailable.</h1><p>Safe error <code>REGISTRY_UNAVAILABLE</code>.</p></section>;
  return <CaptureRegistryDetail view={view} />;
}
