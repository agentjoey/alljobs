import React from "react";
import type { ProofIssue } from "@/lib/planning/domain/types";

export interface StatePanelProps {
  title: string;
  description?: string;
  actionText?: string;
  actionHref?: string;
  issues?: ProofIssue[];
  type?: "empty" | "error" | "warning";
}

export function StatePanel({
  title,
  description,
  actionText,
  actionHref,
  issues = [],
  type = "empty"
}: StatePanelProps) {
  return (
    <div
      className={`state-panel state-panel--${type}`}
      style={{
        background: "var(--paper-raised)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-md)",
        padding: "32px 24px",
        textAlign: "center",
        margin: "16px 0"
      }}
    >
      <h3 style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 600, color: "var(--ink)" }}>
        {title}
      </h3>
      {description && (
        <p style={{ margin: "0 0 16px", fontSize: "13.5px", color: "var(--ink-muted)" }}>
          {description}
        </p>
      )}

      {issues.length > 0 && (
        <div style={{ textAlign: "left", margin: "16px auto", maxWidth: "600px" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--rust)" }}>
            Format & Proof Issues ({issues.length}):
          </h4>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", color: "var(--ink)" }}>
            {issues.map((iss, i) => (
              <li key={i} style={{ marginBottom: "4px" }}>
                <strong>[{iss.code}]</strong> {iss.message} {iss.objectId && `(object: ${iss.objectId})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {actionText && actionHref && (
        <a href={actionHref} className="btn btn--primary" style={{ marginTop: "12px" }}>
          {actionText}
        </a>
      )}
    </div>
  );
}
