import Link from "next/link";
import React from "react";
import type { ProjectDetailView } from "@/lib/planning/queries/project";
import { StatePanel } from "./state-panel";

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
                </div>

                <div className="project-card__footer">
                  <span>
                    {isCode ? `${p.metrics.totalBacklog} Backlog · ` : ""}
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
