import Link from "next/link";
import { notFound } from "next/navigation";
import { reviewRequestIdSchema } from "@/lib/caphub/registry/schemas";
import { getCaphubReviewDetail } from "@/lib/caphub/registry/review-workbench";
import { readWorkbench } from "@/lib/caphub/registry/read-workbench";
import { ReviewDossier } from "@/components/caphub/reviews/review-dossier";
import { DecisionForm } from "@/components/caphub/reviews/decision-form";
export const dynamic="force-dynamic";
export default async function ReviewPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;if(!reviewRequestIdSchema.safeParse(id).success)notFound();
  const view=await readWorkbench(pool=>getCaphubReviewDetail(pool,id));
  if(view.state!=="ready")return <p role="alert" data-caphub-ready="unavailable">Review is temporarily unavailable. Refresh to retry.</p>;
  if(view.data.kind!=="found")notFound();
  const detail=view.data;
  return <article className="caphub-review-page caphub-review-detail" data-caphub-ready="detail" data-registry-ms={detail.registryMs}>
    <Link href="/caphub/reviews">All files</Link><h1>{detail.filename}</h1>
    <p>{detail.request.state.replaceAll("_"," ")} · Recommended: <strong>{detail.packet.recommendedDisposition??"Review"}</strong></p>
    <p>{detail.candidate.name}{detail.candidate.novelCapabilities[0]?` — ${detail.candidate.novelCapabilities[0]}`:""}</p>
    <section><h2>Claims and sources</h2><ul>{detail.packet.claims.map(claim=><li key={claim.id}>{claim.statement}</li>)}</ul>
      <ul>{detail.packet.evidence.map(item=><li key={item.id}><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.title}</a></li>)}</ul>
    </section>
    {(detail.packet.conflicts.length>0||detail.packet.unresolvedQuestions.length>0)&&<section><h2>Unresolved</h2>
      {detail.packet.conflicts.map((item,index)=><p key={index}>{item.summary}</p>)}<ul>{detail.packet.unresolvedQuestions.map((text,index)=><li key={index}>{text}</li>)}</ul></section>}
    {!!detail.packet.critic?.unresolvedQuestions.length&&<section><h2>Critic findings</h2><ul>{detail.packet.critic.unresolvedQuestions.map((text,index)=><li key={index}>{text}</li>)}</ul></section>}
    <DecisionForm detail={detail}/>
    {detail.purgedAt?<p>Raw image expired. Parsed information is retained.</p>:detail.eligibleAt?<p>Original image retained until {detail.eligibleAt.slice(0,10)}.</p>:null}
    <details><summary>Technical details</summary><p>Review <code>{detail.request.id}</code></p><ReviewDossier detail={detail}/></details>
    <details><summary>History ({detail.history.length})</summary><ul>{detail.history.map(job=><li key={job.id}>
      <Link href={job.request_id?`/caphub/reviews/${job.request_id}`:`/caphub/captures/${job.capture_id}`}>{job.contract??"Legacy analysis"} · {job.status.replaceAll("_"," ")}</Link><small> {job.created_at.slice(0,10)} · {job.id}</small>
    </li>)}</ul></details>
  </article>;
}
