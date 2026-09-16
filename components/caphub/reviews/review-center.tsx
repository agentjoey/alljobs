import Link from "next/link";
import type { ReviewDetailDto, ReviewQueueDto } from "@/lib/caphub/registry/queries";
import { DecisionForm } from "./decision-form";
import { ReviewDossier } from "./review-dossier";

export type ReviewCenterView =
  | { state: "loading"; code?: string }
  | { state: "disabled"; code?: string }
  | { state: "unavailable"; code?: string }
  | { state: "ready"; queue: ReviewQueueDto; detail: ReviewDetailDto };

function queueHref(
  filters: Extract<ReviewQueueDto, { kind: "ready" }>["appliedFilters"],
  extra: { request?: string; cursor?: string } = {}
): string {
  const params = new URLSearchParams();
  if (filters.reviewKind) params.set("kind", filters.reviewKind);
  if (filters.state) params.set("state", filters.state);
  if (filters.valueBand) params.set("value", filters.valueBand);
  if (filters.riskBand) params.set("risk", filters.riskBand);
  if (filters.waitingAgeBand) params.set("age", filters.waitingAgeBand);
  if (extra.request) params.set("request", extra.request);
  if (extra.cursor) params.set("cursor", extra.cursor);
  const query = params.toString();
  return query ? `/reviews?${query}` : "/reviews";
}

export function ReviewCenter({ initialView }: { initialView: ReviewCenterView }) {
  if (initialView.state === "loading") return <section className="registry-state" role="status"><h1>Review Center</h1><p>Loading the immutable review docket…</p><div className="registry-skeleton" aria-hidden="true" /></section>;
  if (initialView.state === "disabled") return <section className="registry-state"><h1>Review Center is safe-off.</h1><p>Registry is disabled. Configure and verify PostgreSQL outside the browser; no secret, URL, role, or migration detail is exposed here.</p></section>;
  if (initialView.state === "unavailable") return <section className="registry-state" role="alert"><h1>Review Center is unavailable.</h1><p>Safe error <code>{initialView.code ?? "REGISTRY_UNAVAILABLE"}</code>. Retry the read without changing any review state.</p></section>;

  const detail = initialView.detail.kind === "found" ? initialView.detail : null;
  const items = initialView.queue.items;
  const filters = initialView.queue.appliedFilters;
  const filtered = Boolean(filters.reviewKind || filters.state || filters.valueBand
    || filters.riskBand || filters.waitingAgeBand || filters.cursor);
  return <div className="registry-page">
    <header className="registry-page-head">
      <div><span className="registry-kicker">Caphub · Human Review</span><h1>Decide with the evidence still attached.</h1><p>Review one immutable subject version at a time. Decisions cannot publish, install, build, or deploy.</p></div>
      <div className="registry-queue-count"><strong>{items.filter((item) => item.request.state === "WAITING_FOR_REVIEW").length}</strong><span>waiting</span></div>
    </header>
    <form className="registry-filters" aria-label="Review filters" action="/reviews" method="get">
      <label>Kind <select name="kind" defaultValue={filters.reviewKind ?? "all"}><option value="all">All</option><option value="candidate">Candidate</option><option value="build">Build</option><option value="implementation">Implementation</option><option value="release">Release</option><option value="update">Update</option></select></label>
      <label>State <select name="state" defaultValue={filters.state ?? "all"}><option value="all">All</option><option value="WAITING_FOR_REVIEW">Waiting</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="REVOKED">Revoked</option><option value="SUPERSEDED">Superseded</option></select></label>
      <label>Value <select name="value" defaultValue={filters.valueBand ?? "all"}><option value="all">All</option><option value="high">High 4–5</option><option value="medium">Medium 2–3</option><option value="low">Low 0–1</option><option value="unknown">Unknown</option></select></label>
      <label>Risk <select name="risk" defaultValue={filters.riskBand ?? "all"}><option value="all">All</option><option value="high">High 4–5</option><option value="medium">Medium 2–3</option><option value="low">Low 0–1</option><option value="unknown">Unknown</option></select></label>
      <label>Waiting age <select name="age" defaultValue={filters.waitingAgeBand ?? "all"}><option value="all">All</option><option value="fresh">Under 24h</option><option value="aging">1–7 days</option><option value="overdue">Over 7 days</option></select></label>
      <button className="registry-filter-submit" type="submit">Apply filters</button>
      {filtered && <Link className="registry-filter-clear" href="/reviews">Clear filters</Link>}
    </form>
    <nav className="registry-jumpbar" aria-label="Review workbench sections"><a href="#docket">Docket</a><a href="#evidence">Evidence</a><a href="#diff">Diff</a><a href="#decision">Decision</a></nav>
    {items.length === 0 && !filtered ? <section className="registry-state"><h2>No review requests exist</h2><p>A completed, verified P2 import creates a Candidate review. There is no manual create control.</p></section>
      : items.length === 0 ? <section className="registry-state"><h2>No reviews match these filters</h2><p>Clear one or all named filters; existing requests are unchanged.</p></section>
      : <section className="registry-folio" aria-label="Review workbench">
        <aside className="registry-docket" id="docket" aria-labelledby="docket-title">
          <header><h2 id="docket-title">Docket</h2><span>Oldest first</span></header>
          <ol>{items.map((item) => <li key={item.request.id}><Link href={queueHref(filters, { request: item.request.id })} aria-current={detail?.request.id === item.request.id ? "page" : undefined}>
            <span>{item.request.reviewKind} · {item.request.state.replaceAll("_", " ")} · v{item.request.subjectVersion}</span><strong>{item.candidate.name}</strong>
            <small>Waiting {Math.round(item.waitingAgeHours)}h · since {item.waitingSince.slice(0, 10)} · Value {item.valueScore ?? "—"}/5 · Risk {item.riskScore ?? "—"}/5</small>
            <small>Confidence {item.evidenceConfidence ?? "—"}/5 · {item.unresolvedCount} unresolved · {item.identityStatus.replaceAll("_", " ")}</small>
            <small>Recommended: {item.recommendedDisposition ?? "review"}</small><code>{item.request.subjectId}</code>
          </Link></li>)}</ol>
        </aside>
        {detail ? <><ReviewDossier detail={detail} /><DecisionForm detail={detail} /></> : <section className="registry-state"><h2>Review not found</h2><p>The selected request is unavailable. Return to the docket.</p></section>}
      </section>}
    {initialView.queue.nextCursor && <nav className="registry-pagination" aria-label="Review pages"><Link href={queueHref(filters, { cursor: initialView.queue.nextCursor })}>Next 25 reviews</Link></nav>}
    <div className="sr-only" aria-live="polite">{detail ? `Evidence dossier selected: ${detail.candidate.name}` : ""}</div>
  </div>;
}
