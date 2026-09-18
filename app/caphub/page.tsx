import { CaptureForm } from "@/components/caphub/capture-form";
import { loadControlHostConfig } from "@/lib/planning/config";
import Link from "next/link";
import { WorkItems } from "@/components/caphub/work-items";
import type { CaphubWorkItems } from "@/lib/caphub/registry/work-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CaphubPage() {
  let enabled = false;
  let registryEnabled = false;
  let maxUploadBytes = 10_485_760;
  let work:CaphubWorkItems|null=null;
  try {
    const caphub = loadControlHostConfig().config.caphub;
    enabled = caphub?.enabled === true;
    registryEnabled = caphub?.registry.enabled === true;
    maxUploadBytes = caphub?.maxUploadBytes ?? maxUploadBytes;
  } catch {
    // Configuration details and host paths never cross the server boundary.
  }
  if(enabled&&registryEnabled){
    const {readWorkbench}=await import("@/lib/caphub/registry/read-workbench");
    const {getCaphubWorkItems}=await import("@/lib/caphub/registry/work-items");
    const view=await readWorkbench(pool=>getCaphubWorkItems(pool,{limit:5}));
    if(view.state==="ready")work=view.data;
  }

  return (
    <div className="caphub-page">
      <section className="caphub-intro" aria-labelledby="caphub-title">
        <div>
          <h1 id="caphub-title">Capture a capability.</h1>
          <p>Upload a screenshot, follow its analysis, and review the results.</p>
        </div>
        <Link className="caphub-quiet-button" href="/caphub/reviews">Review current files</Link>
      </section>
      <CaptureForm enabled={enabled} maxUploadBytes={maxUploadBytes} />
      {work&&<section className="caphub-current-work"><h2>Current files</h2><WorkItems data={work}/></section>}
    </div>
  );
}
