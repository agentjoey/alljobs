"use client";

import { useId, useMemo, useState } from "react";
import { buildDocumentStandardizationHandoff } from "@/lib/planning/document-handoff";
import type {
  DocumentTriage,
  DocumentTriageState,
  PlanningSourceState
} from "@/lib/planning/providers/contracts";

const stateLabels: Record<DocumentTriageState, string> = {
  canonical: "Canonical",
  recoverable: "Canonical repair needed",
  unstructured: "Not canonical planning data",
  missing: "Missing document",
  unavailable: "Source unavailable"
};

const modeLabels: Record<PlanningSourceState["mode"], string> = {
  "local-working-tree": "Local working tree",
  "remote-commit": "Remote commit",
  cached: "Cached snapshot"
};

function documentDigest(document: DocumentTriage, source: PlanningSourceState) {
  if (document.digest) return document.digest;
  return document.document === "roadmap" ? source.roadmapDigest : source.backlogDigest;
}

function documentRevision(document: DocumentTriage, source: PlanningSourceState) {
  return document.revision ?? source.headRevision;
}

function fixedDocumentPath(document: DocumentTriage["document"]) {
  return document === "roadmap" ? "docs/ROADMAP.md" : "docs/BACKLOG.md";
}

function HandoffAction({
  document,
  source,
  projectSlug
}: {
  document: DocumentTriage;
  source: PlanningSourceState;
  projectSlug: string;
}) {
  const [feedback, setFeedback] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const handoff = useMemo(
    () => buildDocumentStandardizationHandoff({ projectSlug, triage: document, source }),
    [document, projectSlug, source]
  );

  async function copyHandoff() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(handoff);
      setShowFallback(false);
      setFeedback("Repository-agent handoff copied.");
    } catch {
      setShowFallback(true);
      setFeedback("Copy failed. Select and copy the handoff text below.");
    }
  }

  return (
    <div style={{ display: "grid", gap: "10px", justifyItems: "start" }}>
      <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "12.5px", lineHeight: 1.5 }}>
        Copy only. AllJobs will not write, commit, push, merge, fetch, or start an agent.
      </p>
      <button
        type="button"
        className="btn"
        style={{ minHeight: "44px" }}
        onClick={copyHandoff}
      >
        Copy repository-agent handoff
      </button>
      <p aria-live="polite" style={{ minHeight: "19px", margin: 0, color: "var(--ink-muted)", fontSize: "12px" }}>
        {feedback}
      </p>
      {showFallback && (
        <textarea
          aria-label="Repository-agent handoff text"
          readOnly
          value={handoff}
          style={{
            boxSizing: "border-box",
            width: "100%",
            minHeight: "220px",
            padding: "12px",
            resize: "vertical",
            background: "var(--paper-recessed)",
            border: "1px solid var(--hairline-strong)",
            borderRadius: "var(--radius-md)",
            color: "var(--ink)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            lineHeight: 1.55
          }}
        />
      )}
    </div>
  );
}

function DocumentFacts({ document, source }: { document: DocumentTriage; source: PlanningSourceState }) {
  const revision = documentRevision(document, source);
  const digest = documentDigest(document, source);

  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "10px 18px",
        margin: 0,
        padding: "12px 0",
        borderTop: "1px solid var(--hairline-faint)",
        borderBottom: "1px solid var(--hairline-faint)"
      }}
    >
      {[
        ["Path", fixedDocumentPath(document.document)],
        ["Revision", revision ?? "Not available"],
        ["Digest", digest ?? "Not available"]
      ].map(([term, value]) => (
        <div key={term} style={{ minWidth: 0 }}>
          <dt style={{ color: "var(--ink-faint)", fontFamily: "var(--font-mono)", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {term}
          </dt>
          <dd style={{ margin: "3px 0 0", overflowWrap: "anywhere", color: "var(--ink)", fontFamily: term === "Source" ? "var(--font-sans)" : "var(--font-mono)", fontSize: "12px" }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DocumentEvidence({ document }: { document: DocumentTriage }) {
  if (document.diagnostics.length === 0 && document.candidates.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {document.diagnostics.length > 0 && (
        <div>
          <h4 style={{ margin: "0 0 6px", fontSize: "13px" }}>Diagnostics</h4>
          <ul style={{ margin: 0, paddingLeft: "18px", color: "var(--ink-muted)", fontSize: "12.5px" }}>
            {document.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${diagnostic.objectId ?? index}`} style={{ overflowWrap: "anywhere" }}>
                <code>{diagnostic.code}</code> — {diagnostic.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {document.candidates.length > 0 && (
        <section aria-label={`${document.document} candidate evidence`}>
          <h4 style={{ margin: "0 0 4px", fontSize: "13px" }}>Candidate section</h4>
          <p style={{ margin: "0 0 8px", color: "var(--rust)", fontSize: "12px", fontWeight: 600 }}>
            Evidence only — not promoted to Roadmap or Backlog.
          </p>
          <div style={{ display: "grid", gap: "8px" }}>
            {document.candidates.map((candidate) => (
              <article
                key={`${candidate.line}-${candidate.heading}`}
                data-document-candidate
                style={{
                  padding: "12px",
                  backgroundColor: "var(--paper-recessed)",
                  backgroundImage: "repeating-linear-gradient(45deg, rgba(22, 20, 14, 0.035), rgba(22, 20, 14, 0.035) 3px, transparent 3px, transparent 7px)",
                  border: "1px dashed var(--hairline-strong)",
                  borderRadius: "var(--radius-md)"
                }}
              >
                <strong style={{ display: "block", fontSize: "13px" }}>{candidate.heading}</strong>
                <p style={{ margin: "4px 0", color: "var(--ink-muted)", fontFamily: "var(--font-mono)", fontSize: "11px", overflowWrap: "anywhere" }}>
                  Line {candidate.line} · {candidate.evidence}
                </p>
                <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "12px" }}>
                  Missing canonical fields:{" "}
                  <span>{candidate.missingCanonicalFields.join(", ") || "None reported"}</span>
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function DocumentHealth({
  documents,
  source,
  projectSlug
}: {
  documents: DocumentTriage[];
  source: PlanningSourceState;
  projectSlug: string;
}) {
  const headingId = useId();
  const allCanonical = documents.length > 0 && documents.every((document) => document.state === "canonical");
  const hasDegradedDocument = documents.length === 0 || documents.some((document) => document.state !== "canonical");
  const authority = source.writable
    ? "Existing Backlog priority/rank writes allowed"
    : hasDegradedDocument
      ? "Read only · copy handoff only"
      : "Read only · no planning writes";

  return (
    <section
      aria-labelledby={headingId}
      style={{
        display: "grid",
        gap: "12px",
        margin: "0 0 20px",
        padding: "16px",
        background: "var(--paper-raised)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-md)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <h2 id={headingId} style={{ margin: 0, color: "var(--ink)", fontSize: "16px", letterSpacing: "-0.01em" }}>
          Planning document health
        </h2>
        <span className="custody-badge custody-badge--repo">
          <span>{modeLabels[source.mode]}</span>
          <span aria-hidden="true">·</span>
          <span>{source.writable ? "Field-limited write source" : "Read-only source"}</span>
        </span>
      </div>

      <dl
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 18px",
          margin: 0,
          color: "var(--ink-muted)",
          fontSize: "10.5px"
        }}
      >
        <div style={{ display: "flex", gap: "6px", minWidth: 0 }}>
          <dt style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>Read at</dt>
          <dd style={{ margin: 0, overflowWrap: "anywhere", fontFamily: "var(--font-mono)" }}>{source.readAt}</dd>
        </div>
        <div style={{ display: "flex", gap: "6px", minWidth: 0 }}>
          <dt style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>Authority</dt>
          <dd style={{ margin: 0 }}>{authority}</dd>
        </div>
      </dl>

      {source.reason && (
        <p style={{ margin: 0, padding: "8px 10px", background: "var(--rust-soft)", border: "1px solid var(--rust-border)", borderRadius: "var(--radius-sm)", color: "var(--ink)", fontSize: "12.5px" }}>
          <strong>Source reason:</strong> {source.reason}
        </p>
      )}

      {documents.length === 0 && (
        <div style={{ display: "grid", gap: "10px" }}>
          <div role="status">
            <span className="badge badge--blocked">Source unavailable</span>
            <span style={{ marginLeft: "8px", color: "var(--ink-muted)", fontSize: "13px" }}>
              Planning document evidence is not available from this source.
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <code style={{ color: "var(--ink)", fontSize: "10.5px" }}>docs/ROADMAP.md</code>
            <code style={{ color: "var(--ink)", fontSize: "10.5px" }}>docs/BACKLOG.md</code>
          </div>
        </div>
      )}

      {allCanonical && (
        <div role="status" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <span className="badge badge--active">Canonical</span>
          <span style={{ color: "var(--ink-muted)", fontSize: "13px" }}>
            Roadmap and Backlog documents are canonical planning data.
          </span>
        </div>
      )}

      {documents.map((document) => (
        <article key={document.document} style={{ display: "grid", gap: "12px", paddingTop: "4px" }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <h3 style={{ margin: 0, color: "var(--ink)", fontSize: "14.5px", textTransform: "capitalize" }}>
              {document.document === "roadmap" ? "Roadmap" : "Backlog"} document
            </h3>
            <span
              role={allCanonical ? undefined : "status"}
              className={`badge ${document.state === "canonical" ? "badge--active" : "badge--blocked"}`}
            >
              {stateLabels[document.state]}
            </span>
          </header>

          <DocumentFacts document={document} source={source} />
          {document.state !== "canonical" && (
            <>
              <DocumentEvidence document={document} />
              <HandoffAction document={document} source={source} projectSlug={projectSlug} />
            </>
          )}
        </article>
      ))}
    </section>
  );
}
