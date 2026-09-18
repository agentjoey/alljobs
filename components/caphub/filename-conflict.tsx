"use client";
import { useEffect,useRef } from "react";
import { z } from "zod";
export const filenameConflictSchema=z.object({error:z.object({
  code:z.enum(["FILENAME_CONFLICT","FILENAME_CONFLICT_STALE","FILENAME_CONFLICT_UNRESOLVED"]),message:z.string(),
  existing:z.object({id:z.string().regex(/^cap_[a-f0-9]{32}$/),filename:z.string(),digest:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string()}),
  incomingDigest:z.string().regex(/^[a-f0-9]{64}$/).optional()
})});
export type FilenameConflict=z.infer<typeof filenameConflictSchema>["error"];
export function FilenameConflictPrompt({conflict,onConfirm,onCancel,pending}:{conflict:FilenameConflict;onConfirm:()=>void;onCancel:()=>void;pending:boolean}){
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[conflict]);
  return <section className="caphub-notice caphub-filename-conflict" aria-labelledby="filename-conflict-title">
    <div><h2 id="filename-conflict-title" tabIndex={-1} ref={heading}>Same filename, different image</h2>
      <p>{conflict.existing.filename} · saved {conflict.existing.createdAt.slice(0,10)}</p>
      <p>Existing {conflict.existing.digest.slice(0,8)}{conflict.incomingDigest?` · Selected ${conflict.incomingDigest.slice(0,8)}`:""}</p>
      {conflict.code==="FILENAME_CONFLICT_UNRESOLVED"?<p>Existing versions need an operator selection before another upload.</p>:<>
        {conflict.code==="FILENAME_CONFLICT_STALE"&&<p>The current version changed. Check it before confirming again.</p>}
        <button className="caphub-quiet-button" type="button" disabled={pending} onClick={onConfirm}>Create new version</button>
      </>}
      <button className="caphub-quiet-button" type="button" disabled={pending} onClick={onCancel}>Cancel</button>
    </div>
  </section>;
}
