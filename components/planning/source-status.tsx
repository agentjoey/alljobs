import React from "react";
import type { PlanningSourceState } from "@/lib/planning/providers/contracts";

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
    <div className="status-strip" role="region" aria-label="Planning Source Provenance">
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
          <strong>STATE</strong> {shortId}
        </span>
        <span className="status-strip__sep">/</span>
        <span className="status-strip__item">
          <strong>SYNC</strong>{" "}
          {freshness ? (
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
