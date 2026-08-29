"use client";

import { useState, type FormEvent } from "react";
import { buildRepoAgentBacklogProposal } from "@/lib/planning/backlog/handoff";
import type { Priority } from "@/lib/planning/domain/types";
import type { PlanningSourceState } from "@/lib/planning/providers/contracts";

type RequestField = "title" | "problem" | "expectedOutcome";

const fieldLabels: Record<RequestField, string> = {
  title: "Title",
  problem: "Problem",
  expectedOutcome: "Expected outcome"
};

function trimOrUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function BacklogProposalForm({
  projectSlug,
  source
}: {
  projectSlug: string;
  source?: PlanningSourceState;
}) {
  const [values, setValues] = useState({
    title: "",
    problem: "",
    expectedOutcome: "",
    suggestedPhase: "",
    suggestedPriority: "",
    doneWhen: "",
    notes: ""
  });
  const [errors, setErrors] = useState<Partial<Record<RequestField, string>>>({});
  const [proposal, setProposal] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  const update = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (field in fieldLabels) {
      setErrors((current) => ({ ...current, [field as RequestField]: undefined }));
    }
    setCopyFeedback("");
  };

  const generate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = (Object.keys(fieldLabels) as RequestField[]).reduce<Partial<Record<RequestField, string>>>(
      (result, field) => {
        if (!values[field].trim()) result[field] = `${fieldLabels[field]} is required.`;
        return result;
      },
      {}
    );
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setProposal(buildRepoAgentBacklogProposal({
      projectSlug,
      title: values.title.trim(),
      problem: values.problem.trim(),
      expectedOutcome: values.expectedOutcome.trim(),
      suggestedPhase: trimOrUndefined(values.suggestedPhase),
      suggestedPriority: trimOrUndefined(values.suggestedPriority) as Priority | undefined,
      doneWhen: trimOrUndefined(values.doneWhen),
      notes: trimOrUndefined(values.notes),
      headRevision: source?.headRevision,
      backlogDigest: source?.backlogDigest
    }));
  };

  const copyProposal = async () => {
    try {
      await navigator.clipboard.writeText(proposal);
      setCopyFeedback("Proposal copied to clipboard.");
    } catch {
      setCopyFeedback("Clipboard is unavailable. Select the proposal text and copy it manually.");
    }
  };

  const fieldStyle = { width: "100%", padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--hairline-strong)", background: "var(--paper-raised)", color: "var(--ink)", font: "inherit" };
  const labelStyle = { display: "block", marginBottom: "4px", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const };

  return (
    <section className="backlog-surface" aria-labelledby="backlog-proposal-title">
      <header className="backlog-surface__header">
        <div>
          <h2 id="backlog-proposal-title">Prepare repository-agent handoff</h2>
          <p>Generate a copy-only request for a new or substantive Backlog item. Nothing is saved here.</p>
        </div>
      </header>

      <article className="backlog-card">
        {(source?.headRevision || source?.backlogDigest) && (
          <div className="backlog-card__meta" style={{ marginBottom: "12px" }}>
            {source.headRevision && <span>HEAD revision: {source.headRevision}</span>}
            {source.backlogDigest && <span>Backlog digest: {source.backlogDigest}</span>}
          </div>
        )}
        <form onSubmit={generate} noValidate style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label htmlFor="backlog-proposal-title-field" style={labelStyle}>Title</label>
            <input id="backlog-proposal-title-field" value={values.title} onChange={(event) => update("title", event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "backlog-proposal-title-error" : undefined} style={fieldStyle} />
            {errors.title && <p id="backlog-proposal-title-error" role="alert" style={{ color: "var(--rust)", fontSize: "12px", margin: "5px 0 0" }}>{errors.title}</p>}
          </div>
          <div>
            <label htmlFor="backlog-proposal-problem" style={labelStyle}>Problem</label>
            <textarea id="backlog-proposal-problem" value={values.problem} onChange={(event) => update("problem", event.target.value)} aria-invalid={Boolean(errors.problem)} aria-describedby={errors.problem ? "backlog-proposal-problem-error" : undefined} rows={3} style={fieldStyle} />
            {errors.problem && <p id="backlog-proposal-problem-error" role="alert" style={{ color: "var(--rust)", fontSize: "12px", margin: "5px 0 0" }}>{errors.problem}</p>}
          </div>
          <div>
            <label htmlFor="backlog-proposal-outcome" style={labelStyle}>Expected outcome</label>
            <textarea id="backlog-proposal-outcome" value={values.expectedOutcome} onChange={(event) => update("expectedOutcome", event.target.value)} aria-invalid={Boolean(errors.expectedOutcome)} aria-describedby={errors.expectedOutcome ? "backlog-proposal-outcome-error" : undefined} rows={3} style={fieldStyle} />
            {errors.expectedOutcome && <p id="backlog-proposal-outcome-error" role="alert" style={{ color: "var(--rust)", fontSize: "12px", margin: "5px 0 0" }}>{errors.expectedOutcome}</p>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <div>
              <label htmlFor="backlog-proposal-phase" style={labelStyle}>Suggested Phase</label>
              <input id="backlog-proposal-phase" value={values.suggestedPhase} onChange={(event) => update("suggestedPhase", event.target.value)} style={fieldStyle} />
            </div>
            <div>
              <label htmlFor="backlog-proposal-priority" style={labelStyle}>Suggested priority</label>
              <select id="backlog-proposal-priority" value={values.suggestedPriority} onChange={(event) => update("suggestedPriority", event.target.value)} style={fieldStyle}>
                <option value="">Repository agent decides</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="backlog-proposal-done-when" style={labelStyle}>Suggested Done When</label>
            <input id="backlog-proposal-done-when" value={values.doneWhen} onChange={(event) => update("doneWhen", event.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label htmlFor="backlog-proposal-notes" style={labelStyle}>Notes</label>
            <textarea id="backlog-proposal-notes" value={values.notes} onChange={(event) => update("notes", event.target.value)} rows={3} style={fieldStyle} />
          </div>
          <div className="backlog-action-row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn--primary">Generate proposal</button>
          </div>
        </form>
      </article>

      {proposal && (
        <article className="backlog-card">
          <label htmlFor="repository-agent-proposal" style={labelStyle}>Repository-agent proposal</label>
          <textarea id="repository-agent-proposal" aria-label="Repository-agent proposal" readOnly value={proposal} rows={18} style={{ ...fieldStyle, fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: 1.5, resize: "vertical" }} />
          <div className="backlog-action-row" style={{ justifyContent: "space-between", marginTop: "12px" }}>
            <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "12px" }}>Copy this text into a repository-agent session. AllJobs does not execute it.</p>
            <button type="button" className="btn btn--primary" onClick={copyProposal}>Copy proposal</button>
          </div>
          {copyFeedback && <p role="status" style={{ margin: "10px 0 0", color: "var(--ink-muted)", fontSize: "12px" }}>{copyFeedback}</p>}
        </article>
      )}
    </section>
  );
}
