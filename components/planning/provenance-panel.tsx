import React from "react";
import type { SourceProvenance } from "@/lib/planning/providers/contracts";

export function ProvenancePanel({ provenance }: { provenance: SourceProvenance[] }) {
  if (provenance.length === 0) {
    return (
      <div style={{ padding: "16px", background: "var(--paper-raised)", borderRadius: "var(--radius-md)", border: "1px solid var(--hairline)" }}>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-muted)" }}>
          No external source provenance recorded for this project.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {provenance.map((p, i) => (
        <div
          key={i}
          style={{
            background: "var(--paper-raised)",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-md)",
            padding: "14px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: "12.5px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontWeight: 600, color: "var(--ink)" }}>{p.location}</span>
            <span className={p.provider === "native" ? "custody-badge custody-badge--native" : "custody-badge custody-badge--repo"}>
              {p.provider.toUpperCase()}
            </span>
          </div>
          <div style={{ color: "var(--ink-faint)", fontSize: "11.5px", lineHeight: "1.6" }}>
            <div>Revision: {p.revision}</div>
            {p.digest && <div>SHA-256 Digest: {p.digest}</div>}
            <div>Fetched: {new Date(p.fetchedAt).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
