"use client";

import Link from "next/link";
import React, { useState } from "react";
import type { Task, TaskStatus } from "@/lib/planning/domain/types";
import { updateTaskAction } from "@/app/actions/native-planning";
import { StatePanel } from "./state-panel";

export function TaskList({
  tasks,
  filterProject,
  digest
}: {
  tasks: Task[];
  filterProject?: string;
  digest?: string;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [taskList, setTaskList] = useState<Task[]>(tasks);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const filteredTasks = taskList.filter(t => {
    if (filterProject && t.project !== filterProject) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    const previousStatus = task.status;
    setRowError(null);
    setPendingId(task.id);
    // Optimistic update
    setTaskList(list => list.map(t => (t.id === task.id ? { ...t, status: newStatus } : t)));

    const revert = () =>
      setTaskList(list => list.map(t => (t.id === task.id ? { ...t, status: previousStatus } : t)));

    try {
      const res = await updateTaskAction({
        project: task.project,
        taskId: task.id,
        patch: { status: newStatus },
        expectedDigest: digest
      });
      if (res.status === "error") {
        revert();
        setRowError({ id: task.id, message: `Update failed: ${res.message}` });
      }
    } catch {
      revert();
      setRowError({ id: task.id, message: "Update failed: network or server error — change was not saved." });
    } finally {
      setPendingId(null);
    }
  };

  const hasAnyTasks = taskList.some(t => (filterProject ? t.project === filterProject : true));

  return (
    <div>
      {/* Filter Chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
        {["all", "doing", "todo", "waiting", "blocked", "done"].map(st => (
          <button
            key={st}
            type="button"
            className={`btn ${statusFilter === st ? "btn--primary" : ""}`}
            style={{ padding: "4px 12px", fontSize: "12px", textTransform: "capitalize" }}
            onClick={() => setStatusFilter(st)}
          >
            {st} ({taskList.filter(t => (filterProject ? t.project === filterProject : true) && (st === "all" || t.status === st)).length})
          </button>
        ))}
      </div>

      {filteredTasks.length === 0 ? (
        hasAnyTasks ? (
          <StatePanel
            title="No tasks match the filter"
            description="Try switching the status filter above."
          />
        ) : (
          <StatePanel
            title="No tasks yet"
            description={
              filterProject
                ? "This project has no tasks. Create a native task to get started."
                : "No tasks exist across your projects yet. Create a native task from a project page to get started."
            }
          />
        )
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th style={{ width: "120px" }}>Task ID</th>
              <th>Title</th>
              {!filterProject && <th style={{ width: "130px" }}>Project</th>}
              <th style={{ width: "120px" }}>Status</th>
              <th style={{ width: "180px" }}>Relation / Context</th>
              <th style={{ width: "140px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map(t => (
              <tr key={t.id}>
                <td data-label="Task ID" style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "12px" }}>
                  {t.id}
                </td>
                <td data-label="Title" style={{ fontWeight: 500 }}>
                  {t.title}
                </td>
                {!filterProject && (
                  <td data-label="Project">
                    <Link href={`/projects/${t.project}`} className="badge badge--active">
                      {t.project}
                    </Link>
                  </td>
                )}
                <td data-label="Status">
                  <span className={`badge badge--${t.status}`}>
                    {t.status.toUpperCase()}
                  </span>
                </td>
                <td data-label="Relation / Context" style={{ fontSize: "12px", color: "var(--ink-faint)" }}>
                  {t.backlog ? `Backlog: ${t.backlog}` : t.roadmap_item ? `Phase: ${t.roadmap_item}` : t.work_mode || "—"}
                  {t.blocked_reason && <div style={{ color: "var(--rust)" }}>{t.blocked_reason}</div>}
                  {t.waiting_on && <div style={{ color: "var(--amber-ink)" }}>Waiting: {t.waiting_on}</div>}
                </td>
                <td data-label="Actions">
                  {t.source?.provider === "native" ? (
                    <div>
                      <select
                        value={t.status}
                        onChange={e => handleStatusChange(t, e.target.value as TaskStatus)}
                        disabled={pendingId === t.id}
                        aria-busy={pendingId === t.id}
                        style={{
                          padding: "3px 6px",
                          fontSize: "11.5px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--hairline-strong)",
                          background: "var(--paper-raised)"
                        }}
                        aria-label={`Change status for ${t.id}`}
                      >
                        <option value="todo">TODO</option>
                        <option value="doing">DOING</option>
                        <option value="waiting">WAITING</option>
                        <option value="blocked">BLOCKED</option>
                        <option value="done">DONE</option>
                      </select>
                      {pendingId === t.id && (
                        <div style={{ fontSize: "11px", color: "var(--ink-faint)", marginTop: "4px" }}>
                          Saving…
                        </div>
                      )}
                      {rowError?.id === t.id && (
                        <div role="alert" style={{ fontSize: "11.5px", color: "var(--rust)", marginTop: "4px" }}>
                          {rowError.message}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="custody-badge custody-badge--repo">READ ONLY</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
