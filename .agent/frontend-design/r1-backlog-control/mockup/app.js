const phases = ["Foundation", "Delivery", "Operations"];
const priorities = ["P0", "P1", "P2"];
const state = { current: new URLSearchParams(location.search).get("state") || "unranked", reduced: false };
const titles = [
  "Define the trusted local source contract", "Prove a complete file digest before proposal", "Add rank without changing editorial section order", "Make an invalid local document visible", "Reject a planning-file symlink", "Keep remote fallback read-only", "Show exact field-only changes", "Preserve inline YAML comments", "Repair crowded ranks in one lane", "Make stale writes recoverable", "Carry source provenance into review", "Keep the lock boundary observable"
];
const items = Array.from({ length: 36 }, (_, index) => ({
  id: `AJ-B-${String(index + 1).padStart(3, "0")}`,
  phase: phases[Math.floor(index / 12)],
  priority: priorities[index % 3],
  rank: (Math.floor(index / 3) % 4 + 1) * 100,
  title: titles[index % titles.length],
  note: index % 5 === 0 ? "Needs an explicit repository-agent check." : index % 5 === 1 ? "Ready after local-source validation." : "Synthetic mockup item; document remains canonical.",
  history: index > 31
}));

const $ = (selector, root = document) => root.querySelector(selector);
const byId = (id) => items.find((item) => item.id === id);
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

function sourceFacts() {
  const cached = state.current === "cached";
  const unavailable = state.current === "unavailable";
  const readOnly = state.current === "readonly" || cached || unavailable;
  const invalid = state.current === "invalid";
  const local = !readOnly && !invalid;
  return {
    label: invalid ? "LOCAL SOURCE INVALID" : unavailable ? "NO READABLE SOURCE" : cached ? "CACHE SNAPSHOT · READ ONLY" : readOnly ? "REMOTE COMMIT · READ ONLY" : "LOCAL WORKING TREE · MODIFIED",
    mode: local ? "local-working-tree" : cached ? "cache-snapshot" : unavailable ? "unavailable" : "remote-commit",
    writable: local && !invalid,
    head: unavailable ? "—" : readOnly ? "a62f1ce" : "5466c33",
    digest: invalid || unavailable ? "sha256: unable to validate" : cached ? "sha256: 5ce7b9f…304" : readOnly ? "sha256: 42a1f69…119" : "sha256: 8d7a20c…c41",
    path: "docs/BACKLOG.md"
  };
}

function sourceStrip() {
  const facts = sourceFacts();
  $("#source-strip").innerHTML = `<strong>PATH</strong> ${facts.path}<span class="strip-sep">/</span><strong>CUSTODY</strong> ${facts.label}<span class="strip-sep">/</span><strong>HEAD</strong> ${facts.head}<span class="strip-sep">/</span><strong>DIGEST</strong> ${facts.digest}`;
}

function badge(priority) { return `<span class="badge badge--${priority.toLowerCase()}">${priority}</span>`; }
function row(item, options = {}) {
  const draft = options.draft ? " backlog-card--draft" : "";
  const history = item.history ? " backlog-card--history" : "";
  const disabled = options.disabled ? ' aria-disabled="true" title="Initialize ordering before moving items"' : "";
  const controls = options.controls ? `<div class="card-actions"><button type="button" aria-label="Move ${item.id} up">Move up</button><button type="button" aria-label="Move ${item.id} down">Move down</button><button type="button" aria-label="Change priority for ${item.id}">Change priority</button></div>` : options.priorityOnly ? `<div class="card-actions"><button type="button" aria-label="Change priority for ${item.id}">Change priority</button></div>` : "";
  return `<article class="backlog-card${draft}${history}"><header class="backlog-card__meta"><span class="drag" role="img" aria-label="Desktop drag affordance for ${item.id}"${disabled}></span><code>${item.id}</code>${badge(item.priority)}<span class="rank">${item.history ? "History" : `Rank ${item.rank}`}</span><span class="card-phase">${item.phase}</span></header><div class="backlog-card__body"><strong class="item-title">${escapeHtml(item.title)}</strong><p class="item-note">${escapeHtml(item.note)}</p></div><footer class="backlog-card__footer"><span>${item.history ? "Archived from active ordering" : "Existing item · priority and rank are the only writable fields"}</span>${controls}</footer></article>`;
}

function groupedLedger({ editing = false, unranked = false } = {}) {
  return phases.map((phase) => {
    const phaseItems = items.filter((item) => item.phase === phase && !item.history);
    return `<section class="phase"><header class="phase__head"><span>${phase}</span><span>${phaseItems.length} active items</span></header>${priorities.map((priority) => {
      const lane = phaseItems.filter((item) => item.priority === priority).sort((a, b) => a.rank - b.rank);
      return `<section class="lane"><header class="lane__head">${badge(priority)} <span>ranked execution lane</span><span class="lane__count">${lane.length} items</span></header>${lane.map((item, index) => row({ ...item, rank: unranked ? "—" : item.rank }, { controls: editing, priorityOnly: unranked, disabled: unranked, draft: editing && ((phase === "Delivery" && priority === "P0" && index === 0) || (phase === "Delivery" && priority === "P1" && index === 1)) })).join("")}</section>`;
    }).join("")}</section>`;
  }).join("") + `<section class="phase"><header class="phase__head"><span>History</span><span>folded from ordering</span></header>${items.filter((item) => item.history).map((item) => row(item)).join("")}</section>`;
}

function rail() {
  const facts = sourceFacts();
  return `<aside class="rail"><section class="surface"><header class="surface__head"><div><h2>Source custody</h2><p>Read authority is visible before any edit.</p></div>${facts.writable ? '<span class="badge badge--write">WRITABLE</span>' : '<span class="badge badge--read">READ ONLY</span>'}</header><div class="surface__body"><dl class="fact-list"><div><dt>Source mode</dt><dd>${facts.mode}</dd></div><div><dt>Registered file</dt><dd><code>${facts.path}</code></dd></div><div><dt>Working tree</dt><dd>${facts.label.includes("MODIFIED") ? "Modified planning file — allowed only with full-file stale protection" : facts.label}</dd></div><div><dt>Expected digest</dt><dd><code>${facts.digest}</code></dd></div><div><dt>Local head</dt><dd><code>${facts.head}</code></dd></div></dl></div></section><section class="surface hatch"><header class="surface__head"><div><h2>R1 boundary</h2><p>The repository remains the only truth.</p></div></header><div class="surface__body"><dl class="fact-list"><div><dt>Direct fields</dt><dd><code>priority</code> and <code>rank</code> on existing items only</dd></div><div><dt>Never automatic</dt><dd>Commit, push, merge, fetch, project-code execution, or agent start</dd></div><div><dt>Cross-Phase move</dt><dd>Repository-agent proposal required</dd></div></dl></div></section></aside>`;
}

function intro(title, description, fact) { return `<header class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="heading-fact">${fact}</div></header>`; }
function surfaceHeader(actionHtml) { return `<section class="surface"><header class="surface__head"><div><h2>Backlog ledger</h2><p>36 synthetic items · Phase → Priority → Rank · editorial Markdown order is unchanged.</p></div><div class="head-actions">${actionHtml}</div></header>`; }

function unrankedView() {
  return `${intro("Backlog control starts with the document you actually have.", "The Local working tree is modified and valid. Existing items remain readable; rank adoption is proposed, never automatic.", "LOCAL · MODIFIED\nDIGEST 8d7a20c…c41")}
  <div class="workbench"><div>${surfaceHeader('<button class="btn btn--primary" type="button">Initialize ordering</button>')}<div class="notice"><span class="notice__code">ORDERING_NOT_INITIALIZED</span><span class="notice__copy"><strong>Rank is absent on active items.</strong> Change Priority remains available; drag, Move Up, and Move Down are disabled until a field-only initialization proposal assigns 100, 200, 300… per Phase + Priority.</span><button class="notice__action" type="button">Preview initialization</button></div>${groupedLedger({ unranked: true })}</section></div>${rail()}</div>`;
}
function editingView() {
  return `${intro("Manage ordering without touching the document yet.", "This is a page-local draft. Desktop may use the drag affordance; every item retains labeled keyboard and narrow-layout controls.", "LOCAL · MODIFIED\n2 AFFECTED ITEMS")}
  <div class="workbench"><div>${surfaceHeader('<button class="btn" type="button">Cancel editing</button>')}<div class="notice notice--quiet"><span class="notice__code">DRAFT ONLY</span><span class="notice__copy">The visible changes have not reached <code>docs/BACKLOG.md</code>. A proposal will re-read the complete file and bind the review to its digest.</span></div>${groupedLedger({ editing: true })}<div class="draft-bar" role="status"><p><strong>2 items changed.</strong> AJ-B-017 moves to Delivery / P0; the target lane will receive a safe rank.</p><button class="btn" type="button">Discard</button><button class="btn btn--primary" type="button" data-next="review">Review changes</button></div></section></div>${rail()}</div>`;
}
function reviewPanel(renumber = false, applying = false) {
  const rows = renumber ? [
    ["AJ-B-017", "P1 → P0", "300 → 150", "Moved into Delivery / P0"], ["AJ-B-013", "P0 → P0", "100 → 100", "Target lane renumbered"], ["AJ-B-016", "P0 → P0", "101 → 200", "Target lane renumbered"], ["AJ-B-019", "P0 → P0", "102 → 300", "Target lane renumbered"]
  ] : [["AJ-B-017", "P1 → P0", "300 → 150", "One item moves between priority lanes"]];
  return `<section class="review-panel" aria-label="Proposal review"><header class="review-panel__head"><h2>Review the exact field changes</h2><p>${renumber ? "The target Phase + Priority lane has no safe integer insertion gap; only that lane is renumbered." : "One item moves into an existing priority lane. No other field or byte range is part of the proposal."}</p></header><div class="change-list" role="list" aria-label="Proposed priority and rank changes">${rows.map(([id, priority, rank, reason]) => `<article class="change-row" role="listitem"><div class="change-cell"><span class="change-cell__label">Item</span><code>${id}</code></div><div class="change-cell"><span class="change-cell__label">Priority</span><span><span class="before">${priority.split(" → ")[0]}</span> <span class="after">${priority.split(" → ")[1]}</span></span></div><div class="change-cell"><span class="change-cell__label">Rank</span><span><span class="before">${rank.split(" → ")[0]}</span> <span class="after">${rank.split(" → ")[1]}</span></span></div><div class="change-cell"><span class="change-cell__label">Reason</span><span>${reason}</span></div></article>`).join("")}</div><div class="review-meta"><div><span>Expected complete file digest</span><code>sha256: 8d7a20c8e…c41</code></div><div><span>Proposal digest</span><code>sha256: 28c1b3e0d…57</code></div><div><span>Working tree</span><code>modified before proposal · allowed</code></div><div><span>Git operations</span><code>none — Apply never commits, pushes, merges, or fetches</code></div></div><footer class="review-actions"><button class="btn" type="button" data-next="editing" ${applying ? "disabled" : ""}>Back to draft</button><button class="btn btn--primary" type="button" ${applying ? "disabled" : ""}>${applying ? "Applying…" : "Confirm and apply"}</button></footer></section>`;
}
function reviewView(renumber = false) {
  const affected = `${renumber ? "4" : "1"} AFFECTED ITEM${renumber ? "S" : ""}\nHUMAN GATE REQUIRED`;
  return `${intro(renumber ? "Review a contained group renumbering." : "Review a single-item priority move.", "The proposal is bounded by the complete Backlog digest, reconstructs its patch server-side, and changes only declared priority/rank scalars.", affected)}
<div class="workbench"><div>${surfaceHeader('<button class="btn" type="button" data-next="editing">Return to draft</button>')}${reviewPanel(renumber)}</section></div>${rail()}</div>`;
}
function staleView() { return `${intro("The document changed after review. Nothing was written.", "A full-file digest mismatch is a stale-write boundary, including unrelated human edits. The prior intent remains visible only as a reference.", "STALE_WRITE\nZERO WRITES")}
<div class="workbench"><div>${surfaceHeader('<button class="btn btn--primary" type="button" data-next="editing">Refresh local source</button>')}<div class="notice notice--error"><span class="notice__code">STALE_WRITE</span><span class="notice__copy"><strong>No change was applied to docs/BACKLOG.md.</strong> Another editor changed the file after proposal digest <code>28c1b3e0d…57</code>. Refresh, inspect the new source, then create a new proposal; AllJobs never rebases this intent automatically.</span></div><details class="prior-intent" open><summary>Prior intent (reference only)</summary><p>Move <code>AJ-B-017</code> to Delivery / P0 and assign rank <code>150</code>. It is no longer applicable until a fresh proposal validates the complete file.</p></details>${groupedLedger()}</section></div>${rail()}</div>`; }
function invalidView() { return `${intro("A present local source is invalid — remote content stays out of the way.", "The registered workspace is available, but its Backlog has a relation failure. Direct controls are disabled and the repair route is a repository-agent handoff.", "LOCAL SOURCE INVALID\nREAD ONLY")}
<div class="workbench"><div>${surfaceHeader('<button class="btn" type="button" disabled>Manage ordering</button>')}<div class="notice notice--error"><span class="notice__code">INVALID_BACKLOG</span><span class="notice__copy"><strong>AJ-B-021 references an unknown Phase.</strong> This local error is authoritative. Fix and validate <code>docs/BACKLOG.md</code> with the repository agent; AllJobs will not substitute an older remote mirror.</span><button class="notice__action" type="button" data-next="handoff">Prepare handoff</button></div>${groupedLedger()}</section></div>${rail()}</div>`; }
function readonlyView() { return `${intro("Read the remote source, but do not mistake it for a writable workspace.", "The Control Host workspace is unavailable. Remote commit data is still useful for inspection, while all direct ordering controls degrade to proposal-only guidance.", "REMOTE COMMIT\nREAD ONLY")}
<div class="workbench"><div>${surfaceHeader('<button class="btn" type="button" disabled>Manage ordering</button>')}<div class="notice"><span class="notice__code">SOURCE_NOT_WRITABLE</span><span class="notice__copy"><strong>This projection comes from remote commit a62f1ce.</strong> Restore a validated Control Host workspace to use the controlled local write route, or prepare a repository-agent proposal instead.</span><button class="notice__action" type="button" data-next="handoff">New-item proposal</button></div>${groupedLedger()}</section></div>${rail()}</div>`; }
function cachedView() { return `${intro("A cached source is visible, but it is never a write target.", "The local workspace and remote mirror are unavailable. This snapshot is inspection-only and cannot be promoted into a proposal or Apply operation.", "CACHE SNAPSHOT\nREAD ONLY")}
<div class="workbench"><div>${surfaceHeader('<button class="btn" type="button" disabled>Manage ordering</button>')}<div class="notice"><span class="notice__code">CACHE_READ_ONLY</span><span class="notice__copy"><strong>Cached digest 5ce7b9f…304 is shown for context only.</strong> Recover a validated local working tree before creating an ordering proposal.</span><button class="notice__action" type="button" data-next="handoff">New-item proposal</button></div>${groupedLedger()}</section></div>${rail()}</div>`; }
function loadingView() { return `${intro("Inspecting the local source before showing controls.", "No ordering action is enabled until the registered workspace, file identity, and complete-file digest have been checked.", "READING LOCAL SOURCE\nNO ACTIONS")}
<div class="workbench"><section class="surface"><header class="surface__head"><div><h2>Backlog ledger</h2><p>Verifying source custody.</p></div><span class="badge badge--read">LOADING</span></header><div class="state-card"><h2>Reading docs/BACKLOG.md</h2><p>AllJobs reads the Control Host working tree first. It does not fall back to a remote or cache while that source check is in progress.</p><div class="skeleton-stack" aria-label="Loading backlog items"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></div></section>${rail()}</div>`; }
function emptyView() { return `${intro("The local Backlog is valid, but has no active items to order.", "No priority or rank proposal is needed. A new item remains a repository-agent handoff, never a direct AllJobs write.", "LOCAL · VALID\n0 ACTIVE ITEMS")}
<div class="workbench"><section class="surface"><header class="surface__head"><div><h2>Backlog ledger</h2><p>Active ordering excludes completed and cancelled history.</p></div></header><div class="empty"><h2>No active Backlog Items</h2><p>Create a proposal packet for the repository agent if this project needs a new item.</p><button class="btn btn--primary" type="button" data-next="handoff">Prepare new-item handoff</button></div></section>${rail()}</div>`; }
function applyingView() { return `${intro("Apply is re-checking the complete file before a bounded write.", "The reviewed field changes are frozen. AllJobs has not committed, pushed, merged, fetched, or executed project code.", "APPLYING\nLOCK HELD")}
<div class="workbench"><div>${surfaceHeader('<button class="btn" type="button" disabled>Apply in progress</button>')}<div class="notice notice--quiet"><span class="notice__code">VERIFYING_DIGEST</span><span class="notice__copy"><strong>Re-reading docs/BACKLOG.md.</strong> The write proceeds only if the expected complete-file digest still matches.</span></div>${reviewPanel(false, true)}</section></div>${rail()}</div>`; }
function successView() { return `${intro("The reviewed priority and rank update was applied locally.", "Only the declared fields changed. The file remains uncommitted and the repository stays responsible for every Git action.", "APPLIED\nNO GIT OPERATIONS")}
<div class="workbench"><div>${surfaceHeader('<button class="btn" type="button" data-next="editing">Continue editing</button>')}<div class="notice"><span class="notice__code">APPLIED</span><span class="notice__copy"><strong>AJ-B-017 moved to Delivery / P0 at rank 150.</strong> New complete-file digest: <code>sha256: 4d0e12a…782</code>. No commit, push, merge, fetch, or agent start occurred.</span></div>${groupedLedger()}</section></div>${rail()}</div>`; }
function lockedView() { return `${intro("Another controlled operation owns this Backlog right now.", "The source stays readable, but a second proposal or Apply cannot race the current lock holder.", "BACKLOG_LOCKED\nZERO WRITES")}
<div class="workbench"><div>${surfaceHeader('<button class="btn" type="button" disabled>Manage ordering</button>')}<div class="notice notice--error"><span class="notice__code">BACKLOG_LOCKED</span><span class="notice__copy"><strong>Apply is already in progress for this file.</strong> Wait for that operation to complete, then re-read the local source before creating a fresh proposal.</span><button class="notice__action" type="button" data-next="loading">Retry source check</button></div>${groupedLedger()}</section></div>${rail()}</div>`; }
function unavailableView() { return `${intro("No authoritative source is currently readable.", "AllJobs refuses to invent a writable Backlog from stale data. Recover the registered Control Host workspace before direct controls appear.", "SOURCE UNAVAILABLE\nREAD ONLY")}
<div class="workbench"><section class="surface"><header class="surface__head"><div><h2>Backlog ledger</h2><p>There is no inspected source to display.</p></div><span class="badge badge--read">UNAVAILABLE</span></header><div class="empty"><h2>Backlog source unavailable</h2><p>The local working tree, remote mirror, and cache cannot establish a current writable source.</p><button class="btn" type="button" data-next="loading">Retry source check</button></div></section>${rail()}</div>`; }
function handoffView() { const proposal = `# Backlog change proposal — alljobs\n\n## Request\nAdd an explicit local source health indicator\n\n## Expected outcome\nThe owner can identify malformed or unsafe planning files before choosing a repair.\n\n## Draft Done When\nA repository agent validates the planning document and records the resulting diff.\n\n## Notes\nKeep docs/BACKLOG.md as the only source of truth; do not create a second backlog.\n\n## Repository-agent instructions\n1. Inspect current code, architecture, ROADMAP, and BACKLOG.\n2. Confirm Phase, dependencies, priority, and Done When.\n3. Choose a stable item ID and edit docs/BACKLOG.md.\n4. Run planning validation and report the diff and commit.`; return `${intro("Hand a new Backlog idea to the repository agent — do not write it here.", "This form creates copyable context only. It does not save a second Backlog, invoke AI, or mutate a repository.", "PROPOSAL ONLY\nNO PERSISTENCE")}
<div class="workbench"><section class="surface"><header class="surface__head"><div><h2>New Backlog Item handoff</h2><p>AllJobs preserves the repository agent’s context for new or substantive changes.</p></div><span class="badge badge--read">COPY ONLY</span></header><div class="handoff"><div class="form-grid"><div class="field field--wide"><label for="title">Title / problem</label><input id="title" value="Add an explicit local source health indicator" /></div><div class="field"><label for="phase">Suggested Phase</label><select id="phase"><option>Foundation</option><option>Delivery</option></select></div><div class="field"><label for="priority">Suggested priority</label><select id="priority"><option>P1</option><option>P0</option><option>P2</option></select></div><div class="field field--wide"><label for="outcome">Expected outcome</label><textarea id="outcome">The owner can identify malformed or unsafe planning files before choosing a repair.</textarea></div><div class="field field--wide"><label for="done">Draft Done When</label><textarea id="done">A repository agent validates the planning document and records the resulting diff.</textarea></div><div class="field field--wide"><label for="notes">Notes for the repository agent</label><textarea id="notes">Keep docs/BACKLOG.md as the only source of truth; do not create a second backlog.</textarea></div></div><pre class="proposal-copy">${escapeHtml(proposal)}</pre><div class="handoff-actions"><button class="btn" type="button">Edit request</button><button class="btn btn--primary" type="button">Copy proposal</button></div></div></section>${rail()}</div>`; }

function render() {
  document.body.dataset.reducedMotion = String(state.reduced);
  sourceStrip();
  document.querySelectorAll("[data-state]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.state === state.current)));
  const views = { unranked: unrankedView, editing: editingView, review: () => reviewView(false), renumber: () => reviewView(true), stale: staleView, invalid: invalidView, readonly: readonlyView, cached: cachedView, loading: loadingView, empty: emptyView, applying: applyingView, success: successView, locked: lockedView, unavailable: unavailableView, handoff: handoffView };
  const root = $("#backlog-mockup"); root.dataset.state = state.current; root.innerHTML = views[state.current]();
  root.querySelectorAll("[data-next]").forEach((button) => button.addEventListener("click", () => { state.current = button.dataset.next; history.replaceState(null, "", `?state=${state.current}`); render(); }));
}
document.querySelectorAll(".state-nav button[data-state]").forEach((button) => button.addEventListener("click", () => { state.current = button.dataset.state; history.replaceState(null, "", `?state=${state.current}`); render(); }));
$("#reduced-motion").addEventListener("change", (event) => { state.reduced = event.target.checked; render(); });
render();
