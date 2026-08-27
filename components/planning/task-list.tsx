"use client";

import Link from "next/link";
import React, { useState } from "react";
import type { Task } from "@/lib/planning/domain/types";
import { updateTaskAction } from "@/app/actions/native-planning";
import { StatePanel } from "./state-panel";

export function TaskList({
  tasks,
  filterProject
}: {
  tasks: Task[];
  filterProject?: string;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [taskList, setTaskList] = useState<Task[]>(tasks);

  const filteredTasks = taskList.filter(t => {
    if (filterProject && t.project !== filterProject) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  const handleStatusChange = async (task: Task, newStatus: any) => {
    const updated = taskList.map(t => (t.id === task.id ? { ...t, status: newStatus } : t));
    setTaskList(updated);

    try {
      await updateTaskAction({
        project: task.project,
        taskId: task.id,
        patch: { status: newStatus }
      });
    } catch {
      // Revert on error
      setTaskList(tasks);
    }
  };

  return (
    <div>
      {/* Filter Chips */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
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
        <StatePanel
          title="No tasks match the filter"
          description="Try switching the status filter above."
        />
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
                <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "12px" }}>
                  {t.id}
                </td>
                <td style={{ fontWeight: 500 }}>
                  {t.title}
                </td>
                {!filterProject && (
                  <td>
                    <Link href={`/projects/${t.project}`} className="badge badge--active">
                      {t.project}
                    </Link>
                  </td>
                )}
                <td>
                  <span className={`badge badge--${t.status}`}>
                    {t.status.toUpperCase()}
                  </span>
                </td>
                <td style={{ fontSize: "12px", color: "var(--ink-faint)" }}>
                  {t.backlog ? `Backlog: ${t.backlog}` : t.roadmap_item ? `Phase: ${t.roadmap_item}` : t.work_mode || "—"}
                  {t.blocked_reason && <div style={{ color: "var(--rust)" }}>{t.blocked_reason}</div>}
                  {t.waiting_on && <div style={{ color: "var(--amber-ink)" }}>Waiting: {t.waiting_on}</div>}
                </td>
                <td>
                  {t.source?.provider === "native" ? (
                    <select
                      value={t.status}
                      onChange={e => handleStatusChange(t, e.target.value)}
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
