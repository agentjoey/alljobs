"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { z } from "zod";
import type { CaptureStatus } from "@/lib/caphub/registry/review-workbench";

const statusSchema=z.object({
  captureId:z.string().regex(/^cap_[a-f0-9]{32}$/),canonicalCaptureId:z.string().regex(/^cap_[a-f0-9]{32}$/),filename:z.string(),createdAt:z.string(),
  state:z.enum(["received","queued","running","waiting_for_review","needs_attention","completed","filename_conflict"]),
  stage:z.string().nullable(),reviewRequestId:z.string().regex(/^rev_[a-f0-9]{32}$/).nullable(),jobId:z.string().nullable(),
  eligibleAt:z.string().nullable(),purgedAt:z.string().nullable(),errorCode:z.string().nullable()
}).strict();
export const analysisLabels:Record<string,string>={received:"Saved · analysis not queued",queued:"Queued",running:"Analyzing",waiting_for_review:"Waiting for review",needs_attention:"Needs attention",completed:"Complete",filename_conflict:"Filename needs a decision"};
export function AnalysisStatus({captureId,initial}:{captureId:string;initial?:CaptureStatus}) {
  const [status,setStatus]=useState(initial);
  const [unavailable,setUnavailable]=useState(false);
  useEffect(()=>{
    if (initial && !["queued","running"].includes(initial.state)) return;
    let cancelled=false;let timer:ReturnType<typeof setTimeout>;
    const controller=new AbortController();
    async function poll() {
      let next=2000;
      try {
        const response=await fetch(`/api/caphub/captures/${captureId}/status`,{cache:"no-store",signal:controller.signal});
        if(!response.ok) throw new Error("unavailable");
        const value=statusSchema.parse(await response.json());
        if(value.captureId!==captureId) throw new Error("mismatch");
        if(cancelled)return;
        setStatus(value);setUnavailable(false);
        if(!["queued","running"].includes(value.state)) return;
      } catch { if(cancelled)return;setUnavailable(true);next=10000; }
      timer=setTimeout(poll,next);
    }
    timer=setTimeout(poll,initial?2000:0);
    return()=>{cancelled=true;controller.abort();clearTimeout(timer);};
  },[captureId,initial]);
  return <section className="caphub-analysis" aria-label="Analysis progress">
    <p role="status" aria-live="polite">{status ? analysisLabels[status.state] ?? "Needs attention" : "Checking analysis…"}{status?.state==="running"&&status.stage?` · ${status.stage}`:""}</p>
    {unavailable&&<p>Progress is temporarily unavailable. Retrying…</p>}
    {status?.reviewRequestId&&<Link className="caphub-quiet-button" href={`/caphub/reviews/${status.reviewRequestId}`}>Review results</Link>}
    {status?.purgedAt ? <p>Raw image expired. Parsed information is retained.</p> : status?.eligibleAt ? <p>Original image retained until {status.eligibleAt.slice(0,10)}.</p>:null}
  </section>;
}
