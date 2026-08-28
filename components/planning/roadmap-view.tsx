import React from "react";
import type { RoadmapItem } from "@/lib/planning/domain/types";
import { InlineMarkdown, Markdown } from "./markdown";
import { StatePanel } from "./state-panel";

export function RoadmapView({
  items,
  isCodeProject
}: {
  items: RoadmapItem[];
  isCodeProject: boolean;
}) {
  if (items.length === 0) {
    return (
      <StatePanel
        title={`No ${isCodeProject ? "phases" : "milestones"} defined`}
        description={
          isCodeProject
            ? "Add development phases to docs/ROADMAP.md in your repository."
            : "Create your first business milestone."
        }
      />
    );
  }

  const sortedItems = [...items].sort((a, b) => a.order - b.order);

  return (
    <div className="roadmap-timeline-v" style={{ position: "relative", padding: "16px 0 16px 24px" }}>
      {/* Vertical line */}
      <div
        style={{
          position: "absolute",
          top: "24px",
          bottom: "24px",
          left: "31px",
          width: "2px",
          background: "var(--hairline-strong)",
          zIndex: 0
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "24px", position: "relative", zIndex: 1 }}>
        {sortedItems.map(item => {
          const isActive = item.status === "active";
          const isDone = item.status === "done";

          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "16px"
              }}
            >
              {/* Node Icon */}
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  marginTop: "16px",
                  background: isActive ? "var(--amber)" : isDone ? "var(--green)" : "var(--paper-raised)",
                  border: `2px solid ${isActive ? "var(--amber-border)" : isDone ? "var(--green-border)" : "var(--hairline-strong)"}`,
                  boxShadow: isActive ? "0 0 0 4px var(--amber-soft)" : "none",
                  flexShrink: 0
                }}
              />

              {/* Card */}
              <div
                style={{
                  flex: 1,
                  background: "var(--paper-raised)",
                  border: `1px solid ${isActive ? "var(--amber-border)" : "var(--hairline)"}`,
                  borderRadius: "var(--radius-md)",
                  padding: "16px",
                  boxShadow: "0 1px 2px rgba(22, 20, 14, 0.04)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "var(--ink-faint)" }}>
                      #{item.order}
                    </span>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>
                      <InlineMarkdown text={item.title} />
                    </h3>
                    {item.focus === "primary" && (
                      <span className="badge badge--active">PRIMARY FOCUS</span>
                    )}
                  </div>
                  <span className={`badge ${isActive ? "badge--active" : isDone ? "badge--done" : "badge--p2"}`}>
                    {item.status.toUpperCase()}
                  </span>
                </div>

                {item.summary && (
                  <div style={{ margin: "0 0 10px", fontSize: "13.5px", color: "var(--ink-muted)", lineHeight: 1.5 }}>
                    <Markdown text={item.summary} />
                  </div>
                )}

                <div style={{ display: "flex", gap: "16px", fontSize: "11.5px", fontFamily: "var(--font-mono)", color: "var(--ink-faint)" }}>
                  <span>ID: {item.id}</span>
                  {item.target && <span>Target: {item.target}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
