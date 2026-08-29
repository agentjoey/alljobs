"use client";

import type { BacklogChangeProposal } from "@/lib/planning/backlog/mutations";
import type { BacklogItem } from "@/lib/planning/domain/types";

function shortDigest(digest: string) {
  return `sha256 ${digest.slice(0, 10)}…${digest.slice(-4)}`;
}

export function BacklogChangeReview({
  proposal,
  items,
  applying,
  onBack,
  onApply
}: {
  proposal: BacklogChangeProposal;
  items: BacklogItem[];
  applying: boolean;
  onBack: () => void;
  onApply: () => void;
}) {
  const currentById = new Map(items.map((item) => [item.id, item]));

  return (
    <section className="backlog-review" aria-label="Proposal review">
      <header className="backlog-review__header">
        <div>
          <h2>Review the exact field changes</h2>
          <p>
            Only declared <code>priority</code> and <code>rank</code> scalars are eligible. Apply re-reads the complete
            file before writing and does not perform Git operations.
          </p>
        </div>
        <span className="badge badge--active">HUMAN GATE</span>
      </header>

      {proposal.renumbered && (
        <p className="backlog-notice backlog-notice--warning">
          <strong>Target lane renumbering.</strong> This proposal has no safe integer gap, so only its Phase + Priority
          lane receives new ranks.
        </p>
      )}

      <div className="backlog-change-list" role="list" aria-label="Proposed priority and rank changes">
        {proposal.changes.map((change) => {
          const before = currentById.get(change.itemId);
          const previousRank = before?.rank ?? "absent";
          const nextRank = change.rank ?? "unchanged";
          return (
            <article className="backlog-change-row" role="listitem" key={change.itemId}>
              <code>{change.itemId}</code>
              <span>priority {before?.priority ?? "?"} → {change.priority}</span>
              <span>rank {previousRank} → {nextRank}</span>
            </article>
          );
        })}
      </div>

      <dl className="backlog-review__facts">
        <div>
          <dt>Source</dt>
          <dd>LOCAL WORKING TREE · {proposal.backlogModified ? "MODIFIED" : "CLEAN"}</dd>
        </div>
        <div>
          <dt>HEAD</dt>
          <dd>{proposal.headRevision?.slice(0, 10) ?? "—"}</dd>
        </div>
        <div>
          <dt>Expected file digest</dt>
          <dd>{shortDigest(proposal.expectedFileDigest)}</dd>
        </div>
        <div>
          <dt>Proposal digest</dt>
          <dd>{shortDigest(proposal.proposalDigest)}</dd>
        </div>
      </dl>

      <footer className="backlog-review__actions">
        <button type="button" className="btn" onClick={onBack} disabled={applying}>
          Back to draft
        </button>
        <button type="button" className="btn btn--primary" onClick={onApply} disabled={applying}>
          {applying ? "Applying changes" : "Confirm and apply"}
        </button>
      </footer>
    </section>
  );
}
