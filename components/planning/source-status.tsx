import React from "react";

export interface SourceStatusProps {
  routePath?: string;
  custody?: "REPO: GIT-MIRROR" | "NATIVE: CONTROL-HOST";
  revision?: string;
  digest?: string;
  freshness?: "fresh" | "stale" | "unavailable";
}

export function SourceStatus({
  routePath = "/",
  custody = "NATIVE: CONTROL-HOST",
  revision,
  digest,
  freshness = "fresh"
}: SourceStatusProps) {
  const shortId = revision && revision !== "native" && revision !== "unknown"
    ? `rev ${revision.slice(0, 7)}`
    : digest
    ? `sha256 ${digest.slice(0, 7)}`
    : "local mirror";

  return (
    <div className="status-strip" role="region" aria-label="Planning Source Provenance">
      <div className="status-strip__segment">
        <span className="status-strip__item">
          <strong>PATH</strong> {routePath}
        </span>
        <span className="status-strip__sep">/</span>
        <span className="status-strip__item">
          <strong>CUSTODY</strong>{" "}
          <span className={custody.startsWith("REPO") ? "custody-badge custody-badge--repo" : "custody-badge custody-badge--native"}>
            {custody}
          </span>
        </span>
      </div>
      <div className="status-strip__segment">
        <span className="status-strip__item">
          <strong>STATE</strong> {shortId}
        </span>
        <span className="status-strip__sep">/</span>
        <span className="status-strip__item">
          <strong>SYNC</strong>{" "}
          <span className={freshness === "fresh" ? "badge badge--done" : freshness === "stale" ? "badge badge--waiting" : "badge badge--blocked"}>
            {freshness.toUpperCase()}
          </span>
        </span>
      </div>
    </div>
  );
}
