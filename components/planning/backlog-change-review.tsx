"use client";

import { useState } from "react";
import type { BacklogChangeProposal } from "@/lib/planning/backlog/mutations";
import type { BacklogItem } from "@/lib/planning/domain/types";

function buildApplicationHandoff(proposal: BacklogChangeProposal) {
  return [
    "# Backlog ordering application handoff",
    "",
    "Application owner: repository agent or Human Owner",
    `Project: ${proposal.projectSlug}`,
    `HEAD: ${proposal.headRevision ?? "unavailable"}`,
    `Full Backlog file digest (SHA-256): ${proposal.expectedFileDigest}`,
    `Proposal digest (SHA-256): ${proposal.proposalDigest}`,
    `Source: local working tree · ${proposal.backlogModified ? "modified" : "clean"}`,
    "",
    "Field-only diff:",
    "```text",
    proposal.diff,
    "```",
    "",
    "Application boundary:",
    "- AllJobs did not write to docs/BACKLOG.md and did not record an apply activity.",
    "- Verify the project, HEAD, complete-file digest, proposal digest, and field-only diff before applying.",
    "- Apply only the declared priority and rank scalar changes through the repository's normal reviewed workflow.",
    "- Preserve all unrelated bytes and stop if the repository state is stale."
  ].join("\n");
}

export function BacklogChangeReview({
  proposal,
  items,
  onBack
}: {
  proposal: BacklogChangeProposal;
  items: BacklogItem[];
  onBack: () => void;
}) {
  const [copyFeedback, setCopyFeedback] = useState("");
  const currentById = new Map(items.map((item) => [item.id, item]));
  const applicationHandoff = buildApplicationHandoff(proposal);

  const copyApplicationHandoff = async () => {
    try {
      await navigator.clipboard.writeText(applicationHandoff);
      setCopyFeedback("Application handoff copied to clipboard.");
    } catch {
      setCopyFeedback("Clipboard is unavailable. Select the handoff text and copy it manually.");
    }
  };

  return (
    <section className="backlog-review" aria-label="Proposal review">
      <header className="backlog-review__header">
        <div>
          <h2>Review the exact field changes</h2>
          <p>
            AllJobs prepared a digest-bound proposal only. A repository agent or Human Owner must verify and apply
            any declared <code>priority</code> and <code>rank</code> scalar changes outside AllJobs.
          </p>
        </div>
        <span className="badge badge--active">COPY-ONLY HANDOFF</span>
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
          <dd>{proposal.headRevision ?? "—"}</dd>
        </div>
        <div>
          <dt>Expected file digest</dt>
          <dd>sha256 {proposal.expectedFileDigest}</dd>
        </div>
        <div>
          <dt>Proposal digest</dt>
          <dd>sha256 {proposal.proposalDigest}</dd>
        </div>
      </dl>

      <div className="backlog-review__handoff">
        <label htmlFor="backlog-application-handoff">Repository-agent / Human Owner application handoff</label>
        <textarea
          id="backlog-application-handoff"
          aria-label="Backlog application handoff"
          readOnly
          rows={13}
          value={applicationHandoff}
        />
        <p>AllJobs did not write to <code>docs/BACKLOG.md</code>. Copy this handoff into the repository&apos;s reviewed workflow.</p>
      </div>

      <footer className="backlog-review__actions">
        <button type="button" className="btn" onClick={onBack}>
          Back to draft
        </button>
        <button type="button" className="btn btn--primary" onClick={copyApplicationHandoff}>
          Copy application handoff
        </button>
      </footer>
      {copyFeedback && <p className="backlog-review__copy-feedback" role="status">{copyFeedback}</p>}
    </section>
  );
}
