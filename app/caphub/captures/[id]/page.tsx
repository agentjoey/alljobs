import Link from "next/link";
import {notFound} from "next/navigation";
import {captureIdSchema} from "@/lib/caphub/domain/schemas";
import {readWorkbench} from "@/lib/caphub/registry/read-workbench";
import {getCaphubCaptureStatus,getCaptureHistory} from "@/lib/caphub/registry/review-workbench";
import {AnalysisStatus} from "@/components/caphub/analysis-status";
export const dynamic="force-dynamic";
export default async function CapturePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!captureIdSchema.safeParse(id).success)notFound();
  const view=await readWorkbench(async pool=>({status:await getCaphubCaptureStatus(pool,id),history:await getCaptureHistory(pool,id)}));
  if(view.state!=="ready")return <p role="alert">Capture is temporarily unavailable. Refresh to retry.</p>;
  if(!view.data.status)notFound();
  const {status,history}=view.data;
  return <article className="caphub-review-page" data-caphub-ready="capture"><Link href="/caphub/reviews">All files</Link><h1>{status.filename}</h1>
    <AnalysisStatus captureId={id} initial={status}/><details><summary>Technical details</summary><p>Capture <code>{id}</code></p><p>Stored {status.createdAt}</p><p>Job {status.jobId??"Not started"}</p></details>
    <details><summary>History ({history.length})</summary><ul>{history.map(job=><li key={job.id}>{job.contract??"Legacy analysis"} · {job.status}<small> {job.created_at.toISOString()} · {job.id}</small></li>)}</ul></details></article>;
}
