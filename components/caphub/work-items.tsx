import Link from "next/link";
import type { CaphubWorkItems } from "@/lib/caphub/registry/work-items";
const labels:Record<string,string>={received:"Saved",queued:"Queued",running:"Analyzing",waiting_for_review:"Waiting for review",needs_attention:"Needs attention",completed:"Complete",filename_conflict:"Filename conflict"};
export function WorkItems({data,query=""}:{data:CaphubWorkItems;query?:string}) {
  const next=new URLSearchParams(query);if(data.nextCursor)next.set("cursor",data.nextCursor);
  return <section className="caphub-items" data-caphub-ready="queue" data-registry-ms={data.registryMs} aria-label="Current files">
    <p>{data.total} {data.total===1?"file":"files"} · {data.counts.waiting_for_review??0} waiting for review</p>
    {!data.items.length?<p>No files match this view. <Link href="/caphub">Upload an image</Link></p>:<ul>{data.items.map(item=><li key={item.filenameKey}>
      <div className="caphub-item-name"><strong>{item.filename}</strong><small>Version {item.version||"unresolved"} · {item.state==="waiting_for_review"?`Waiting ${item.waitingSeconds<3600?`${Math.floor(item.waitingSeconds/60)}m`:item.waitingSeconds<86400?`${Math.floor(item.waitingSeconds/3600)}h`:`${Math.floor(item.waitingSeconds/86400)}d`}`:item.createdAt.slice(0,10)}</small></div>
      <div><span>{labels[item.state]??"Needs attention"}</span><small>{item.recommendation??"—"} · Value {item.valueScore??"—"}/5 · Risk {item.riskScore??"—"}/5</small></div>
      <Link className="caphub-quiet-button" href={item.href}>{item.reviewRequestId?"Review":"Inspect issue"}</Link>
    </li>)}</ul>}
    {data.nextCursor&&<Link className="caphub-next" href={`/caphub/reviews?${next}`}>Next files</Link>}
  </section>;
}
