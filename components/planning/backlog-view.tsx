"use client";

import React, { useState } from "react";
import type { BacklogItem } from "@/lib/planning/domain/types";
import { StatePanel } from "./state-panel";

export function BacklogView({
  items,
  projectSlug,
  onCreateTaskForBacklog
}: {
  items: BacklogItem[];
  projectSlug: string;
  onCreateTaskForBacklog?: (backlogId: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <StatePanel
        title="No backlog items"
        description="Add implementation tasks to docs/BACKLOG.md in your repository."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {items.map(item => {
        const isExpanded = expandedId === item.id;
        const priorityBadge = item.priority === "P0" ? "badge--p0" : item.priority === "P1" ? "badge--p1" : "badge--p2";

        return (
          <div
            key={item.id}
            style={{
              background: "var(--paper-raised)",
              border: `1px solid ${isExpanded ? "var(--ink)" : "var(--hairline)"}`,
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              transition: "border-color 0.15s var(--ease), box-shadow 0.15s var(--ease)",
              boxShadow: isExpanded ? "0 4px 12px rgba(22, 20, 14, 0.08)" : "0 1px 2px rgba(22, 20, 14, 0.04)"
            }}
          >
            {/* Header Row / Trigger */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                cursor: "pointer",
                userSelect: "none"
              }}
              role="button"
              aria-expanded={isExpanded}
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedId(isExpanded ? null : item.id);
                }
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "12px", color: "var(--ink)" }}>
                  {item.id}
                </span>
                <span className={`badge ${priorityBadge}`}>{item.priority}</span>
                <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--ink)" }}>
                  {item.title}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {item.phase && (
                  <span className="badge badge--active" style={{ fontSize: "10.5px" }}>
                    Phase: {item.phase}
                  </span>
                )}
                <span className={`badge badge--${item.status}`}>
                  {item.status.toUpperCase()}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--ink-faint)" }}>
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>
            </div>

            {/* Expandable Accordion Drawer */}
            {isExpanded && (
              <div
                style={{
                  padding: "16px 20px 20px",
                  borderTop: "1px solid var(--hairline-faint)",
                  background: "#faf7ed"
                }}
              >
                {item.body && (
                  <div style={{ marginBottom: "16px", fontSize: "13.5px", color: "var(--ink)", lineHeight: 1.6 }}>
                    {item.body}
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: "var(--ink-muted)",
                    marginBottom: "16px",
                    background: "var(--paper-recessed)",
                    padding: "12px",
                    borderRadius: "var(--radius-sm)"
                  }}
                >
                  <div>
                    <strong>Work Mode:</strong> {item.work_mode}
                  </div>
                  <div>
                    <strong>Phase:</strong> {item.phase || "—"}
                  </div>
                  <div>
                    <strong>Owner:</strong> {item.owner || "Unassigned"}
                  </div>
                  <div>
                    <strong>Dependencies:</strong> {item.dependencies.length > 0 ? item.dependencies.join(", ") : "None"}
                  </div>
                </div>

                {item.done_when && (
                  <div style={{ marginBottom: "16px", fontSize: "12.5px" }}>
                    <strong style={{ color: "var(--ink)" }}>Definition of Done:</strong>
                    <div style={{ color: "var(--ink-muted)", marginTop: "4px" }}>{item.done_when}</div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  {onCreateTaskForBacklog && (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => onCreateTaskForBacklog(item.id)}
                    >
                      + Create Native Task for this Backlog
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
