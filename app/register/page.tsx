"use client";

import { useRouter } from "next/navigation";
import React, { startTransition, useEffect, useState } from "react";
import { applyRegistrationAction, inspectProjectAction, listTrustedWorkspacesAction } from "@/app/actions/projects";
import { createSlugFieldState, updateSlugFromName, updateSlugManually } from "@/lib/planning/registry/slug";
import type { RegistrationProposal } from "@/lib/planning/registry/proposal";
import type { TrustedWorkspace } from "@/lib/planning/registry/trusted-workspaces";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "proposal">("form");
  const [slugField, setSlugField] = useState(createSlugFieldState);
  const [name, setName] = useState("");
  const [type, setType] = useState<"code" | "business">("code");
  const [candidatePath, setCandidatePath] = useState("");
  const [workspaces, setWorkspaces] = useState<TrustedWorkspace[]>([]);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [gitRemote, setGitRemote] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [workModes] = useState<string[]>(["implementation"]);

  const [proposal, setProposal] = useState<RegistrationProposal | null>(null);
  const [confirmationSlug, setConfirmationSlug] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const slug = slugField.value;

  useEffect(() => {
    let mounted = true;

    startTransition(() => {
      void listTrustedWorkspacesAction().then(result => {
        if (!mounted) return;
        if (result.status === "success") {
          setWorkspaces(result.data);
          return;
        }
        setWorkspaceLoadError(result.message);
      });
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.set("slug", slug);
    formData.set("name", name);
    formData.set("type", type);
    if (candidatePath) formData.set("candidatePath", candidatePath);
    if (gitRemote) formData.set("gitRemote", gitRemote);
    formData.set("gitBranch", gitBranch);
    for (const wm of workModes) {
      formData.append("workModes", wm);
    }

    try {
      const res = await inspectProjectAction(formData);
      if (res.status === "success") {
        setProposal(res.data);
        setStep("proposal");
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsPending(false);
    }
  };

  const handleApply = async () => {
    if (!proposal) return;
    setIsPending(true);
    setErrorMsg(null);

    try {
      const res = await applyRegistrationAction(
        JSON.stringify(proposal),
        proposal.proposalDigest,
        confirmationSlug
      );

      if (res.status === "success") {
        router.push(`/projects/${res.data.slug}`);
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
    <div style={{ maxWidth: "680px", margin: "0 auto" }}>
      <div className="view-header">
        <div>
          <h1 className="view-title">Add Project</h1>
          <p className="view-subtitle">Connect a local repository or create a business project in AllJobs.</p>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: "var(--rust-soft)", border: "1px solid var(--rust-border)", padding: "12px", borderRadius: "var(--radius-md)", color: "var(--rust)", fontSize: "13px", marginBottom: "16px" }}>
          {errorMsg}
        </div>
      )}

      {step === "form" ? (
        <form
          onSubmit={handleInspect}
          style={{
            background: "var(--paper-raised)",
            border: "1px solid var(--hairline)",
            borderRadius: "var(--radius-lg)",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
              Project Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. AllJobs Planning Core"
              value={name}
              onChange={e => {
                const projectName = e.target.value;
                setName(projectName);
                setSlugField(current => updateSlugFromName(current, projectName));
              }}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
              Project Slug (lowercase alphanumeric & hyphens) *
            </label>
            <input
              type="text"
              required
              pattern="^[a-z0-9-]+$"
              placeholder="e.g. alljobs or sea-launch"
              value={slug}
              onChange={e => setSlugField(current => updateSlugManually(current, e.target.value))}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
              Project Type *
            </label>
            <select
              value={type}
              onChange={e => setType(e.target.value as any)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)" }}
            >
              <option value="code">Code Repository (Git Mirror projection)</option>
              <option value="business">Business Initiative (AllJobs Native custody)</option>
            </select>
          </div>

          {type === "code" && (
            <>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
                  Repository / Workspace
                </label>
                <select
                  value={candidatePath}
                  onChange={e => setCandidatePath(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)", fontFamily: "var(--font-mono)" }}
                >
                  <option value="">Choose Repository…</option>
                  {workspaces.map(workspace => (
                    <option key={workspace.candidatePath} value={workspace.candidatePath}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
                <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--ink-faint)" }}>
                  {workspaceLoadError || "Only direct children of configured trusted workspaces are available."}
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
                    Git Remote URL (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="git@github.com:org/repo.git"
                    value={gitRemote}
                    onChange={e => setGitRemote(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)", fontFamily: "var(--font-mono)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
                    Branch
                  </label>
                  <input
                    type="text"
                    value={gitBranch}
                    onChange={e => setGitBranch(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)", fontFamily: "var(--font-mono)" }}
                  />
                </div>
              </div>
            </>
          )}

          <button type="submit" className="btn btn--primary" style={{ marginTop: "8px" }} disabled={isPending}>
            {isPending ? "Checking project…" : "Review Project"}
          </button>
        </form>
      ) : (
        proposal && (
          <div
            style={{
              background: "var(--paper-raised)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--radius-lg)",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px"
            }}
          >
            <div style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: "12px" }}>
              <span className="badge badge--active">Step 2: Review Project</span>
              <h2 style={{ margin: "8px 0 4px", fontSize: "20px" }}>{proposal.project.name}</h2>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--ink-faint)" }}>
                Proposal Digest: <code>{proposal.proposalDigest}</code>
              </div>
            </div>

            {/* Blockers */}
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

            {/* Warnings */}
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

            {/* Proposed Writes */}
            <div>
              <strong style={{ fontSize: "13px", color: "var(--ink)" }}>Changes AllJobs Will Make:</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: "20px", fontSize: "12.5px", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                {proposal.writes.map((w, i) => (
                  <li key={i}>
                    <strong>{w.path}</strong> — {w.description}
                  </li>
                ))}
              </ul>
            </div>

            {/* Confirmation Gate */}
            {proposal.blockers.length === 0 && (
              <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontFamily: "var(--font-mono)", marginBottom: "6px" }}>
                  Type project slug <strong>{proposal.project.slug}</strong> to confirm registration:
                </label>
                <input
                  type="text"
                  placeholder={proposal.project.slug}
                  value={confirmationSlug}
                  onChange={e => setConfirmationSlug(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hairline-strong)", fontFamily: "var(--font-mono)", marginBottom: "16px" }}
                />

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button type="button" className="btn" onClick={() => setStep("form")}>
                    ← Edit Details
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={confirmationSlug !== proposal.project.slug || isPending}
                    onClick={handleApply}
                  >
                    {isPending ? "Adding project…" : "Add Project"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
