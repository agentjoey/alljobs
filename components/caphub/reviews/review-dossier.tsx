import type { ReviewDetailDto } from "@/lib/caphub/registry/queries";

type FoundReview = Extract<ReviewDetailDto, { kind: "found" }>;

export function ReviewDossier({ detail }: { detail: FoundReview }) {
  return (
    <article className="registry-dossier" id="evidence" aria-labelledby="registry-subject-title">
      <header className="registry-subject-spine">
        <div>
          <span>Candidate · version {detail.request.subjectVersion}</span>
          <h2 id="registry-subject-title" tabIndex={-1}>{detail.candidate.name}</h2>
          <p>{detail.packet.recommendedDisposition ?? "Review required"} recommendation · evidence confidence {detail.packet.evidenceConfidence ?? "—"}/5</p>
        </div>
        <code aria-label="Selected Candidate ID">{detail.request.subjectId}</code>
      </header>

      <section className="registry-recommendation" aria-labelledby="recommendation-title">
        <h3 id="recommendation-title">Recommendation and critic</h3>
        <p><strong>{detail.packet.recommendedDisposition ?? "No disposition"}</strong> remains a review-only direction. It does not create a build or release.</p>
        <p><strong>Critic agreement:</strong> {detail.packet.critic?.verdict ?? "No independent critic output was imported."}</p>
        <p><strong>Critic disagreement:</strong> {detail.packet.critic?.unresolvedQuestions.join(" ") || "No additional critic disagreement recorded."}</p>
      </section>

      <section className="registry-section" aria-labelledby="evidence-title">
        <h3 id="evidence-title">Evidence and Claims</h3>
        {detail.packet.evidence.length === 0 ? <p className="registry-empty-copy">No evidence records were imported.</p> : (
          <ol className="registry-evidence-list">
            {detail.packet.evidence.map((item) => (
              <li key={item.id}>
                <span className="registry-badge">Tier {item.tier}</span>
                <div>
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">{item.title}</a>
                  <p>{item.claims.join(" · ")}</p>
                  <code>{item.id} · {item.contentDigest}</code>
                </div>
              </li>
            ))}
          </ol>
        )}
        {detail.packet.claims.map((claim) => (
          <div className="registry-claim" key={claim.id}>
            <span>{Math.round(claim.confidence * 100)}%</span>
            <p>{claim.statement}</p>
            <code>{claim.id} · {claim.basis}</code>
          </div>
        ))}
      </section>

      <section className="registry-section" aria-labelledby="conflicts-title">
        <h3 id="conflicts-title">Conflicts and unresolved questions</h3>
        {detail.packet.conflicts.map((conflict, index) => <p key={index}>{conflict.summary}</p>)}
        {detail.packet.unresolvedQuestions.length === 0 ? <p>No unresolved questions.</p> : (
          <ul>{detail.packet.unresolvedQuestions.map((question) => <li key={question}>{question}</li>)}</ul>
        )}
      </section>

      <section className="registry-section" id="diff" aria-labelledby="diff-title">
        <h3 id="diff-title">Exact-version Diff</h3>
        <ul className="registry-diff-list">
          {detail.diff.map((entry) => <li key={`${entry.kind}:${entry.path}`}><code>{entry.kind.toUpperCase()}</code><span>{entry.path} · {entry.summary}</span></li>)}
        </ul>
      </section>
    </article>
  );
}
