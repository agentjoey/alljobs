import Link from "next/link";
import React from "react";
import type { PortfolioOverview as PortfolioOverviewData } from "@/lib/planning/queries/portfolio";
import { StatePanel } from "./state-panel";

export function PortfolioOverview({ data }: { data: PortfolioOverviewData }) {
  const { projects, ongoingTasks, attentionItems, kpis } = data;

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Personal Workbench</h1>
          <p className="view-subtitle">Cross-project planning overview, active priorities, and sync status.</p>
        </div>
        <Link href="/register" className="btn btn--primary">
          + Register Project
        </Link>
      </div>

      {/* 4 Top KPI Cards */}
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-label">Active Projects</div>
          <div className="metric-value">{kpis.activeProjects}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Ongoing Work</div>
          <div className="metric-value">{kpis.ongoingWork}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Attention Required</div>
          <div className="metric-value" style={{ color: kpis.attentionRequired > 0 ? "var(--rust)" : "inherit" }}>
            {kpis.attentionRequired}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Completed Recent</div>
          <div className="metric-value" style={{ color: kpis.completedRecent > 0 ? "var(--green)" : "inherit" }}>{kpis.completedRecent}</div>
        </div>
      </div>

      {/* Attention Callouts */}
      {attentionItems.length > 0 && (
        <div style={{ marginBottom: "28px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 12px", color: "var(--ink)" }}>
            Attention Required ({attentionItems.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {attentionItems.map(item => (
              <div
                key={item.id}
                style={{
                  background: item.severity === "critical" ? "var(--rust-soft)" : "var(--amber-soft)",
                  border: `1px solid ${item.severity === "critical" ? "var(--rust-border)" : "var(--amber-border)"}`,
                  borderRadius: "var(--radius-md)",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <div>
                  <span
                    className={`badge ${item.severity === "critical" ? "badge--blocked" : "badge--active"}`}
                    style={{ marginRight: "8px" }}
                  >
                    {item.project}
                  </span>
                  <strong style={{ fontSize: "13.5px", color: "var(--ink)" }}>{item.title}</strong>
                  <span style={{ marginLeft: "8px", fontSize: "13px", color: "var(--ink-muted)" }}>
                    {item.message}
                  </span>
                </div>
                <Link href={`/projects/${item.project}`} className="btn" style={{ padding: "4px 10px", fontSize: "12px" }}>
                  View
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ongoing Work Queue */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--ink)" }}>
            Ongoing Work Queue ({ongoingTasks.length})
          </h2>
          <Link href="/tasks" style={{ fontSize: "13px", color: "var(--ink)", fontWeight: 600 }}>
            View All Tasks →
          </Link>
        </div>

        {ongoingTasks.length === 0 ? (
          <StatePanel
            title="No ongoing tasks"
            description="You have no tasks currently marked as doing, waiting, or blocked."
            actionText="Browse Projects"
            actionHref="/projects"
          />
        ) : (
          <table className="ledger-table">
            <thead>
              <tr>
                <th style={{ width: "120px" }}>Task ID</th>
                <th>Title</th>
                <th style={{ width: "140px" }}>Project</th>
                <th style={{ width: "100px" }}>Status</th>
                <th style={{ width: "140px" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {ongoingTasks.map(t => (
                <tr key={t.id}>
                  <td data-label="Task ID" style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "12px" }}>
                    {t.id}
                  </td>
                  <td data-label="Title">
                    <Link href={`/projects/${t.project}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}>
                      {t.title}
                    </Link>
                  </td>
                  <td data-label="Project">
                    <span className="badge badge--active">{t.project}</span>
                  </td>
                  <td data-label="Status">
                    <span className={`badge badge--${t.status}`}>
                      {t.status.toUpperCase()}
                    </span>
                  </td>
                  <td data-label="Details" style={{ fontSize: "12px", color: "var(--ink-faint)" }}>
                    {t.blocked_reason ? `Blocked: ${t.blocked_reason}` : t.waiting_on ? `Waiting on: ${t.waiting_on}` : t.due ? `Due: ${t.due}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
