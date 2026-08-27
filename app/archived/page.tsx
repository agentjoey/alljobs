"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { restoreProjectAction } from "@/app/actions/projects";
import type { ProjectRegistryEntry } from "@/lib/planning/domain/types";
import { StatePanel } from "@/components/planning/state-panel";

export default function ArchivedPage() {
  const [archivedProjects, setArchivedProjects] = useState<ProjectRegistryEntry[]>([]);
  const [restoreSlug, setRestoreSlug] = useState<string | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleRestore = async (slug: string) => {
    if (confirmationInput !== slug) return;
    setIsPending(true);
    setMsg(null);

    try {
      // For quick restore with digest confirmation
      const res = await restoreProjectAction(slug, "", slug);
      if (res.status === "success") {
        setMsg(res.message);
        setArchivedProjects(archivedProjects.filter(p => p.slug !== slug));
        setRestoreSlug(null);
      } else {
        setMsg(`Error: ${res.message}`);
      }
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Archived Projects</h1>
          <p className="view-subtitle">Inactive projects retained in history. Native mutations and provider refresh are stopped.</p>
        </div>
      </div>

      {msg && (
        <div style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-border)", padding: "10px 14px", borderRadius: "var(--radius-sm)", fontSize: "13px", marginBottom: "16px" }}>
          {msg}
        </div>
      )}

      {archivedProjects.length === 0 ? (
        <StatePanel
          title="No archived projects"
          description="All registered projects are currently active."
          actionText="Browse Active Projects"
          actionHref="/projects"
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {archivedProjects.map(p => (
            <div
              key={p.slug}
              style={{
                background: "var(--paper-raised)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-md)",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <strong style={{ fontSize: "16px", color: "var(--ink)" }}>{p.name}</strong>
                  <span className="badge badge--blocked">ARCHIVED</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--ink-faint)", marginTop: "4px" }}>
                  Slug: {p.slug} · Type: {p.type}
                </div>
              </div>

              {restoreSlug === p.slug ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder={`Type ${p.slug}`}
                    value={confirmationInput}
                    onChange={e => setConfirmationInput(e.target.value)}
                    style={{ padding: "6px 10px", fontSize: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)", fontFamily: "var(--font-mono)" }}
                  />
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={confirmationInput !== p.slug || isPending}
                    onClick={() => handleRestore(p.slug)}
                  >
                    Confirm Restore
                  </button>
                  <button type="button" className="btn" onClick={() => setRestoreSlug(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setRestoreSlug(p.slug);
                    setConfirmationInput("");
                  }}
                >
                  Restore Project
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
