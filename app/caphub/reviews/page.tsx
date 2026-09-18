import Link from "next/link";
import { getCaphubWorkItems,type WorkItemsInput } from "@/lib/caphub/registry/work-items";
import { readWorkbench } from "@/lib/caphub/registry/read-workbench";
import { WorkItems } from "@/components/caphub/work-items";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export default async function ReviewsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const one=(key:string)=>typeof params[key]==="string"?params[key]:null;
  const member=<const T extends string>(key:string,values:readonly T[]):T|null=>values.includes(one(key) as T)?one(key) as T:null;
  const input:WorkItemsInput={cursor:one("cursor"),reviewState:member("state",["WAITING_FOR_REVIEW","APPROVED","REJECTED","REVOKED","SUPERSEDED"]),
    valueBand:member("value",["high","medium","low","unknown"]),riskBand:member("risk",["high","medium","low","unknown"]),
    waitingAgeBand:member("age",["fresh","aging","overdue"]),reviewKind:member("kind",["candidate","build","implementation","release","update","deployment"])};
  const view=await readWorkbench(pool=>getCaphubWorkItems(pool,input));
  const query=new URLSearchParams();for(const key of ["state","value","risk","age","kind"]){const value=one(key);if(value)query.set(key,value);}
  return <div className="caphub-review-page"><h1>Reviews</h1>
    <details className="caphub-filters" open={query.size>0}><summary>Filters</summary><form action="/caphub/reviews">
      <label>State <select name="state" defaultValue={one("state")??"all"}><option value="all">All</option><option value="WAITING_FOR_REVIEW">Waiting</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="REVOKED">Revoked</option><option value="SUPERSEDED">Superseded</option></select></label>
      {(["value","risk"] as const).map(key=><label key={key}>{key==="value"?"Value":"Risk"} <select name={key} defaultValue={one(key)??"all"}><option value="all">All</option><option>high</option><option>medium</option><option>low</option><option>unknown</option></select></label>)}
      <button className="caphub-quiet-button" type="submit">Apply</button><Link href="/caphub/reviews">Clear</Link>
    </form></details>
    {view.state==="ready"?<WorkItems data={view.data} query={query.toString()}/>:<p role="alert" data-caphub-ready="unavailable">{view.state==="disabled"?"Reviews are not enabled.":"Reviews are temporarily unavailable. Refresh to retry."}</p>}
  </div>;
}
