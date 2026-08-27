"use client";

import Link from "next/link";
import React, { useState } from "react";
import { refreshProjectAction } from "@/app/actions/refresh";
import type { ProjectDetailView } from "@/lib/planning/queries/project";
import { BacklogView } from "./backlog-view";
import { NativeTaskForm } from "./native-task-form";
import { ProvenancePanel } from "./provenance-panel";
import { RoadmapView } from "./roadmap-view";
import { TaskList } from "./task-list";

export function ProjectDetail({
  detail
}: {
  detail: ProjectDetailView;
}) {
  const { project, roadmap, backlog, tasks, issues, provenance, metrics } = detail;
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
      <div className="view-header" style={{ alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span className={`badge ${isCode ? "badge--p1" : "badge--active"}`}>
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

        <div style={{ display: "flex", gap: "10px" }}>
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

      {/* Tabs Navigation */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--hairline)",
          gap: "8px",
          marginBottom: "20px"
        }}
      >
        <button
          type="button"
          className="btn"
          style={{
            border: 0,
            borderBottom: activeTab === "roadmap" ? "2px solid var(--amber)" : "none",
            borderRadius: 0,
            background: "transparent",
            fontWeight: activeTab === "roadmap" ? 700 : 500
          }}
          onClick={() => setActiveTab("roadmap")}
        >
          Roadmap ({roadmap.length})
        </button>

        {isCode && (
          <button
            type="button"
            className="btn"
            style={{
              border: 0,
              borderBottom: activeTab === "backlog" ? "2px solid var(--amber)" : "none",
              borderRadius: 0,
              background: "transparent",
              fontWeight: activeTab === "backlog" ? 700 : 500
            }}
            onClick={() => setActiveTab("backlog")}
          >
            Backlog ({backlog.length})
          </button>
        )}

        <button
          type="button"
          className="btn"
          style={{
            border: 0,
            borderBottom: activeTab === "tasks" ? "2px solid var(--amber)" : "none",
            borderRadius: 0,
            background: "transparent",
            fontWeight: activeTab === "tasks" ? 700 : 500
          }}
          onClick={() => setActiveTab("tasks")}
        >
          Tasks ({tasks.length})
        </button>

        <button
          type="button"
          className="btn"
          style={{
            border: 0,
            borderBottom: activeTab === "provenance" ? "2px solid var(--amber)" : "none",
            borderRadius: 0,
            background: "transparent",
            fontWeight: activeTab === "provenance" ? 700 : 500
          }}
          onClick={() => setActiveTab("provenance")}
        >
          Provenance ({provenance.length})
        </button>
      </div>

      {/* Active Tab View */}
      {activeTab === "roadmap" && <RoadmapView items={roadmap} isCodeProject={isCode} />}
      {activeTab === "backlog" && isCode && (
        <BacklogView
          items={backlog}
          projectSlug={project.slug}
          onCreateTaskForBacklog={handleCreateTaskForBacklog}
        />
      )}
      {activeTab === "tasks" && <TaskList tasks={tasks} filterProject={project.slug} />}
      {activeTab === "provenance" && <ProvenancePanel provenance={provenance} />}

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
