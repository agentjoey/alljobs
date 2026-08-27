"use client";

import React, { useState } from "react";
import { createTaskAction } from "@/app/actions/native-planning";

export function NativeTaskForm({
  projectSlug,
  defaultBacklogId,
  onClose,
  onSuccess
}: {
  projectSlug: string;
  defaultBacklogId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [taskId, setTaskId] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("todo");
  const [workMode, setWorkMode] = useState("implementation");
  const [backlog, setBacklog] = useState(defaultBacklogId || "");
  const [blockedReason, setBlockedReason] = useState("");
  const [waitingOn, setWaitingOn] = useState("");
  const [due, setDue] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.set("project", projectSlug);
    formData.set("id", taskId);
    formData.set("title", title);
    formData.set("status", status);
    formData.set("work_mode", workMode);
    if (backlog) formData.set("backlog", backlog);
    if (blockedReason) formData.set("blocked_reason", blockedReason);
    if (waitingOn) formData.set("waiting_on", waitingOn);
    if (due) formData.set("due", due);

    try {
      const res = await createTaskAction(formData);
      if (res.status === "success") {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(22, 20, 14, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "16px"
      }}
    >
      <div
        style={{
          background: "var(--paper-raised)",
          border: "1px solid var(--hairline-strong)",
          borderRadius: "var(--radius-lg)",
          maxWidth: "540px",
          width: "100%",
          padding: "24px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "var(--ink)" }}>
            Create Native Task ({projectSlug})
          </h2>
          <button type="button" onClick={onClose} className="btn" style={{ padding: "4px 8px" }}>
            ✕
          </button>
        </div>

        {errorMsg && (
          <div style={{ background: "var(--rust-soft)", border: "1px solid var(--rust-border)", padding: "10px", borderRadius: "var(--radius-sm)", color: "var(--rust)", fontSize: "13px", marginBottom: "16px" }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px", color: "var(--ink)" }}>
              Task ID (e.g. AJ-T-042) *
            </label>
            <input
              type="text"
              required
              placeholder="AJ-T-042"
              value={taskId}
              onChange={e => setTaskId(e.target.value)}
              style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)", fontFamily: "var(--font-mono)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px", color: "var(--ink)" }}>
              Title *
            </label>
            <input
              type="text"
              required
              placeholder="What needs to be done?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px", color: "var(--ink)" }}>
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)" }}
              >
                <option value="todo">TODO</option>
                <option value="doing">DOING</option>
                <option value="waiting">WAITING</option>
                <option value="blocked">BLOCKED</option>
                <option value="done">DONE</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px", color: "var(--ink)" }}>
                Work Mode
              </label>
              <select
                value={workMode}
                onChange={e => setWorkMode(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)" }}
              >
                <option value="implementation">Implementation</option>
                <option value="operations">Operations</option>
              </select>
            </div>
          </div>

          {backlog && (
            <div>
              <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px", color: "var(--ink)" }}>
                Bound Backlog ID
              </label>
              <input
                type="text"
                value={backlog}
                onChange={e => setBacklog(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)", fontFamily: "var(--font-mono)" }}
              />
            </div>
          )}

          {status === "blocked" && (
            <div>
              <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px", color: "var(--rust)" }}>
                Blocked Reason *
              </label>
              <input
                type="text"
                required
                placeholder="Why is this task blocked?"
                value={blockedReason}
                onChange={e => setBlockedReason(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--rust-border)" }}
              />
            </div>
          )}

          {status === "waiting" && (
            <div>
              <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px", color: "var(--amber-ink)" }}>
                Waiting On
              </label>
              <input
                type="text"
                placeholder="Who or what are you waiting for?"
                value={waitingOn}
                onChange={e => setWaitingOn(e.target.value)}
                style={{ width: "100%", padding: "8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--amber-border)" }}
              />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <button type="button" className="btn" onClick={onClose} disabled={isPending}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={isPending}>
              {isPending ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
