import Link from "next/link";
import React from "react";
import type { ProjectDetailView } from "@/lib/planning/queries/project";
import { StatePanel } from "./state-panel";

function documentHealthSummary(documents: ProjectDetailView["documents"]) {
  if (documents.length === 0) return "Planning docs: unavailable";
  if (documents.every((document) => document.state === "canonical")) {
    return "Planning docs: canonical";
  }

  const missing = documents.filter((document) => document.state === "missing").length;
  if (missing > 0) return `Planning docs: ${missing} missing`;

  const unavailable = documents.filter((document) => document.state === "unavailable").length;
  if (unavailable > 0) return `Planning docs: ${unavailable} unavailable`;

  return `Planning docs: ${documents.filter((document) => document.state !== "canonical").length} needs review`;
}

function documentMetric(
  kind: "roadmap" | "backlog",
  documents: ProjectDetailView["documents"],
  count: number
) {
  if (documents.length === 0) return `${kind === "roadmap" ? "Roadmap" : "Backlog"}: Source unavailable`;
  const state = documents.find((document) => document.document === kind)?.state;
  const label = kind === "roadmap" ? "Roadmap" : "Backlog";
  if (state === "missing") return `${label}: Missing document`;
  if (state === "unavailable") return `${label}: Source unavailable`;
  return `${label}: ${count}`;
}

export function ProjectList({ projects }: { projects: ProjectDetailView[] }) {
  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Projects</h1>
          <p className="view-subtitle">Federated workspace registry across code repositories and native business initiatives.</p>
        </div>
        <Link href="/register" className="btn btn--primary">
          + Register Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <StatePanel
          title="No projects registered"
          description="Register your first code repository or business project to begin planning."
          actionText="Register Project"
          actionHref="/register"
        />
      ) : (
        <div className="projects-grid">
          {projects.map(p => {
            const isCode = p.project.type === "code";
            const activePhase = p.roadmap.find(r => r.status === "active");

            return (
              <Link
                key={p.project.slug}
                href={`/projects/${p.project.slug}`}
                className="project-card"
              >
                <div>
                  <div className="project-card__header">
                    <span className={`badge ${isCode ? "badge--type" : "badge--active"}`}>
                      {p.project.type.toUpperCase()}
                    </span>
                    <span className={isCode ? "custody-badge custody-badge--repo" : "custody-badge custody-badge--native"}>
                      {isCode ? "REPO: GIT-MIRROR" : "NATIVE: CONTROL-HOST"}
                    </span>
                  </div>

                  <h2 className="project-card__title">{p.project.name}</h2>
                  <p className="project-card__desc">
                    {activePhase ? `Active: ${activePhase.title}` : "No active phase"}
                  </p>
                  {isCode && (
                    <>
                      <p className="project-card__desc" style={{ marginTop: "8px", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                        {documentHealthSummary(p.documents)}
                      </p>
                      <p className="project-card__desc" style={{ marginTop: "4px", display: "flex", flexWrap: "wrap", gap: "4px 12px", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                        <span>{documentMetric("roadmap", p.documents, p.roadmap.length)}</span>
                        <span>{documentMetric("backlog", p.documents, p.metrics.totalBacklog)}</span>
                      </p>
                    </>
                  )}
                </div>

                <div className="project-card__footer">
                  <span>
                    {p.metrics.activeTasks} Active Tasks
                  </span>
                  <span>{p.project.slug}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
