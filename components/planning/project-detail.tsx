"use client";

import React, { useState } from "react";
import { refreshProjectAction } from "@/app/actions/refresh";
import type { ProjectDetailView } from "@/lib/planning/queries/project";
import { BacklogProposalForm } from "./backlog-proposal-form";
import { BacklogView } from "./backlog-view";
import { DocumentHealth } from "./document-health";
import { NativeTaskForm } from "./native-task-form";
import { ProvenancePanel } from "./provenance-panel";
import { RoadmapView } from "./roadmap-view";
import { TaskList } from "./task-list";

export function ProjectDetail({
  detail
}: {
  detail: ProjectDetailView;
}) {
  const { project, roadmap, backlog, tasks, provenance } = detail;
  const isCode = project.type === "code";
  const [activeTab, setActiveTab] = useState<"roadmap" | "backlog" | "tasks" | "provenance">("roadmap");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [prefilledBacklogId, setPrefilledBacklogId] = useState<string | undefined>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const handleCreateTaskForBacklog = (backlogId: string) => {
    setPrefilledBacklogId(backlogId);
    setShowTaskModal(true);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await refreshProjectAction(project.slug);
      setRefreshMsg(res.message);
    } catch (err: any) {
      setRefreshMsg(`Refresh failed: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div>
      {/* Project Header */}
      <div className="view-header view-header--center">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span className={`badge ${isCode ? "badge--type" : "badge--active"}`}>
              {project.type.toUpperCase()}
            </span>
            <span className={isCode ? "custody-badge custody-badge--repo" : "custody-badge custody-badge--native"}>
              {isCode ? "REPO: GIT-MIRROR" : "NATIVE: CONTROL-HOST"}
            </span>
            {project.archived && <span className="badge badge--blocked">ARCHIVED</span>}
          </div>
          <h1 className="view-title" style={{ margin: 0 }}>
            {project.name}
          </h1>
          <p className="view-subtitle" style={{ marginTop: "4px" }}>
            Slug: <code style={{ fontFamily: "var(--font-mono)" }}>{project.slug}</code> · Work modes: {project.work_modes.join(", ")}
          </p>
        </div>

        <div className="view-header__actions">
          {isCode && (
            <button
              type="button"
              className="btn"
              onClick={handleRefresh}
              disabled={isRefreshing || project.archived}
            >
              {isRefreshing ? "Syncing..." : "↻ Refresh Mirror"}
            </button>
          )}
          {!project.archived && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setPrefilledBacklogId(undefined);
                setShowTaskModal(true);
              }}
            >
              + Create Native Task
            </button>
          )}
        </div>
      </div>

      {refreshMsg && (
        <div style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-border)", padding: "8px 14px", borderRadius: "var(--radius-sm)", fontSize: "12.5px", marginBottom: "16px" }}>
          {refreshMsg}
        </div>
      )}

      {isCode && detail.planningSource && (
        <DocumentHealth
          documents={detail.documents}
          source={detail.planningSource}
          projectSlug={project.slug}
        />
      )}

      {/* Tabs Navigation */}
      <div
        role="tablist"
        aria-label="Project sections"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--hairline)",
          gap: "8px",
          marginBottom: "20px",
          overflowX: "auto"
        }}
      >
        {(
          [
            { key: "roadmap", label: `Roadmap (${roadmap.length})`, show: true },
            { key: "backlog", label: `Backlog (${backlog.length})`, show: isCode },
            { key: "tasks", label: `Tasks (${tasks.length})`, show: true },
            { key: "provenance", label: `Provenance (${provenance.length})`, show: true }
          ] as const
        )
          .filter(tab => tab.show)
          .map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={activeTab === tab.key}
              aria-controls={`tabpanel-${tab.key}`}
              className="btn"
              style={{
                border: 0,
                borderBottom: activeTab === tab.key ? "2px solid var(--amber)" : "none",
                borderRadius: 0,
                background: "transparent",
                fontWeight: activeTab === tab.key ? 700 : 500,
                whiteSpace: "nowrap"
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
      </div>

      {/* Active Tab View */}
      <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === "roadmap" && <RoadmapView items={roadmap} isCodeProject={isCode} />}
        {activeTab === "backlog" && isCode && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <BacklogView
              items={backlog}
              projectSlug={project.slug}
              control={detail.backlogControl}
              onCreateTaskForBacklog={handleCreateTaskForBacklog}
            />
            <BacklogProposalForm projectSlug={project.slug} source={detail.backlogControl?.source} />
          </div>
        )}
        {activeTab === "tasks" && <TaskList tasks={tasks} filterProject={project.slug} digest={detail.digest} />}
        {activeTab === "provenance" && <ProvenancePanel provenance={provenance} />}
      </div>

      {/* Task Creation Modal */}
      {showTaskModal && (
        <NativeTaskForm
          projectSlug={project.slug}
          defaultBacklogId={prefilledBacklogId}
          onClose={() => setShowTaskModal(false)}
        />
      )}
    </div>
  );
}
