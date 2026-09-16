import type { CapabilityExportDto } from "@/lib/caphub/registry/queries";

const RELEASE_STATE_COPY: Record<string, string> = {
  waiting: "Release waiting for its own exact-version human review.",
  approved_unfinalized: "Release approved but not finalized; deployment planning is blocked.",
  approved_finalized: "Release approval is finalized; deployment planning may proceed through exact plans.",
  rejected: "Release rejected. History is retained; publishing is unavailable.",
  revoked: "Release approval revoked. History is retained; publishing is unavailable.",
  superseded: "Release review superseded by a newer request. History is retained."
};

export function CapabilityExportPanel({ view }: { view: CapabilityExportDto }) {
  if (view.kind === "disabled") {
    return <section className="registry-section" aria-labelledby="exports-disabled">
      <h2 id="exports-disabled">Exports are safe-off</h2>
      <p>Capability export, projection, and deployment surfaces stay disabled until every master switch and the per-target gate are enabled server-side. No root path or secret is shown here.</p>
    </section>;
  }
  if (view.kind === "unavailable") {
    return <section className="registry-section" role="alert" aria-labelledby="exports-unavailable">
      <h2 id="exports-unavailable">Export state is unavailable</h2>
      <p>Safe error <code>REGISTRY_UNAVAILABLE</code>. Retry the read; nothing was changed.</p>
    </section>;
  }
  if (view.kind === "no_release") {
    return <section className="registry-section" aria-labelledby="exports-no-release">
      <h2 id="exports-no-release">No Release candidate</h2>
      <p>An approved Candidate disposition of <code>adopt</code>, <code>adapt</code>, or <code>learn</code> can compose one exact-version Release candidate. <code>build</code> stays with the P5 BuildProposal path; <code>watch</code> never creates one.</p>
    </section>;
  }

  const release = view.release;
  const unsupported = view.adapters.filter((adapter) => adapter.state === "unsupported");
  return <section className="registry-section" aria-labelledby="exports-release" data-release-state={release.state}>
    <h2 id="exports-release">Release candidate</h2>
    <p><strong>{release.title}</strong> · <code>{release.slug}</code> · v{release.semver} (Registry v{release.version})</p>
    <p>{RELEASE_STATE_COPY[release.state] ?? "Release state is unchanged."}</p>
    <code>{release.recordId}</code>
    <code>{release.packageDigest}</code>

    <h3>Neutral package manifest</h3>
    {view.packageManifest.manifestDigest
      ? <p>{view.packageManifest.fileCount} text-only files · manifest <code>{view.packageManifest.manifestDigest}</code></p>
      : <p role="alert">The package failed deterministic rendering; publishing is unavailable.</p>}

    <h3>Adapter previews</h3>
    <ul>
      {view.adapters.map((adapter) => <li key={adapter.target}>
        <strong>{adapter.target}</strong> — {adapter.state}
        {adapter.manifestDigest ? <> · manifest <code>{adapter.manifestDigest}</code></> : null}
        {adapter.diagnostics.map((diagnostic) => <p key={diagnostic}>{diagnostic}</p>)}
      </li>)}
    </ul>
    {unsupported.length > 0 && <p role="alert">Unsupported adapter output blocks every target publish until the package changes and is re-approved.</p>}

    <h3>Obsidian projection</h3>
    <p>State: <code>{view.obsidian.state}</code></p>
    {view.obsidian.conflicts.length > 0 && <ul>
      {view.obsidian.conflicts.map((conflict) => <li key={conflict.path}><code>{conflict.path}</code> — {conflict.reason}</li>)}
    </ul>}

    <h3>Deployment plans</h3>
    {view.deployment.plans.length === 0
      ? <p>No deployment plan exists. Planning binds an exact Release, adapter, diff, and target alias; it never applies from the browser.</p>
      : <ul>
        {view.deployment.plans.map((plan) => <li key={plan.planId}>
          <strong>{plan.action}</strong> → {plan.target ?? "unknown"} ({plan.targetAlias ?? "no alias"})
          · review {plan.reviewState.replaceAll("_", " ")}
          · decision {plan.decisionConsumed ? "consumed" : "unconsumed"}
          <code>{plan.planId}</code>
        </li>)}
      </ul>}

    <h3>Deployment history</h3>
    {view.deployment.history.length === 0
      ? <p>No deployment has been recorded.</p>
      : <ol>
        {view.deployment.history.map((deployment) => <li key={deployment.deploymentId}>
          <strong>{deployment.action}</strong> via {deployment.targetAlias} · Registry v{deployment.releaseVersion} · {deployment.createdAt}
          <code>{deployment.deploymentId}</code>
        </li>)}
      </ol>}
    {view.deployment.activePointer
      ? <p>Active pointer: deployment <code>{view.deployment.activePointer.deploymentId}</code> · release <code>{view.deployment.activePointer.releaseId}</code> v{view.deployment.activePointer.releaseVersion}</p>
      : <p>No active target pointer is visible.</p>}
    <p>Publish and rollback run only through separately gated server-side tools after an exact deployment approval; this page stays read-only.</p>
  </section>;
}
