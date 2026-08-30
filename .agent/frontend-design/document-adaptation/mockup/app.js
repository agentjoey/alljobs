const scenarios = {
  canonical: {
    label: "Canonical",
    health: "canonical",
    source: "LOCAL WORKING TREE · CLEAN",
    sync: "FRESH",
    document: "backlog",
    path: "docs/BACKLOG.md",
    revision: "fded5e7",
    digest: "sha256 1a3c9e2…b817",
    title: "Canonical planning document",
    summary: "The strict parser accepted every Backlog section. Official planning counts and relations are available.",
    detail: "canonical"
  },
  modified: {
    label: "Canonical · locally modified",
    health: "canonical",
    source: "LOCAL WORKING TREE · MODIFIED",
    sync: "LOCAL",
    document: "backlog",
    path: "docs/BACKLOG.md",
    revision: "working tree",
    digest: "sha256 92b747a…1c02",
    title: "Canonical local document",
    summary: "The selected local bytes parse canonically. Git HEAD does not replace the locally modified source.",
    detail: "canonical-modified"
  },
  recoverable: {
    label: "Needs attention",
    health: "attention",
    source: "LOCAL WORKING TREE · MODIFIED",
    sync: "LOCAL",
    document: "backlog",
    path: "docs/BACKLOG.md",
    revision: "working tree",
    digest: "sha256 8f2a76d…019c",
    title: "One Backlog section needs repair",
    summary: "Three canonical items remain official. One recognizable section is isolated as evidence and does not enter counts.",
    detail: "recoverable"
  },
  unstructured: {
    label: "Unstructured document",
    health: "attention",
    source: "LOCAL WORKING TREE · MODIFIED",
    sync: "LOCAL",
    document: "backlog",
    path: "docs/BACKLOG.md",
    revision: "working tree",
    digest: "sha256 4760bd0…c40f",
    title: "Readable Markdown without canonical sections",
    summary: "The outline is useful for orientation, but it is not canonical planning data.",
    detail: "unstructured"
  },
  "missing-backlog": {
    label: "Missing document",
    health: "missing",
    source: "LOCAL WORKING TREE · CLEAN",
    sync: "FRESH",
    document: "backlog",
    path: "docs/BACKLOG.md",
    revision: "fded5e7",
    digest: "not available",
    title: "Backlog document is missing",
    summary: "AllJobs looked for the fixed Backlog path and did not find a regular file. This is not a zero-item Backlog.",
    detail: "missing"
  },
  "missing-roadmap": {
    label: "Missing document",
    health: "missing",
    source: "LOCAL WORKING TREE · CLEAN",
    sync: "FRESH",
    document: "roadmap",
    path: "docs/ROADMAP.md",
    revision: "fded5e7",
    digest: "not available",
    title: "Roadmap document is missing",
    summary: "AllJobs looked for the fixed Roadmap path and did not find a regular file. No phase count is inferred.",
    detail: "missing"
  },
  unsafe: {
    label: "Source blocked",
    health: "blocked",
    source: "LOCAL SOURCE INVALID · READ ONLY",
    sync: "UNAVAILABLE",
    document: "backlog",
    path: "docs/BACKLOG.md",
    revision: "fded5e7",
    digest: "not read",
    title: "Backlog path is not a regular file",
    summary: "The selected local path resolves to a symbolic link outside the trusted project root. AllJobs did not read through it.",
    detail: "unsafe"
  },
  remote: {
    label: "Canonical · read only",
    health: "canonical",
    source: "REMOTE COMMIT · READ ONLY",
    sync: "FRESH",
    document: "backlog",
    path: "docs/BACKLOG.md",
    revision: "09d7692",
    digest: "sha256 6de3041…8fe0",
    title: "Canonical remote projection",
    summary: "The strict parser accepted this exact remote revision. Counts are visible, while repository controls remain unavailable.",
    detail: "remote"
  },
  cache: {
    label: "Needs attention · read only",
    health: "attention",
    source: "CACHE SNAPSHOT · READ ONLY",
    sync: "STALE · READ 2H AGO",
    document: "backlog",
    path: "docs/BACKLOG.md",
    revision: "09d7692",
    digest: "sha256 6de3041…8fe0",
    title: "Cached evidence may be out of date",
    summary: "The cache preserves the last readable projection after refresh failed. It is evidence, not a current source claim.",
    detail: "cache"
  },
  unavailable: {
    label: "Unavailable source",
    health: "blocked",
    source: "NO READABLE SOURCE · READ ONLY",
    sync: "UNAVAILABLE",
    document: "backlog",
    path: "docs/BACKLOG.md",
    revision: "unknown",
    digest: "not available",
    title: "No readable Backlog source",
    summary: "The local path is unavailable, the mirror has no readable commit, and no cache snapshot exists.",
    detail: "unavailable"
  },
  clipboard: {
    label: "Needs attention",
    health: "attention",
    source: "LOCAL WORKING TREE · MODIFIED",
    sync: "LOCAL",
    document: "backlog",
    path: "docs/BACKLOG.md",
    revision: "working tree",
    digest: "sha256 8f2a76d…019c",
    title: "One Backlog section needs repair",
    summary: "Clipboard access is unavailable in this browser. The full handoff stays selectable below.",
    detail: "clipboard"
  }
};

const scenarioSelect = document.querySelector("#scenario");
const surface = document.querySelector("#surface");
const sourceStrip = document.querySelector("#source-strip");
const copyStatus = document.querySelector("#copy-status");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function handoffText(item) {
  const diagnostic = item.detail === "missing"
    ? `Missing fixed planning document: ${item.path}`
    : item.detail === "unsafe"
      ? `Unsafe source rejected: ${item.path} is not a trusted regular file`
      : item.detail === "unavailable"
        ? `No readable local, remote, or cached source for ${item.path}`
        : "BACKLOG_FIELD_INVALID at line 74: priority must be P0, P1, P2, or P3";

  return [
    "Repository-agent handoff — review required",
    "Project: AllJobs demonstration project",
    `Document: ${item.path}`,
    `Source mode: ${item.source}`,
    `Revision: ${item.revision}`,
    `Digest: ${item.digest}`,
    `Diagnostic: ${diagnostic}`,
    "Candidate: Improve document health (line 71)",
    "Missing canonical fields: id, status, priority, phase",
    "Choose stable IDs, preserve source meaning, and validate relations in the repository review workflow.",
    "AllJobs made no repository write, commit, push, merge, fetch, or agent-start action."
  ].join("\n");
}

function healthMarker(item) {
  return `<span class="health-marker health-marker--${item.health}"><i aria-hidden="true"></i>${escapeHtml(item.label)}</span>`;
}

function counts(item) {
  const backlogValue = item.document === "backlog" && item.health !== "canonical" ? item.label : "4 canonical";
  const roadmapValue = item.document === "roadmap" && item.health !== "canonical" ? item.label : "3 canonical";
  return `<dl class="planning-counts" aria-label="Canonical planning summary">
    <div><dt>Roadmap</dt><dd>${escapeHtml(roadmapValue)}</dd></div>
    <div><dt>Backlog</dt><dd>${escapeHtml(backlogValue)}</dd></div>
    <div><dt>Native tasks</dt><dd>7 active</dd></div>
  </dl>`;
}

function canonicalDetail(item) {
  const readOnly = item.detail === "remote";
  return `<section class="document-body" aria-labelledby="canonical-heading">
    <header class="section-heading">
      <div><h2 id="canonical-heading">Canonical Backlog</h2><p>Official items from the strict parser.</p></div>
      ${readOnly ? '<span class="read-only-label">Read only</span>' : ""}
    </header>
    <div class="canonical-ledger" role="list">
      <div class="canonical-row" role="listitem"><code>AJ-B-041</code><strong>Document triage contract</strong><span>P1 · planned</span></div>
      <div class="canonical-row" role="listitem"><code>AJ-B-042</code><strong>Degraded source evidence</strong><span>P1 · planned</span></div>
      <div class="canonical-row" role="listitem"><code>AJ-B-043</code><strong>Copy-only repository handoff</strong><span>P2 · planned</span></div>
      <div class="canonical-row" role="listitem"><code>AJ-B-044</code><strong>Observed format fixtures</strong><span>P2 · planned</span></div>
    </div>
    <p class="scope-note">Only these canonical rows participate in counts, relations, ordering, and task bindings.</p>
  </section>`;
}

function candidateSheet(kind = "recoverable") {
  const isOutline = kind === "unstructured";
  return `<section class="evidence-section" aria-labelledby="candidate-heading">
    <header class="section-heading">
      <div>
        <h2 id="candidate-heading">${isOutline ? "Outline candidate" : "Candidate section"}</h2>
        <p>${isOutline ? "Not canonical planning data" : "Source evidence only · excluded from planning counts"}</p>
      </div>
      <span class="evidence-label">Not canonical</span>
    </header>
    <div class="candidate-sheet">
      <div class="candidate-line"><span>Heading</span><strong>${isOutline ? "Later ideas" : "Improve document health"}</strong></div>
      <div class="candidate-line"><span>Source line</span><code>${isOutline ? "line 39" : "line 71"}</code></div>
      <div class="candidate-line"><span>Evidence</span><q>${isOutline ? "## Later ideas" : "## Improve document health"}</q></div>
      <div class="candidate-line"><span>Confidence</span><strong>${isOutline ? "Ambiguous outline" : "Recognized heading shape"}</strong></div>
      <div class="candidate-line"><span>Missing fields</span><code>id · status · priority · phase</code></div>
    </div>
    <p class="withheld">No ID assigned · no priority or rank inferred · no drag, create, or apply control</p>
  </section>`;
}

function diagnosticBlock(item) {
  const blocks = {
    recoverable: ["BACKLOG_FIELD_INVALID · line 74", "priority: urgent", "Expected P0, P1, P2, or P3. The section was isolated; three canonical items remain official."],
    clipboard: ["BACKLOG_FIELD_INVALID · line 74", "priority: urgent", "Expected P0, P1, P2, or P3. Clipboard access is also unavailable."],
    unstructured: ["BACKLOG_STRUCTURE_MISSING", "No canonical YAML sections found", "Readable headings remain as an outline. No planning fields were inferred."],
    missing: ["DOCUMENT_MISSING", item.path, "Create this fixed document in the repository review workflow; AllJobs did not create it."],
    unsafe: ["SOURCE_PATH_REJECTED", `${item.path} → /tmp/shared-backlog.md`, "The local path is not a trusted regular file. No remote fallback was selected."],
    cache: ["REFRESH_FAILED · cached evidence retained", "Last successful read · 2 hours ago", "Retry source refresh before relying on this projection."],
    unavailable: ["SOURCE_UNAVAILABLE", "Local read failed · remote revision absent · cache absent", "Restore a readable source, then refresh. No planning data was inferred."]
  };
  const [code, evidence, recovery] = blocks[item.detail] || blocks.recoverable;
  return `<section class="diagnostic" aria-labelledby="diagnostic-heading">
    <div class="diagnostic-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z"></path><path d="M12 9v5M12 17.5v.5"></path></svg></div>
    <div><h2 id="diagnostic-heading">${escapeHtml(code)}</h2><code>${escapeHtml(evidence)}</code><p>${escapeHtml(recovery)}</p></div>
  </section>`;
}

function handoffBlock(item, reveal = false) {
  const value = handoffText(item);
  return `<section class="handoff-section" aria-labelledby="handoff-heading">
    <div>
      <h2 id="handoff-heading">Continue in the repository review workflow</h2>
      <p>Copy a bounded evidence package for a repository agent. This mockup cannot write or start an agent.</p>
    </div>
    <button class="copy-button" type="button" data-copy-handoff aria-describedby="handoff-safety">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg>
      Copy repository-agent handoff
    </button>
    <p id="handoff-safety" class="scope-note">Copy only · no write · no commit · no push · no merge · no agent start</p>
    <div class="manual-copy ${reveal ? "is-visible" : ""}" data-manual-copy>
      <label for="handoff-text">Clipboard unavailable — select the complete handoff</label>
      <textarea id="handoff-text" readonly rows="11">${escapeHtml(value)}</textarea>
    </div>
  </section>`;
}

function renderDetail(item) {
  if (["canonical", "canonical-modified", "remote"].includes(item.detail)) return canonicalDetail(item);
  const showCandidate = ["recoverable", "clipboard", "unstructured"].includes(item.detail);
  return `${diagnosticBlock(item)}
    ${showCandidate ? candidateSheet(item.detail) : ""}
    ${handoffBlock(item, item.detail === "clipboard")}`;
}

function render() {
  const item = scenarios[scenarioSelect.value] || scenarios.recoverable;
  sourceStrip.innerHTML = `<span><strong>Source</strong> ${escapeHtml(item.source)}</span>
    <span><strong>Path</strong> ${escapeHtml(item.path)}</span>
    <span><strong>State</strong> ${escapeHtml(item.revision)} · ${escapeHtml(item.digest)}</span>
    <span><strong>Sync</strong> ${escapeHtml(item.sync)}</span>`;

  surface.innerHTML = `<article class="project-sheet">
    <header class="project-heading">
      <div class="project-title">
        <div class="project-badges"><span class="type-badge">Code</span><span class="custody-badge">Repo: git-mirror</span></div>
        <h1>AllJobs demonstration project</h1>
        <p>Document health keeps repository truth separate from useful source evidence.</p>
      </div>
      ${healthMarker(item)}
    </header>

    ${counts(item)}

    <section class="document-header" aria-labelledby="document-title">
      <div>
        <span class="document-kind">${escapeHtml(item.document)} document</span>
        <h2 id="document-title">${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.summary)}</p>
      </div>
      <dl class="source-facts">
        <div><dt>Fixed path</dt><dd><code>${escapeHtml(item.path)}</code></dd></div>
        <div><dt>Source mode</dt><dd>${escapeHtml(item.source)}</dd></div>
        <div><dt>Revision</dt><dd><code>${escapeHtml(item.revision)}</code></dd></div>
        <div><dt>Digest</dt><dd><code>${escapeHtml(item.digest)}</code></dd></div>
      </dl>
    </section>

    ${renderDetail(item)}
  </article>`;

  const copyButton = surface.querySelector("[data-copy-handoff]");
  if (copyButton) copyButton.addEventListener("click", () => copyHandoff(item));
}

async function copyHandoff(item) {
  const manual = surface.querySelector("[data-manual-copy]");
  if (item.detail === "clipboard") {
    manual.classList.add("is-visible");
    manual.querySelector("textarea").focus();
    copyStatus.textContent = "Clipboard unavailable. The complete handoff is ready for manual selection.";
    return;
  }

  try {
    await navigator.clipboard.writeText(handoffText(item));
    copyStatus.textContent = "Repository-agent handoff copied. No repository action was performed.";
    const button = surface.querySelector("[data-copy-handoff]");
    button.lastChild.textContent = " Handoff copied";
  } catch {
    manual.classList.add("is-visible");
    manual.querySelector("textarea").focus();
    copyStatus.textContent = "Clipboard unavailable. The complete handoff is ready for manual selection.";
  }
}

scenarioSelect.addEventListener("change", render);
render();

