"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { proposeRestoreAction, restoreProjectAction } from "@/app/actions/projects";
import type { LifecycleProposal } from "@/lib/planning/registry/proposal";

export function RestoreProjectControl({
  slug,
  children
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [proposal, setProposal] = useState<LifecycleProposal | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handlePropose = async () => {
    setIsPending(true);
    setMsg(null);

    try {
      const res = await proposeRestoreAction(slug);
      if (res.status === "success") {
        setProposal(res.data);
        setConfirmationInput("");
      } else {
        setMsg(`Error: ${res.message}`);
      }
    } catch {
      setMsg("Error: failed to prepare the restore proposal");
    } finally {
      setIsPending(false);
    }
  };

  const handleRestore = async () => {
    if (!proposal || confirmationInput !== slug) return;
    setIsPending(true);
    setMsg(null);

    try {
      const res = await restoreProjectAction(slug, proposal.proposalDigest, slug);
      if (res.status === "success") {
        setProposal(null);
        router.refresh();
      } else {
        setMsg(`Error: ${res.message}`);
      }
    } catch {
      setMsg("Error: failed to restore the project");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {children}
        {!proposal && (
          <button type="button" className="btn" disabled={isPending} onClick={handlePropose}>
            {isPending ? "Preparing…" : "Restore Project"}
          </button>
        )}
      </div>

      {msg && (
        <div style={{ background: "var(--rust-soft)", border: "1px solid var(--rust-border)", padding: "10px 14px", borderRadius: "var(--radius-sm)", color: "var(--rust)", fontSize: "13px" }}>
          {msg}
        </div>
      )}

      {proposal && (
        <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--ink-faint)" }}>
            Proposal Digest: <code>{proposal.proposalDigest}</code>
          </div>

          {proposal.blockers.length > 0 && (
            <div style={{ background: "var(--rust-soft)", border: "1px solid var(--rust-border)", padding: "14px", borderRadius: "var(--radius-md)" }}>
              <strong style={{ color: "var(--rust)", fontSize: "13px" }}>Issues to Resolve:</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: "20px", fontSize: "13px", color: "var(--rust)" }}>
                {proposal.blockers.map((b, i) => (
                  <li key={i}>[{b.code}] {b.message}</li>
                ))}
              </ul>
            </div>
          )}

          {proposal.warnings.length > 0 && (
            <div style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-border)", padding: "14px", borderRadius: "var(--radius-md)" }}>
              <strong style={{ color: "var(--amber-ink)", fontSize: "13px" }}>Warnings:</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: "20px", fontSize: "13px" }}>
                {proposal.warnings.map((w, i) => (
                  <li key={i}>[{w.code}] {w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {proposal.blockers.length === 0 && (
            <div>
              <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "6px" }}>
                Type project slug <strong>{slug}</strong> to confirm restore:
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="text"
                  placeholder={slug}
                  value={confirmationInput}
                  onChange={e => setConfirmationInput(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)", fontFamily: "var(--font-mono)" }}
                />
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={confirmationInput !== slug || isPending}
                  onClick={handleRestore}
                >
                  {isPending ? "Restoring…" : "Confirm Restore"}
                </button>
                <button type="button" className="btn" onClick={() => setProposal(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
