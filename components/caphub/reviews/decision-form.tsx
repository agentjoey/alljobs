"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ReviewDetailDto } from "@/lib/caphub/registry/queries";

type FoundReview = Extract<ReviewDetailDto, { kind: "found" }>;
type DecisionAction = "approve" | "reject" | "revoke";
const DISPOSITIONS = ["adopt", "adapt", "build", "learn", "watch"] as const;

function revokeConfirmation(detail: FoundReview): string {
  const shortId = detail.request.subjectId.split("_")[1]?.slice(0, 8) ?? "";
  return `REVOKE ${detail.request.reviewKind.toUpperCase()} ${shortId}`;
}

export function DecisionForm({ detail }: { detail: FoundReview }) {
  const [action, setAction] = useState<DecisionAction>("approve");
  const [disposition, setDisposition] = useState<(typeof DISPOSITIONS)[number]>("build");
  const [rationale, setRationale] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<null | { id: string; action: string; consequence: string }>(null);
  const receiptRef = useRef<HTMLHeadingElement>(null);
  const storedDecision = detail.decision;
  const revocable = storedDecision?.action === "approve" && detail.authority?.revocable === true;
  const activeAction: DecisionAction = revocable ? "revoke" : action;
  const expectedConfirmation = activeAction === "approve"
    ? detail.request.approveConfirmation
    : activeAction === "reject"
      ? detail.request.rejectConfirmation
      : revokeConfirmation(detail);
  const terminal = detail.request.state !== "WAITING_FOR_REVIEW" && !revocable;
  const valid = confirmation === expectedConfirmation
    && (activeAction === "approve" || rationale.trim().length > 0)
    && !submitting;

  useEffect(() => {
    if (receipt) receiptRef.current?.focus();
  }, [receipt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      setError("Complete the rationale and exact confirmation required for this decision.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = {
      idempotency_key: `review.intent-${globalThis.crypto.randomUUID()}`,
      expected_lock_version: detail.request.lockVersion,
      expected_subject_digest: detail.request.subjectDigest,
      action: activeAction,
      confirmation,
      rationale,
      ...(activeAction === "approve" ? { disposition } : {}),
      ...(activeAction === "revoke" && storedDecision ? { original_approval_decision_id: storedDecision.id } : {})
    };
    try {
      const response = await fetch(`/api/caphub/reviews/${detail.request.id}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) {
        const code = String(payload?.error?.code ?? "REVIEW_WRITE_UNAVAILABLE");
        setError(code === "STALE_REVIEW"
          ? "This request changed before the decision. Your rationale is preserved; refresh before retrying."
          : code === "IDEMPOTENCY_CONFLICT"
            ? "This intent key already binds different input. Your rationale is preserved."
            : `Decision was not recorded (${code}). Your rationale is preserved.`);
        return;
      }
      setReceipt({ id: payload.decision.id, action: payload.decision.action, consequence: payload.consequence });
    } catch {
      setError("Decision was not recorded (REVIEW_WRITE_UNAVAILABLE). Your rationale is preserved.");
    } finally {
      setSubmitting(false);
    }
  }

  if (detail.request.state === "SUPERSEDED") {
    return <aside className="registry-decision" id="decision" aria-labelledby="decision-title">
      <h2 id="decision-title" tabIndex={-1}>This request was superseded</h2>
      <p>Its original evidence and Diff remain readable, but decision controls are removed.</p>
      {detail.request.supersededByRequestId && <Link href={`/reviews?request=${detail.request.supersededByRequestId}`}>Open latest request {detail.request.supersededByRequestId}</Link>}
    </aside>;
  }

  return (
    <aside className="registry-decision" id="decision" aria-labelledby="decision-title">
      <header><h2 id="decision-title">Decision ledger</h2><span>Human owner only</span></header>
      <div className="registry-version-lock">
        <strong>Candidate version {detail.request.subjectVersion} · lock {detail.request.lockVersion}</strong>
        <code aria-label="Full subject SHA-256 digest">{detail.request.subjectDigest}</code>
      </div>
      <p className="registry-consequence"><strong>Authority boundary:</strong> this decision cannot create a Release, start a Builder, write Git, install, publish, or deploy.</p>

      {(storedDecision || receipt) && <section className="registry-decision-receipt" aria-live="polite">
        <h3 ref={receiptRef} tabIndex={-1}>{receipt ? "Decision recorded" : storedDecision?.action === "reject" ? "Candidate version rejected" : storedDecision?.action === "revoke" ? "Approval revoked" : detail.authority?.state === "consumed" ? "Decision recorded · consumed" : "Decision recorded · revocable"}</h3>
        <p>{receipt?.consequence ?? "No release, build, installation, publication, Git write, or deployment was created."}</p>
        <dl>
          <dt>Decision</dt><dd><code>{receipt?.id ?? storedDecision?.id}</code></dd>
          <dt>Action</dt><dd>{receipt?.action ?? storedDecision?.action}</dd>
          <dt>Full digest</dt><dd><code>{detail.request.subjectDigest}</code></dd>
          {detail.authority?.state === "consumed" && <><dt>Consumer</dt><dd><code>{detail.authority.consumedBy}</code></dd></>}
        </dl>
      </section>}

      {!terminal && !receipt && <form onSubmit={submit} noValidate>
        {!revocable && <div className="registry-action-switch" aria-label="Decision action">
          <button type="button" aria-pressed={action === "approve"} onClick={() => { setAction("approve"); setConfirmation(""); }}>Approve</button>
          <button type="button" aria-pressed={action === "reject"} onClick={() => { setAction("reject"); setConfirmation(""); }}>Reject permanently</button>
        </div>}
        {activeAction === "approve" && <fieldset className="registry-choice-grid">
          <legend>Approval disposition</legend>
          {DISPOSITIONS.map((item) => <button key={item} type="button" aria-pressed={disposition === item} onClick={() => setDisposition(item)}>{item}</button>)}
        </fieldset>}
        <label className="registry-field" htmlFor="review-rationale">Rationale {activeAction === "approve" ? "(optional)" : "(required)"}</label>
        <textarea id="review-rationale" value={rationale} maxLength={2000} onChange={(event) => setRationale(event.target.value)} disabled={submitting} />
        <label className="registry-field" htmlFor="review-confirmation">Typed confirmation · exact match</label>
        <input id="review-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-describedby="review-confirmation-copy" aria-invalid={Boolean(error)} disabled={submitting} />
        <p className="registry-confirm-copy" id="review-confirmation-copy"><code>{expectedConfirmation}</code></p>
        {error && <div className="registry-decision-error" role="alert" tabIndex={-1}>{error}</div>}
        <button className="registry-submit" type="submit" disabled={!valid}>{submitting ? "Recording exact decision…" : activeAction === "approve" ? `Approve ${disposition}` : activeAction === "reject" ? "Reject this version" : "Revoke approval"}</button>
      </form>}
      <p className="registry-safety-line"><strong>Append-only.</strong> Reject is permanent. Approval is revocable only before a later phase consumes it.</p>
    </aside>
  );
}
