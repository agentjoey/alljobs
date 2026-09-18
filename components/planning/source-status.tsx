"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { PlanningSourceState } from "@/lib/planning/providers/contracts";

type CaphubModuleState = "Ready" | "Receiving" | "Received" | "Disabled" | "Validation Error" | "Storage Error" | "Read Error";
const CaphubStateContext = createContext<CaphubModuleState | null>(null);
const CaphubPublishContext = createContext<((state: CaphubModuleState | null) => void) | null>(null);

/** Scope capture state to this shell instance; never mutate shared module state. */
export function CaphubStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CaphubModuleState | null>(null);
  return <CaphubPublishContext value={setState}><CaphubStateContext value={state}>{children}</CaphubStateContext></CaphubPublishContext>;
}

export function usePublishCaphubState(state: CaphubModuleState) {
  const publish = useContext(CaphubPublishContext);
  useEffect(() => { publish?.(state); }, [publish, state]);
  useEffect(() => () => { publish?.(null); }, [publish]);
}

export interface SourceStatusProps {
  routePath?: string;
  custody?: string;
  revision?: string;
  digest?: string;
  freshness?: "fresh" | "stale" | "unavailable";
  source?: PlanningSourceState;
}

export function planningSourceLabel(source: PlanningSourceState) {
  if (source.mode === "local-working-tree") {
    return source.writable
      ? `LOCAL WORKING TREE · ${source.backlogModified ? "MODIFIED" : "CLEAN"}`
      : "LOCAL SOURCE INVALID · READ ONLY";
  }
  return source.mode === "remote-commit" ? "REMOTE COMMIT · READ ONLY" : "CACHE SNAPSHOT · READ ONLY";
}

export function SourceStatus({
  routePath,
  custody,
  revision,
  digest,
  freshness,
  source
}: SourceStatusProps) {
  const caphubState = useContext(CaphubStateContext);
  const isCaphub = routePath === "/caphub" || routePath?.startsWith("/caphub/");
  const isCaphubRegistry = routePath?.startsWith("/caphub/reviews") || routePath?.startsWith("/caphub/captures") || routePath?.startsWith("/reviews")
    || routePath?.startsWith("/captures")
    || routePath?.startsWith("/capabilities");
  // Only render provenance facts that are actually known; never fabricate.
  const shortId = revision && revision !== "native" && revision !== "unknown"
    ? `rev ${revision.slice(0, 7)}`
    : digest
    ? `sha256 ${digest.slice(0, 7)}`
    : "—";

  const custodyClass = custody?.startsWith("REPO")
    ? "custody-badge custody-badge--repo"
    : custody?.startsWith("NATIVE")
    ? "custody-badge custody-badge--native"
    : "custody-badge custody-badge--mixed";

  return (
    <div className={`status-strip${isCaphubRegistry ? " status-strip--registry" : ""}`} role="region" aria-label="Planning Source Provenance">
      <div className="status-strip__segment">
        {source && (
          <span className="status-strip__item">
            <strong>SOURCE</strong> <span>{planningSourceLabel(source)}</span>
          </span>
        )}
        {source && <span className="status-strip__sep">/</span>}
        <span className="status-strip__item">
          <strong>PATH</strong> {routePath ?? "—"}
        </span>
        <span className="status-strip__sep">/</span>
        <span className="status-strip__item">
          <strong>CUSTODY</strong>{" "}
          {custody ? <span className={custodyClass}>{custody}</span> : "—"}
        </span>
      </div>
      <div className="status-strip__segment">
        <span className="status-strip__item">
          <strong>STATE</strong> {isCaphub && !isCaphubRegistry ? caphubState ?? "Checking" : shortId}
        </span>
        <span className="status-strip__sep">/</span>
        <span className="status-strip__item">
          <strong>SYNC</strong>{" "}
          {isCaphub ? "N/A" : freshness ? (
            <span className={freshness === "fresh" ? "badge badge--done" : freshness === "stale" ? "badge badge--waiting" : "badge badge--blocked"}>
              {freshness.toUpperCase()}
            </span>
          ) : (
            "—"
          )}
        </span>
      </div>
    </div>
  );
}
