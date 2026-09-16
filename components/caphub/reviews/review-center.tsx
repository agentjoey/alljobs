"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReviewDetailDto, ReviewQueueDto } from "@/lib/caphub/registry/queries";
import { DecisionForm } from "./decision-form";
import { ReviewDossier } from "./review-dossier";

export type ReviewCenterView =
  | { state: "loading"; code?: string }
  | { state: "disabled"; code?: string }
  | { state: "unavailable"; code?: string }
  | { state: "ready"; queue: ReviewQueueDto; detail: ReviewDetailDto };

export function ReviewCenter({ initialView }: { initialView: ReviewCenterView }) {
  const [kind, setKind] = useState("all");
  const items = useMemo(() => initialView.state === "ready"
    ? initialView.queue.items.filter((item) => kind === "all" || item.request.reviewKind === kind)
    : [], [initialView, kind]);

  if (initialView.state === "loading") return <section className="registry-state" role="status"><h1>Review Center</h1><p>Loading the immutable review docket…</p><div className="registry-skeleton" aria-hidden="true" /></section>;
  if (initialView.state === "disabled") return <section className="registry-state"><h1>Review Center is safe-off.</h1><p>Registry is disabled. Configure and verify PostgreSQL outside the browser; no secret, URL, role, or migration detail is exposed here.</p></section>;
  if (initialView.state === "unavailable") return <section className="registry-state" role="alert"><h1>Review Center is unavailable.</h1><p>Safe error <code>{initialView.code ?? "REGISTRY_UNAVAILABLE"}</code>. Retry the read without changing any review state.</p></section>;

  const detail = initialView.detail.kind === "found" ? initialView.detail : null;
  return <div className="registry-page">
    <header className="registry-page-head">
      <div><span className="registry-kicker">Caphub · Human Review</span><h1>Decide with the evidence still attached.</h1><p>Review one immutable subject version at a time. Decisions cannot publish, install, build, or deploy.</p></div>
      <div className="registry-queue-count"><strong>{items.length}</strong><span>waiting</span></div>
    </header>
    <div className="registry-filters" aria-label="Review filters">
      <label>Kind <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All</option><option value="candidate">Candidate</option><option value="build">Build</option><option value="implementation">Implementation</option><option value="release">Release</option><option value="update">Update</option></select></label>
    </div>
    <nav className="registry-jumpbar" aria-label="Review workbench sections"><a href="#docket">Docket</a><a href="#evidence">Evidence</a><a href="#diff">Diff</a><a href="#decision">Decision</a></nav>
    {initialView.queue.items.length === 0 ? <section className="registry-state"><h2>No review requests exist</h2><p>A completed, verified P2 import creates a Candidate review. There is no manual create control.</p></section>
      : items.length === 0 ? <section className="registry-state"><h2>No reviews match these filters</h2><p>Clear the active kind filter; existing requests are unchanged.</p></section>
      : <section className="registry-folio" aria-label="Review workbench">
        <aside className="registry-docket" id="docket" aria-labelledby="docket-title">
          <header><h2 id="docket-title">Docket</h2><span>Oldest first</span></header>
          <ol>{items.map((item) => <li key={item.request.id}><Link href={`/reviews?request=${item.request.id}`} aria-current={detail?.request.id === item.request.id ? "page" : undefined}>
            <span>{item.request.reviewKind} · v{item.request.subjectVersion}</span><strong>{item.candidate.name}</strong><small>Confidence {item.evidenceConfidence ?? "—"}/5 · {item.unresolvedCount} unresolved</small><code>{item.request.subjectId}</code>
          </Link></li>)}</ol>
        </aside>
        {detail ? <><ReviewDossier detail={detail} /><DecisionForm detail={detail} /></> : <section className="registry-state"><h2>Review not found</h2><p>The selected request is unavailable. Return to the docket.</p></section>}
      </section>}
    <div className="sr-only" aria-live="polite">{detail ? `Evidence dossier selected: ${detail.candidate.name}` : ""}</div>
  </div>;
}
