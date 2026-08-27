const state = { route: "portfolio", scenario: "default", filter: "attention" };

const icons = {
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17.5v.5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>`,
  info: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>`
};

const scenarios = {
  portfolio: [
    ["default", "Current workbench"],
    ["loading", "Loading items"],
    ["empty", "No registered projects"],
    ["stale", "Stale external source"]
  ],
  projects: [
    ["default", "Registered projects"],
    ["loading", "Initial loading"],
    ["filtered", "No filter matches"],
    ["empty", "No projects"]
  ],
  tasks: [
    ["default", "Active queue"],
    ["loading", "Initial loading"],
    ["empty", "No tasks"],
    ["validation", "Validation failure"],
    ["pending", "Write pending"],
    ["success", "Write success"],
    ["stale", "Stale-write conflict"],
    ["filesystem", "Filesystem failure"]
  ],
  code: [
    ["default", "Healthy projection"],
    ["loading", "Initial loading"],
    ["empty", "Empty Roadmap"],
    ["empty-tasks", "No project Tasks"],
    ["partial", "Partial external validity"],
    ["missing", "Source document missing"],
    ["not-configured", "Source not configured"],
    ["unavailable", "Source unavailable"],
    ["unsupported", "Unsupported provider"]
  ],
  business: [
    ["default", "Native planning"],
    ["loading", "Initial loading"],
    ["empty", "No project Tasks"],
    ["validation", "Validation failure"],
    ["pending", "Write pending"],
    ["success", "Write success"],
    ["stale", "Stale-write conflict"],
    ["archived", "Archived read-only"]
  ],
  register: [
    ["candidate", "Candidate found"],
    ["loading", "Inspecting candidate"],
    ["proposal", "Proposal ready"],
    ["collision", "Identity collision"],
    ["stale", "Stale proposal"],
    ["registered", "Registered"]
  ],
  archived: [
    ["default", "Archived projects"],
    ["loading", "Loading archive"],
    ["empty", "No archived projects"],
    ["warning", "Archive warning"],
    ["archive-proposal", "Archive proposal"],
    ["proposal", "Restore proposal"],
    ["blocked", "Restore blocked"],
    ["stale", "Stale restore proposal"]
  ]
};

const tasks = [
  { id: "AJ-T-041", title: "Review registration proposal", context: "Confirm trusted path and zero-write inspection", project: "AllJobs", due: "Today", source: "native", attention: "attention" },
  { id: "git:AJ-B-015", title: "Repair BACKLOG metadata", context: "Invalid priority isolated to one section", project: "AllJobs", due: "Blocked", source: "external", attention: "blocked" },
  { id: "AJ-T-118", title: "Follow up distributor shortlist", context: "Waiting on Northstar Trading", project: "SEA Launch", due: "28 Aug", source: "native", attention: "waiting" },
  { id: "git:S17-06", title: "Verify permission handoff", context: "Fresh-context probe after reconnect", project: "GrandeGPT", due: "29 Aug", source: "external", attention: "attention" },
  { id: "AJ-T-052", title: "Record recovery rehearsal", context: "Add verified rollback observation", project: "TradeLinks", due: "3 Sep", source: "native", attention: "normal" },
  { id: "AJ-T-119", title: "Draft pilot decision note", context: "Capture partner evidence and open assumptions", project: "SEA Launch", due: "30 Aug", source: "native", attention: "normal" },
  { id: "AJ-T-120", title: "Validate landed cost assumptions", context: "Waiting on revised freight estimate", project: "SEA Launch", due: "2 Sep", source: "native", attention: "waiting" },
  { id: "AJ-T-033", title: "Retire legacy sample data", context: "Completed with rollback tag retained", project: "AllJobs", due: "Done", source: "native", attention: "history" }
];

const backlog = [
  { id: "AJ-B-014", title: "Registration and archive contracts", context: "Two-phase inspect, digest recheck, Human Gate", priority: "P0", phase: "Planning Core V1", status: "Ready" },
  { id: "AJ-B-015", title: "Provider state projection", context: "Retain last success and isolate ProofIssue", priority: "P0", phase: "Planning Core V1", status: "Proof issue" },
  { id: "AJ-B-018", title: "Native task write path", context: "Lock, digest compare, validate and atomic rename", priority: "P1", phase: "Native flows", status: "Planned" },
  { id: "AJ-B-021", title: "Agent planning skill", context: "Fixed Roadmap and single Backlog document", priority: "P1", phase: "Adoption", status: "Planned" }
];

function badge(kind, label) {
  return `<span class="badge badge--${kind}">${label}</span>`;
}

function notice(type, title, body, action = "", actionLabel = "Recover") {
  const icon = type === "success" ? icons.check : type === "error" || type === "warning" ? icons.alert : icons.info;
  return `<div class="notice notice--${type}" role="${type === "error" ? "alert" : "status"}">${icon}<div><strong>${title}</strong><span>${body}</span></div>${action ? `<button type="button" data-action="${action}">${actionLabel}</button>` : ""}</div>`;
}

function pageHeading(label, title, copy, actions = "") {
  return `<header class="page-heading"><div class="page-heading__copy"><p class="coordinate-label">${label}</p><h1>${title}</h1><p>${copy}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</header>`;
}

function ledgerRows(items = tasks) {
  return `<ul class="ledger-list">${items.map(item => {
    const isTask = "source" in item;
    const attention = isTask ? item.attention : item.status === "Proof issue" ? "blocked" : "normal";
    const source = isTask ? item.source : "external";
    return `<li class="ledger-row ledger-row--${attention}">
      <span class="ledger-row__id">${item.id}</span>
      <span class="ledger-row__title"><strong>${item.title}</strong><span>${item.context}</span></span>
      <span class="ledger-row__project">${isTask ? item.project : item.phase}</span>
      <span class="ledger-row__due">${isTask ? item.due : `${item.priority} · ${item.status}`}</span>
      ${badge(source === "native" ? "native" : "external", source === "native" ? "Native" : "Repo")}
      <button class="ledger-row__open" type="button" data-action="inspect" aria-label="Inspect ${item.title}">${icons.arrow}</button>
    </li>`;
  }).join("")}</ul>`;
}

function backlogAccordion(items = backlog) {
  return `<div class="backlog-accordion">${items.map((item, idx) => {
    const isProofIssue = item.status === "Proof issue";
    const attention = isProofIssue ? "blocked" : "normal";
    const isFirst = idx === 0;
    return `<div class="backlog-item ${isFirst ? "is-expanded" : ""}" data-backlog-id="${item.id}">
      <div class="backlog-row ledger-row--${attention}" role="button" tabindex="0" aria-expanded="${isFirst}">
        <span class="ledger-row__id">${item.id}</span>
        <span class="ledger-row__title"><strong>${item.title}</strong><span>${item.context}</span></span>
        <span class="ledger-row__project">${item.phase}</span>
        <span class="ledger-row__due">${item.priority} · ${item.status}</span>
        ${badge("external", "Repo")}
        <svg class="chevron-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </div>
      <div class="backlog-drawer">
        <div class="backlog-drawer__content">
          <div class="backlog-drawer__desc">${item.context}. Defined in canonical repository document. Read-only in AllJobs.</div>
          <div class="backlog-drawer__meta">
            <span><strong>PHASE:</strong> ${item.phase}</span>
            <span><strong>PRIORITY:</strong> ${item.priority}</span>
            <span><strong>STATUS:</strong> ${item.status}</span>
            <span><strong>SOURCE:</strong> docs/BACKLOG.md</span>
          </div>
          <div class="backlog-drawer__actions">
            <button class="backlog-drawer__btn" type="button" data-action="copy-id" data-id="${item.id}">Copy ID</button>
            <button class="backlog-drawer__btn" type="button" data-action="new-task" data-prefill="${item.title}">Create native Task</button>
            <button class="backlog-drawer__btn" type="button" data-action="view-source">View in repo</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function roadmapTimelineV(phases = [
  { id: "p1", title: "Phase 01: Planning Core", status: "Active", state: "active", subtitle: "2 backlog items · 1 active task", desc: "Greenfield federated planning core with read-only git mirror and native Task model." },
  { id: "p2", title: "Phase 02: Projection", status: "Next", state: "next", subtitle: "1 proof issue to isolate", desc: "Multi-repo projection worker and background launchd daemon." },
  { id: "p3", title: "Phase 03: Native flows", status: "Planned", state: "planned", subtitle: "1 backlog item planned", desc: "Atomic native task write path, digest comparison, and locking." }
]) {
  return `<div class="roadmap-timeline-v">${phases.map(p => `
    <div class="timeline-node timeline-node--${p.state}">
      <div class="timeline-card">
        <div class="timeline-card__header">
          <strong>${p.title}</strong>
          ${badge(p.state === "active" ? "healthy" : p.state === "done" ? "healthy" : "archived", p.status)}
        </div>
        <p>${p.desc}</p>
        <div class="timeline-card__meta">
          <span>${p.subtitle}</span>
          <span>docs/ROADMAP.md</span>
        </div>
      </div>
    </div>`).join("")}
  </div>`;
}

function milestoneTimelineV(milestones = [
  { id: "m1", title: "M-01: Market frame", status: "Done", state: "done", subtitle: "18 historical tasks", desc: "Completed market scan and initial partner alignment." },
  { id: "m2", title: "M-02: Partner validation", status: "Active", state: "active", subtitle: "3 active tasks · 1 blocked", desc: "Shortlist distributors and validate landed freight costs." },
  { id: "m3", title: "M-03: Pilot launch", status: "Next", state: "next", subtitle: "1 task planned", desc: "Execute regional pilot launch in Singapore & Malaysia." }
]) {
  return `<div class="roadmap-timeline-v">${milestones.map(m => `
    <div class="timeline-node timeline-node--${m.state}">
      <div class="timeline-card">
        <div class="timeline-card__header">
          <strong>${m.title}</strong>
          ${badge(m.state === "active" ? "native" : m.state === "done" ? "healthy" : "archived", m.status)}
        </div>
        <p>${m.desc}</p>
        <div class="timeline-card__meta">
          <span>${m.subtitle}</span>
          <span>AJ-R-004 · native</span>
        </div>
      </div>
    </div>`).join("")}
  </div>`;
}

function legend() {
  return `<div class="legend" aria-label="Reading key">
    <span class="legend__item"><i class="legend-mark legend-mark--native"></i>Native writable (solid)</span>
    <span class="legend__item"><i class="legend-mark legend-mark--external"></i>External read-only (hatch)</span>
  </div>`;
}

function skeleton() {
  return `<div class="skeleton-list" aria-label="Loading planning items">
    <div class="skeleton-row"><i class="skeleton"></i><i class="skeleton"></i><i class="skeleton"></i><i class="skeleton"></i></div>
    <div class="skeleton-row"><i class="skeleton"></i><i class="skeleton"></i><i class="skeleton"></i><i class="skeleton"></i></div>
    <div class="skeleton-row"><i class="skeleton"></i><i class="skeleton"></i><i class="skeleton"></i><i class="skeleton"></i></div>
    <div class="skeleton-row"><i class="skeleton"></i><i class="skeleton"></i><i class="skeleton"></i><i class="skeleton"></i></div>
  </div>`;
}

function emptyState(title, copy, action, route) {
  return `<div class="empty-state">
    <h2>${title}</h2>
    <p>${copy}</p>
    <button class="button button--primary" type="button" data-route="${route}">${action}</button>
  </div>`;
}

function updateStatusStrip() {
  const strip = document.querySelector("#status-strip");
  if (!strip) return;
  const s = state.scenario;
  const r = state.route;

  let content = "";
  if (r === "portfolio") {
    const statusText = s === "stale" ? "STALE PROJECTION (FETCH FAILED 10:42)" : s === "empty" ? "NO BINDINGS" : "FRESH (LAST READ 10:42 SGT)";
    content = `<span>ROUTE: <strong>/portfolio</strong></span>
      <span>SOURCES: <strong>4/4 REPOSITORIES</strong></span>
      <span>PROVENANCE: <strong>2 NATIVE / 2 GIT MIRROR</strong></span>
      <span>STATUS: <strong>${statusText}</strong></span>`;
  } else if (r === "projects") {
    const statusText = s === "empty" ? "EMPTY" : "4 ACTIVE BINDINGS";
    content = `<span>ROUTE: <strong>/projects</strong></span>
      <span>SCOPE: <strong>FEDERATED REGISTRY</strong></span>
      <span>BINDINGS: <strong>3 CODE · 1 BUSINESS</strong></span>
      <span>STATUS: <strong>${statusText}</strong></span>`;
  } else if (r === "tasks") {
    const activeTasks = tasks.filter(t => t.attention !== "history");
    const writableTasks = activeTasks.filter(t => t.source === "native");
    const statusText = s === "stale" ? "STALE WRITE CONFLICT" : s === "pending" ? "DIGEST CHECK PENDING" : s === "validation" ? "VALIDATION ERROR" : "SYNCED";
    content = `<span>ROUTE: <strong>/tasks</strong></span>
      <span>ACTIVE: <strong>${activeTasks.length}</strong></span>
      <span>WRITABLE: <strong>${writableTasks.length} NATIVE</strong></span>
      <span>DIGEST CHECK: <strong>EXACT COMPARE</strong></span>
      <span>STATUS: <strong>${statusText}</strong></span>`;
  } else if (r === "code") {
    const statusText = s === "unavailable" ? "STALE" : s === "missing" ? "SOURCE MISSING" : s === "partial" ? "PROOF ISSUE" : s === "unsupported" ? "UNSUPPORTED" : "FRESH";
    content = `<span>ROUTE: <strong>/projects/alljobs</strong></span>
      <span>CUSTODY: <strong>git-markdown (READ-ONLY)</strong></span>
      <span>REVISION: <strong>7bc40e1 · main</strong></span>
      <span>DIGEST: <strong>docs/BACKLOG.md:8f2a…19c</strong></span>
      <span>STATUS: <strong>${statusText}</strong></span>`;
  } else if (r === "business") {
    const statusText = s === "archived" ? "ARCHIVED (READ-ONLY)" : s === "stale" ? "STALE WRITE CONFLICT" : "WRITABLE";
    content = `<span>ROUTE: <strong>/projects/sea-launch</strong></span>
      <span>CUSTODY: <strong>alljobs-native (WRITABLE)</strong></span>
      <span>ROADMAP: <strong>AJ-R-004</strong></span>
      <span>DIGEST: <strong>52d9…e81</strong></span>
      <span>STATUS: <strong>${statusText}</strong></span>`;
  } else if (r === "register") {
    const isReady = s === "proposal";
    const statusText = s === "collision" ? "IDENTITY COLLISION" : s === "stale" ? "STALE PROPOSAL" : s === "registered" ? "REGISTERED" : isReady ? "PROPOSAL READY" : "INSPECTION";
    content = `<span>ROUTE: <strong>/register</strong></span>
      <span>CANDIDATE: <strong>/doclock</strong></span>
      <span>MUTATION: <strong>ZERO WRITES UNTIL GATE</strong></span>
      <span>PROPOSAL: <strong>${isReady ? "DIGEST 9a72…4c1" : "NOT APPLIED"}</strong></span>
      <span>STATUS: <strong>${statusText}</strong></span>`;
  } else if (r === "archived") {
    const statusText = s === "blocked" ? "RESTORE BLOCKED" : s === "stale" ? "STALE PROPOSAL" : "RETAINED";
    content = `<span>ROUTE: <strong>/archived</strong></span>
      <span>BINDINGS: <strong>2 ARCHIVED (READ-ONLY)</strong></span>
      <span>RECOVERY: <strong>HUMAN GATE RECHECK</strong></span>
      <span>INTEGRITY: <strong>HISTORY PRESERVED</strong></span>
      <span>STATUS: <strong>${statusText}</strong></span>`;
  }
  strip.innerHTML = content;
}

function portfolioPage() {
  const scenario = state.scenario;
  const alert = scenario === "stale" ? notice("warning", "TradeLinks projection is stale", "Last success 09:10 SGT. Fetch failed at 10:42; last-known Backlog and Tasks remain visible.", "refresh") : "";
  const body = scenario === "loading" ? skeleton() : scenario === "empty" ? emptyState("No projects are registered", "Inspect a trusted direct-child candidate to create the first project binding. Inspection performs no writes.", "Register a project", "register") : ledgerRows(tasks.filter(t => t.attention !== "history").slice(0, 5));

  const metricsGrid = `<div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-card__header">
        <span>Active projects</span>
        <span class="status-dot status-dot--healthy"></span>
      </div>
      <div class="metric-card__value">4</div>
      <div class="metric-card__footer">
        <span>3 Code · 1 Business</span>
        <span style="color:var(--green)">4/4 Synced</span>
      </div>
    </div>

    <div class="metric-card">
      <div class="metric-card__header">
        <span>Ongoing work</span>
        <span class="badge badge--native">5 Native</span>
      </div>
      <div class="metric-card__value">7</div>
      <div class="metric-card__footer">
        <span>3 In progress · 2 Waiting</span>
        <span>2 Repo mirror</span>
      </div>
    </div>

    <div class="metric-card">
      <div class="metric-card__header">
        <span>Attention required</span>
        <span class="badge badge--blocked">Action</span>
      </div>
      <div class="metric-card__value">2</div>
      <div class="metric-card__footer">
        <span style="color:var(--rust);font-weight:600;">1 Blocked</span>
        <span style="color:#8A580A;font-weight:600;">1 Stale</span>
      </div>
    </div>

    <div class="metric-card">
      <div class="metric-card__header">
        <span>August velocity</span>
        <span style="color:var(--green);font-weight:600;">↑ 94%</span>
      </div>
      <div class="metric-card__value">18</div>
      <div class="metric-card__footer">
        <span>Tasks completed</span>
        <span>0 DB writes</span>
      </div>
    </div>
  </div>`;

  const velocityChart = `<div class="surface">
    <div class="surface__header">
      <div><h2>Work activity & sync pace</h2><p>Daily completed items & git projections</p></div>
      ${badge("healthy", "Weekly")}
    </div>
    <div class="activity-chart">
      <svg class="chart-svg" viewBox="0 0 340 90" preserveAspectRatio="none" aria-label="Weekly activity curve">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--amber)" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="var(--amber)" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <path class="chart-area" d="M 10,65 Q 60,75 110,40 T 210,30 T 280,18 T 330,12 L 330,90 L 10,90 Z" fill="url(#chartGrad)"/>
        <path class="chart-line" d="M 10,65 Q 60,75 110,40 T 210,30 T 280,18 T 330,12"/>
        <circle class="chart-point" cx="10" cy="65" r="4"/>
        <circle class="chart-point" cx="110" cy="40" r="4"/>
        <circle class="chart-point" cx="210" cy="30" r="4"/>
        <circle class="chart-point" cx="280" cy="18" r="4"/>
        <circle class="chart-point" cx="330" cy="12" r="5"/>
      </svg>
      <div class="chart-labels">
        <span>Mon (2)</span>
        <span>Tue (4)</span>
        <span>Wed (5)</span>
        <span>Thu (8)</span>
        <span>Today (18)</span>
      </div>
    </div>
  </div>`;

  return `${pageHeading("Portfolio workbench · daily command", "Start with ongoing work, not the map.", "Personal single-owner control plane. Review active work across federated repositories and native business operations.", `<button class="button button--quiet" type="button" data-route="projects">Browse projects</button><button class="button button--primary" type="button" data-action="new-task">+ New native task</button>`)}${alert}${metricsGrid}<div class="route-grid">
    <section class="surface surface--flush" aria-labelledby="focus-heading">
      <div class="surface__header">
        <div><h2 id="focus-heading">Ongoing work queue</h2><p>Active and attention-bearing backlog & tasks</p></div>
        ${badge("healthy", "Last read 10:42")}
      </div>
      <div class="ledger-toolbar">
        <div class="filter-group">
          <button class="filter-button" aria-pressed="true">All ongoing</button>
          <button class="filter-button" aria-pressed="false">Needs attention (2)</button>
          <button class="filter-button" aria-pressed="false">In progress (3)</button>
          <button class="filter-button" aria-pressed="false">Waiting (2)</button>
        </div>
        ${legend()}
      </div>
      ${body}
    </section>
    <div class="panel-stack">
      ${velocityChart}
      <section class="surface">
        <div class="surface__header">
          <div><h2>Active roadmap phases</h2><p>Cross-project timeline</p></div>
        </div>
        <div class="surface__body">
          ${roadmapTimelineV([
            { id: "alljobs", title: "AllJobs · Phase 01", status: "Active", state: "active", subtitle: "Planning Core V1 · 2 backlog", desc: "Greenfield rebuild and T3 mockup gate." },
            { id: "sea", title: "SEA Launch · M-02", status: "Active", state: "active", subtitle: "Partner validation · 3 tasks", desc: "Distributor follow-ups and freight landing." },
            { id: "tradelinks", title: "TradeLinks · P0", status: "Attention", state: "next", subtitle: "Intelligence Foundation · 1 stale", desc: "Refresh worker recovery probe." }
          ])}
        </div>
      </section>
    </div>
  </div>`;
}

function projectsPage() {
  const filtered = state.scenario === "filtered";
  const loading = state.scenario === "loading";
  const empty = state.scenario === "empty";

  if (empty) {
    return `${pageHeading("Project registry", "No registered projects yet.", "A project appears here only after a candidate has passed inspection, digest confirmation, and the Human Gate.", `<button class="button button--primary" data-route="register">+ Register project</button>`)}<section class="surface">${emptyState("The portfolio is empty", "Start with one code repository or explicitly create one business project.", "Inspect candidates", "register")}</section>`;
  }

  const toolbar = `<div class="projects-toolbar">
    <div class="projects-toolbar__left">
      <div class="filter-group">
        <button class="filter-button" aria-pressed="${!filtered}">All projects</button>
        <button class="filter-button" aria-pressed="false">Code</button>
        <button class="filter-button" aria-pressed="false">Business</button>
        <button class="filter-button" aria-pressed="${filtered}">Needs attention (1)</button>
      </div>
    </div>
    <button class="button button--primary" type="button" data-route="register">+ Register project</button>
  </div>`;

  const cards = loading ? `<div class="skeleton-card-grid">
    <div class="skeleton-card"><i class="skeleton" style="width:50%;height:18px;"></i><i class="skeleton" style="width:100%;height:40px;"></i><i class="skeleton" style="width:70%;height:14px;"></i></div>
    <div class="skeleton-card"><i class="skeleton" style="width:50%;height:18px;"></i><i class="skeleton" style="width:100%;height:40px;"></i><i class="skeleton" style="width:70%;height:14px;"></i></div>
    <div class="skeleton-card"><i class="skeleton" style="width:50%;height:18px;"></i><i class="skeleton" style="width:100%;height:40px;"></i><i class="skeleton" style="width:70%;height:14px;"></i></div>
    <div class="skeleton-card"><i class="skeleton" style="width:50%;height:18px;"></i><i class="skeleton" style="width:100%;height:40px;"></i><i class="skeleton" style="width:70%;height:14px;"></i></div>
  </div>` : filtered ? emptyState("No projects match these filters", "The registry still contains four projects. Clear the filters to see them.", "Clear filters", "projects") : `<div class="projects-grid">
    <button class="project-card" type="button" data-route="code" aria-label="Open AllJobs project">
      <div class="project-card__header">
        <div class="project-card__title">
          <h3>AllJobs</h3>
          <p>Planning Core V1 · Phase 01</p>
        </div>
        ${badge("healthy", "Fresh")}
      </div>
      <div class="project-card__body">
        <div class="project-card__tags">
          <span class="coordinate-label">Code</span>
          ${badge("external", "Repo")}
        </div>
        <div class="project-card__metrics">
          <span><strong>5</strong> tasks</span>
          <span><strong>4</strong> backlog</span>
        </div>
      </div>
      <div class="project-card__footer">
        <span>docs/ROADMAP.md · docs/BACKLOG.md</span>
        <span class="project-card__arrow">→</span>
      </div>
    </button>

    <button class="project-card" type="button" data-route="projects" aria-label="Inspect TradeLinks project">
      <div class="project-card__header">
        <div class="project-card__title">
          <h3>TradeLinks</h3>
          <p>Intelligence Foundation · P0</p>
        </div>
        ${badge("stale", "Stale (10:42)")}
      </div>
      <div class="project-card__body">
        <div class="project-card__tags">
          <span class="coordinate-label">Code</span>
          ${badge("external", "Repo")}
        </div>
        <div class="project-card__metrics">
          <span><strong>3</strong> tasks</span>
          <span><strong>1</strong> blocked</span>
        </div>
      </div>
      <div class="project-card__footer">
        <span>docs/ROADMAP.md</span>
        <span class="project-card__arrow">→</span>
      </div>
    </button>

    <button class="project-card" type="button" data-route="projects" aria-label="Inspect GrandeGPT project">
      <div class="project-card__header">
        <div class="project-card__title">
          <h3>GrandeGPT</h3>
          <p>Capability simplification · Sprint 17</p>
        </div>
        ${badge("healthy", "Fresh")}
      </div>
      <div class="project-card__body">
        <div class="project-card__tags">
          <span class="coordinate-label">Code</span>
          ${badge("external", "Repo")}
        </div>
        <div class="project-card__metrics">
          <span><strong>2</strong> tasks</span>
          <span><strong>0</strong> backlog</span>
        </div>
      </div>
      <div class="project-card__footer">
        <span>docs/ROADMAP.md</span>
        <span class="project-card__arrow">→</span>
      </div>
    </button>

    <button class="project-card" type="button" data-route="business" aria-label="Open Southeast Asia Launch project">
      <div class="project-card__header">
        <div class="project-card__title">
          <h3>Southeast Asia Launch</h3>
          <p>Partner validation · Milestone 02</p>
        </div>
        ${badge("native", "Native")}
      </div>
      <div class="project-card__body">
        <div class="project-card__tags">
          <span class="coordinate-label">Business</span>
          ${badge("native", "Writable")}
        </div>
        <div class="project-card__metrics">
          <span><strong>4</strong> tasks</span>
          <span><strong>3</strong> milestones</span>
        </div>
      </div>
      <div class="project-card__footer">
        <span>AJ-R-004 · native</span>
        <span class="project-card__arrow">→</span>
      </div>
    </button>
  </div>`;

  return `${pageHeading("Project registry", "Every project has a known custody model and owner.", "Filter by type, work mode, tags, source state, or attention without altering canonical project records.")}${toolbar}<div class="route-grid route-grid--projects">
    <section class="surface surface--flush" style="background:transparent;border:0;">
      ${cards}
    </section>
    <div class="panel-stack">
      <section class="surface">
        <div class="surface__header">
          <div><h2>Registry summary</h2><p>Control Host local state</p></div>
        </div>
        <div class="surface__body">
          <dl class="fact-list">
            <div><dt>Total bindings</dt><dd>4 active</dd></div>
            <div><dt>Code repositories</dt><dd>3 (read-only mirrors)</dd></div>
            <div><dt>Business projects</dt><dd>1 (native Markdown)</dd></div>
            <div><dt>Trusted root</dt><dd>/Users/xtation/...</dd></div>
            <div><dt>Storage</dt><dd>Local Markdown (0 DB)</dd></div>
          </dl>
        </div>
      </section>
      <section class="surface">
        <div class="surface__header">
          <div><h2>Reading key</h2><p>Custody fill semantics</p></div>
        </div>
        <div class="surface__body">
          ${legend()}
        </div>
      </section>
    </div>
  </div>`;
}

function tasksPage() {
  const s = state.scenario;
  const stateNotice = s === "validation" ? notice("error", "Task was not created", "Target date must be a valid date. Your input is preserved; focus moves to the first invalid field.") : s === "pending" ? notice("info", "Writing AJ-T-124", "Duplicate submit is disabled while the project lock and expected digest are checked.") : s === "success" ? notice("success", "AJ-T-124 created", "The native task file now has digest 52d9…e81. The new row is announced and focused.") : s === "stale" ? notice("warning", "STALE_WRITE", "The canonical file changed after this form opened. Your input is preserved; reread the latest content before retrying.", "reread") : s === "filesystem" ? notice("error", "FILESYSTEM_ERROR", "No success was recorded. Reread the canonical file, verify the Control Host path, then retry safely.", "reread") : "";
  const empty = s === "empty";
  const loading = s === "loading";
  const activeTasks = tasks.filter(task => task.attention !== "history");
  const historyTasks = tasks.filter(task => task.attention === "history");
  const writableTasks = activeTasks.filter(task => task.source === "native");
  const action = `<button class="button button--quiet" type="button">Export view</button><span><button class="button button--primary" type="button" data-action="new-task" ${s === "pending" ? "disabled" : ""}>New native task</button>${s === "pending" ? `<small class="button-reason">Wait for digest check to finish</small>` : ""}</span>`;

  return `${pageHeading("Cross-project work ledger", "Tasks stay readable before they become visualized.", "Scan native and external Tasks together. Ownership, waiting events, dependencies, project context, and recovery remain explicit.", action)}${stateNotice}<div class="route-grid" style="margin-top:${stateNotice ? 16 : 0}px">
    <section class="surface surface--flush">
      <div class="surface__header">
        <div><h2>Active tasks</h2><p>${empty ? "No Tasks in this view" : `${activeTasks.length} active · ${historyTasks.length} history · ${writableTasks.length} native writable`}</p></div>
        ${badge("native", `${writableTasks.length} writable`)}
      </div>
      <div class="ledger-toolbar">
        <div class="filter-group">
          <button class="filter-button" aria-pressed="true">Active</button>
          <button class="filter-button" aria-pressed="false">Waiting</button>
          <button class="filter-button" aria-pressed="false">Blocked</button>
          <button class="filter-button" aria-pressed="false">History</button>
        </div>
        ${legend()}
      </div>
      ${loading ? skeleton() : empty ? emptyState("No Tasks match this view", "Clear filters or create a native Task. External sources remain read-only.", "Clear filters", "tasks") : ledgerRows(tasks)}
    </section>
    <div class="panel-stack">
      <section class="surface">
        <div class="surface__header">
          <div><h2>Task provenance breakdown</h2><p>Cross-project authority</p></div>
        </div>
        <div class="surface__body">
          <dl class="fact-list">
            <div><dt>AllJobs (Native)</dt><dd>2 active · 1 history</dd></div>
            <div><dt>AllJobs (Repo mirror)</dt><dd>1 active (blocked)</dd></div>
            <div><dt>SEA Launch (Native)</dt><dd>3 active</dd></div>
            <div><dt>GrandeGPT (Repo mirror)</dt><dd>1 active</dd></div>
            <div><dt>TradeLinks (Native)</dt><dd>1 active</dd></div>
          </dl>
        </div>
      </section>
      <section class="surface">
        <div class="surface__header">
          <div><h2>Reading key</h2><p>Authority never depends on color</p></div>
        </div>
        <div class="surface__body">
          ${legend()}
          <dl class="fact-list" style="margin-top:14px;">
            <div><dt>Solid badge</dt><dd>AllJobs-native writable</dd></div>
            <div><dt>Hatch badge</dt><dd>External read-only mirror</dd></div>
            <div><dt>Rust border</dt><dd>Blocked (explicit reason)</dd></div>
            <div><dt>Amber border</dt><dd>Attention required</dd></div>
          </dl>
        </div>
      </section>
    </div>
  </div>`;
}

function codePage() {
  const s = state.scenario;
  const problem = s === "partial" ? notice("warning", "Partial external validity", "AJ-B-015 has an invalid priority. Three healthy Backlog items remain visible; fix docs/BACKLOG.md through the repository planning skill.", "inspect-issue") : s === "missing" ? notice("error", "Source document missing", "Expected docs/BACKLOG.md at revision 7bc40e1. Restore the fixed document path in the repository and refresh.", "refresh") : s === "not-configured" ? notice("warning", "Planning source not configured", "This code project is registered, but fixed Roadmap and Backlog paths are absent. Add them through the repository planning skill, then refresh.", "refresh") : s === "unavailable" ? notice("error", "Source unavailable", "Fetch failed at 10:42 SGT. Last success 09:10 remains visible and is marked stale.", "refresh") : s === "unsupported" ? notice("error", "Unsupported provider: notion", "Planning Core V1 supports git-markdown for Roadmap and Backlog. Other projects remain healthy.") : "";
  const taskView = s === "empty-tasks";
  const ledger = s === "loading" ? skeleton() : s === "empty" ? emptyState("Roadmap has no Backlog items", "The repository document is valid but contains no active items. Add work in docs/BACKLOG.md through the planning skill.", "Inspect source custody", "code") : taskView ? emptyState("No Tasks under this project", "External and native Task sources are healthy, but neither contains an active Task for AllJobs.", "Create native Task", "code") : backlogAccordion(s === "partial" ? backlog : backlog.map(b => ({...b,status:b.status === "Proof issue" ? "Ready" : b.status})));

  const roadmapPanel = s === "empty" ? emptyState("Roadmap has no defined Phases", "The fixed Roadmap document is valid but empty. Add the first Phase in docs/ROADMAP.md through the planning skill.", "Inspect source custody", "code") : roadmapTimelineV();

  return `${pageHeading("AllJobs · code project", "Backlog first, Roadmap always in reach.", "Repository Roadmap and Backlog remain read-only. Click any Backlog item to expand details or create a native Task.", `<button class="button button--quiet" type="button" data-action="archive">Archive project</button><button class="button button--primary" type="button" data-action="new-task">New native task</button>`)}${problem}<div class="route-grid route-grid--detail" style="margin-top:${problem ? 16 : 0}px">
    <section class="surface surface--flush">
      <div class="surface__header">
        <div><h2>${taskView ? "Task ledger" : "Backlog ledger (drawer details)"}</h2><p>${taskView ? "External + native · no active rows" : "docs/BACKLOG.md · click row to expand"}</p></div>
        ${badge(s === "unavailable" ? "stale" : "healthy", s === "unavailable" ? "Stale" : "Fresh")}
      </div>
      <div class="tabs">
        <button aria-pressed="${!taskView}">Backlog · 4</button>
        <button aria-pressed="${taskView}">Tasks · ${taskView ? 0 : 3}</button>
        <button aria-pressed="false">History</button>
      </div>
      ${ledger}
    </section>
    <div class="panel-stack">
      <section class="surface">
        <div class="surface__header">
          <div><h2>Roadmap timeline</h2><p>Vertical phase progression</p></div>
        </div>
        <div class="surface__body">
          ${roadmapPanel}
        </div>
      </section>
      <section class="surface">
        <div class="surface__header">
          <div><h2>Source custody</h2><p>One exact revision</p></div>
        </div>
        <div class="surface__body">
          <dl class="fact-list">
            <div><dt>Provider</dt><dd>git-markdown</dd></div>
            <div><dt>Revision</dt><dd>7bc40e1 · main</dd></div>
            <div><dt>Roadmap</dt><dd>docs/ROADMAP.md</dd></div>
            <div><dt>Backlog</dt><dd>docs/BACKLOG.md</dd></div>
            <div><dt>Authority</dt><dd>Read-only projection</dd></div>
          </dl>
        </div>
      </section>
    </div>
  </div>`;
}

function businessPage() {
  const s = state.scenario;
  const stateNotice = s === "archived" ? notice("warning", "This project is archived", "History remains inspectable. Native writes are disabled until restore passes revalidation.") : s === "validation" ? notice("error", "Milestone was not saved", "Title is required. Input is preserved and focus moves to the field.") : s === "pending" ? notice("info", "Writing native Task", "The expected digest is being checked. Duplicate submission is disabled.") : s === "success" ? notice("success", "Task created", "AJ-T-119 now belongs to Milestone M-02 and is visible in the ledger.") : s === "stale" ? notice("warning", "STALE_WRITE", "Newer native content exists. Reread it before intentionally retrying; your input is preserved.", "reread") : "";
  const disabled = s === "archived" || s === "pending";
  const reason = s === "archived" ? "Restore before writing" : s === "pending" ? "Wait for digest check to finish" : "";
  const projectTasks = tasks.filter(t => t.project === "SEA Launch");
  const ledger = s === "loading" ? skeleton() : s === "empty" ? emptyState("No Tasks under this project", "Create a native Task and bind it directly to a Milestone, or leave it independent.", "Create native Task", "business") : ledgerRows(projectTasks);

  return `${pageHeading("Southeast Asia Launch · business project", "Tasks lead; milestones provide structure.", "Business projects have native Milestones and Tasks. There is no Backlog tab, placeholder, or creation affordance.", `<span><button class="button button--quiet" type="button" data-action="new-milestone" ${disabled ? "disabled" : ""}>New milestone</button>${reason ? `<small class="button-reason">${reason}</small>` : ""}</span><span><button class="button button--primary" type="button" data-action="new-task" ${disabled ? "disabled" : ""}>New task</button>${reason ? `<small class="button-reason">${reason}</small>` : ""}</span>`)}${stateNotice}<div class="route-grid route-grid--detail" style="margin-top:${stateNotice ? 16 : 0}px">
    <section class="surface surface--flush">
      <div class="surface__header">
        <div><h2>Task ledger</h2><p>AllJobs-native · writable on Control Host</p></div>
        ${badge(s === "archived" ? "archived" : "native", s === "archived" ? "Read only" : "Writable")}
      </div>
      ${ledger}
    </section>
    <div class="panel-stack">
      <section class="surface">
        <div class="surface__header">
          <div><h2>Milestones timeline</h2><p>Vertical native progression</p></div>
        </div>
        <div class="surface__body">
          ${milestoneTimelineV()}
        </div>
      </section>
      <section class="surface">
        <div class="surface__header">
          <div><h2>Native custody</h2><p>Digest-protected Markdown</p></div>
        </div>
        <div class="surface__body">
          <dl class="fact-list">
            <div><dt>Roadmap</dt><dd>AJ-R-004 · native</dd></div>
            <div><dt>Milestones</dt><dd>3 sections</dd></div>
            <div><dt>Tasks</dt><dd>${projectTasks.length} active · 2 history</dd></div>
            <div><dt>Digest</dt><dd>52d9…e81</dd></div>
          </dl>
        </div>
      </section>
    </div>
  </div>`;
}

function registerPage() {
  const s = state.scenario;
  const active = s === "candidate" || s === "loading" ? 1 : s === "proposal" || s === "collision" || s === "stale" ? 2 : 3;
  const issue = s === "loading" ? notice("info", "Inspecting candidate", "Containment, identity, fixed document paths, schema, and collisions are being checked. No writes are possible in this stage.") : s === "collision" ? notice("error", "Slug collision: alljobs", "An active project already owns this slug and source identity. Apply is unavailable; choose a different candidate or inspect the existing binding.") : s === "stale" ? notice("warning", "STALE_STATE", "The candidate changed after this proposal was created. No canonical writes occurred. Re-inspect and create a new proposal.", "reinspect") : s === "registered" ? notice("success", "Project registered", "DocLock is now available at /projects/doclock. The canonical registry and activity event were written after digest recheck.") : "";
  const proposalReady = s === "proposal";
  const proposalPanel = s === "candidate" || s === "loading" ? `<section class="surface"><div class="surface__header"><div><h2>Proposal not created</h2><p>Inspection remains zero-write</p></div></div><div class="surface__body"><p class="history-note">Exact writes and a digest appear only after candidate inspection completes.</p><button class="button button--primary" type="button" data-action="create-proposal" ${s === "loading" ? "disabled" : ""}>Create / review proposal</button>${s === "loading" ? `<small class="button-reason">Wait for inspection to finish</small>` : ""}</div></section>` : `<section class="surface"><div class="surface__header"><div><h2>Proposed writes</h2><p>AllJobs Control Host only</p></div>${badge(s === "stale" ? "stale" : s === "collision" ? "blocked" : "healthy", s === "stale" ? "Expired" : s === "collision" ? "Blocked" : "Digest ready")}</div><div class="surface__body"><ul class="write-summary"><li><span>Registry</span><span>Create data/projects/doclock.md</span></li><li><span>Provider</span><span>Bind read-only git mirror</span></li><li><span>Native</span><span>Create empty Task document</span></li><li><span>Warnings</span><span>None · repository stays read-only</span></li><li><span>Digest</span><span>proposal: 9a72…4c1</span></li></ul><div style="margin-top:16px"><button class="button button--primary" type="button" data-action="confirm-register" ${proposalReady ? "" : "disabled"}>Confirm registration</button>${!proposalReady ? `<small class="button-reason">${s === "registered" ? "Already applied" : s === "stale" ? "Re-inspect and issue a new digest" : "Resolve the collision first"}</small>` : `<small class="button-reason">Full revalidation runs before any write</small>`}</div></div></section>`;

  return `${pageHeading("Trusted-root registration", "Bind a project only after verification.", "Inspection is read-only. Apply requires exact candidate identity, document summary, proposal digest, and explicit Human confirmation.", `<button class="button button--quiet" type="button">Rescan trusted root</button>`)}<div class="registration-steps">
    <div class="registration-step ${active === 1 ? "registration-step--active" : "registration-step--done"}"><strong>1. Inspect candidate</strong><span>Containment, identity and fixed documents</span></div>
    <div class="registration-step ${active === 2 ? "registration-step--active" : active > 2 ? "registration-step--done" : ""}"><strong>2. Review proposal</strong><span>Writes, warnings and digest</span></div>
    <div class="registration-step ${active === 3 ? "registration-step--active" : ""} "><strong>3. Confirm and apply</strong><span>Full re-inspection before write</span></div>
  </div>${issue}<div class="route-grid" style="margin-top:${issue ? 16 : 0}px">
    <section class="surface">
      <div class="surface__header">
        <div><h2>${s === "candidate" || s === "loading" ? "Candidate inspection" : "Reviewed candidate"}</h2><p>Trusted direct child · zero repo writes</p></div>
        ${badge(s === "collision" ? "blocked" : "healthy", s === "collision" ? "Blocked" : s === "loading" ? "Inspecting" : "Inspected")}
      </div>
      <div class="surface__body">
        ${s === "loading" ? skeleton() : `<p class="candidate-path">/Users/xtation/AgentWorks/GPT_Workspace/doclock</p><dl class="fact-list"><div><dt>Identity</dt><dd>doclock · git repository</dd></div><div><dt>Type</dt><dd>Code development</dd></div><div><dt>Roadmap</dt><dd>docs/ROADMAP.md · healthy</dd></div><div><dt>Backlog</dt><dd>docs/BACKLOG.md · 11 items</dd></div><div><dt>Revision</dt><dd>349abc2 · main</dd></div></dl>`}
      </div>
    </section>
    <div class="panel-stack">
      ${proposalPanel}
      <section class="surface">
        <div class="surface__header">
          <div><h2>Inspection guarantees</h2><p>Non-destructive safeguards</p></div>
        </div>
        <div class="surface__body">
          <dl class="fact-list">
            <div><dt>Trusted root</dt><dd>Direct child check passed</dd></div>
            <div><dt>Zero writes</dt><dd>No execution during inspect</dd></div>
            <div><dt>Digest compare</dt><dd>Required at Human Gate</dd></div>
          </dl>
        </div>
      </section>
    </div>
  </div>`;
}

function archivedPage() {
  const s = state.scenario;
  const issue = s === "loading" ? notice("info", "Reading archived bindings", "History is loading with stable layout; no provider refresh or write is started.") : s === "warning" ? notice("warning", "Archive AllJobs?", "5 active Tasks and 2 external references will disappear from active surfaces. No project, Task, Roadmap, Backlog, or history will be deleted.", "create-archive-proposal", "Review proposal") : s === "archive-proposal" ? notice("info", "Archive proposal ready", "Review the exact active-surface and refresh changes plus digest archive: 2c44…f10 before the Human Gate.") : s === "proposal" ? notice("info", "Restore proposal ready", "Market Research 2025 passed containment, identity, schema, relation, and collision checks. Review digest restore: 781c…ad2 before applying.") : s === "blocked" ? notice("error", "Restore blocked", "The repository now resolves outside the trusted root. No writes occurred; move or re-register the source before retrying.") : s === "stale" ? notice("warning", "STALE_STATE", "The archived binding changed after the restore proposal. No writes occurred. Re-inspect it and create a new digest.", "reinspect") : "";
  const list = s === "loading" ? skeleton() : s === "empty" ? emptyState("No archived projects", "Archived projects will appear here with retained history and an inspect-before-restore flow.", "Return to projects", "projects") : `<div class="project-list" style="padding:12px;"><button class="project-row" data-action="inspect-restore"><span class="project-name"><strong>Market Research 2025</strong><span>Archived 12 Jul · 18 Tasks retained</span></span><span class="coordinate-label">Business</span>${badge("archived","Archived")}<span style="font-size:12px;color:var(--ink-muted);">Inspect restore</span><span class="project-arrow">→</span></button><button class="project-row" data-action="inspect-restore"><span class="project-name"><strong>Prototype Lab</strong><span>Archived 03 Jun · repo mirror stopped</span></span><span class="coordinate-label">Code</span>${badge("archived","Archived")}<span style="font-size:12px;color:var(--ink-muted);">Inspect restore</span><span class="project-arrow">→</span></button></div>`;
  const archiveProposal = `<section class="surface"><div class="surface__header"><div><h2>Reviewed archive proposal</h2><p>Exact unbind change · nothing deleted</p></div>${badge("healthy","Digest ready")}</div><div class="surface__body"><ul class="write-summary"><li><span>Registry</span><span>Set archived: true</span></li><li><span>Provider</span><span>Stop read-only mirror refresh</span></li><li><span>Native</span><span>Disable Task writes</span></li><li><span>Retained</span><span>5 Tasks, Roadmap, Backlog, history</span></li><li><span>Digest</span><span>archive: 2c44…f10</span></li></ul><button class="button button--primary" type="button" data-action="confirm-archive">Confirm archive</button><small class="button-reason">Full revalidation runs before apply</small></div></section>`;
  const restorePanel = s === "archive-proposal" ? archiveProposal : s === "proposal" ? `<section class="surface"><div class="surface__header"><div><h2>Reviewed restore proposal</h2><p>Exact binding change · no source writes</p></div>${badge("healthy","Digest ready")}</div><div class="surface__body"><ul class="write-summary"><li><span>Registry</span><span>Set archived: false</span></li><li><span>Provider</span><span>Resume read-only mirror refresh</span></li><li><span>Native</span><span>Re-enable Task writes</span></li><li><span>Digest</span><span>restore: 781c…ad2</span></li></ul><button class="button button--primary" type="button" data-action="confirm-restore">Confirm restore</button><small class="button-reason">Full revalidation runs before apply</small></div></section>` : `<section class="surface"><div class="surface__header"><div><h2>Restore checks</h2><p>Every binding is revalidated</p></div></div><div class="surface__body"><dl class="fact-list"><div><dt>Trusted root</dt><dd>Required</dd></div><div><dt>Identity</dt><dd>No collision</dd></div><div><dt>Documents</dt><dd>Fixed paths and schema</dd></div><div><dt>Digest</dt><dd>Exact proposal match</dd></div></dl></div></section>`;

  return `${pageHeading("Archived projects", "Unbound does not mean erased.", "Archived projects preserve their native and external history. Restore revalidates source containment, identity, documents, schema, relations, collisions, and digest.", `<button class="button button--quiet" type="button" data-action="archive-demo">Preview archive warning</button>`)}${issue}<div class="route-grid" style="margin-top:${issue ? 16 : 0}px">
    <section class="surface surface--flush">
      <div class="surface__header">
        <div><h2>Archived projects</h2><p>${s === "empty" ? "No retained histories" : "2 retained histories"}</p></div>
        ${badge("archived","Read only")}
      </div>
      ${list}
    </section>
    <div class="panel-stack">
      ${restorePanel}
      <section class="surface">
        <div class="surface__header">
          <div><h2>Archive safety</h2><p>Non-destructive unbind</p></div>
        </div>
        <div class="surface__body">
          <dl class="fact-list">
            <div><dt>Source repository</dt><dd>Untouched on disk</dd></div>
            <div><dt>Planning history</dt><dd>Preserved in Markdown</dd></div>
            <div><dt>Re-activation</dt><dd>Human Gate required</dd></div>
          </dl>
        </div>
      </section>
    </div>
  </div>`;
}

const renderers = {
  portfolio: portfolioPage,
  projects: projectsPage,
  tasks: tasksPage,
  code: codePage,
  business: businessPage,
  register: registerPage,
  archived: archivedPage
};

function setScenarioOptions() {
  const select = document.querySelector("#scenario-select");
  const options = scenarios[state.route] || scenarios.portfolio;
  if (!options.some(([value]) => value === state.scenario)) state.scenario = options[0][0];
  select.innerHTML = options.map(([value,label]) => `<option value="${value}" ${value === state.scenario ? "selected" : ""}>${label}</option>`).join("");
}

function announce(message) {
  const region = document.querySelector(".live-region");
  if (!region) return;
  region.textContent = "";
  requestAnimationFrame(() => { region.textContent = message; });
}

function render({ focus = false } = {}) {
  setScenarioOptions();
  updateStatusStrip();
  document.querySelector("#main-content").innerHTML = renderers[state.route]();
  document.querySelectorAll(".app-header [data-route]").forEach(button => button.setAttribute("aria-current", button.dataset.route === state.route ? "page" : "false"));
  bindPageActions();
  if (focus) {
    document.querySelector("#main-content").focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function go(route) {
  state.route = route;
  state.scenario = (scenarios[route] || scenarios.portfolio)[0][0];
  history.replaceState(null, "", `#${route}`);
  render({ focus: true });
  announce(`${route} view loaded`);
}

function openDialog(title, body, confirmLabel, onConfirm) {
  const dialog = document.querySelector("#action-dialog");
  document.querySelector("#dialog-title").textContent = title;
  document.querySelector("#dialog-body").innerHTML = body;
  const confirm = document.querySelector("#dialog-confirm");
  confirm.textContent = confirmLabel;
  confirm.onclick = () => { onConfirm?.(); announce(`${confirmLabel} confirmed in mockup only`); };
  dialog.showModal();
}

function bindPageActions() {
  document.querySelectorAll("#main-content [data-route]").forEach(button => button.addEventListener("click", () => go(button.dataset.route)));
  
  // Backlog expandable drawer accordion click handler
  document.querySelectorAll(".backlog-row").forEach(row => {
    row.addEventListener("click", () => {
      const parent = row.closest(".backlog-item");
      const isExpanded = parent.classList.toggle("is-expanded");
      row.setAttribute("aria-expanded", isExpanded);
      announce(`Backlog item ${parent.dataset.backlogId} ${isExpanded ? "expanded" : "collapsed"}`);
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        row.click();
      }
    });
  });

  document.querySelectorAll("#main-content [data-action]").forEach(button => button.addEventListener("click", (e) => {
    e.stopPropagation();
    const action = button.dataset.action;
    if (action === "copy-id") {
      announce(`Copied ${button.dataset.id} to clipboard`);
      return;
    }
    if (action === "view-source") {
      announce("Opening repository source in read-only mode");
      return;
    }
    if (action === "refresh") { announce("Refresh started. Existing content remains visible."); return; }
    if (action === "reread" || action === "reinspect") {
      state.scenario = "default" in Object.fromEntries(scenarios[state.route]) ? "default" : scenarios[state.route][0][0];
      render();
      announce("Canonical content reread for this mockup state.");
      return;
    }
    if (action === "new-task") {
      const prefill = button.dataset.prefill || "Prepare pilot decision note";
      openDialog("Create native Task", `<div class="form-grid"><div class="field field--wide"><label for="task-title">Task title</label><input id="task-title" value="${prefill}" /></div><div class="field"><label for="task-project">Project</label><select id="task-project"><option>AllJobs</option><option>Southeast Asia Launch</option></select></div><div class="field"><label for="task-date">Follow-up date</label><input id="task-date" type="date" value="2026-08-29" /></div><div class="field field--wide"><label for="task-context">Context</label><textarea id="task-context">Capture the human decision and evidence link.</textarea></div></div><p>This demonstration will compare the expected digest before writing.</p>`, "Create Task", () => {});
      return;
    }
    if (action === "archive" || action === "archive-demo") {
      state.route = "archived";
      state.scenario = "warning";
      history.replaceState(null, "", "#archived");
      render({focus:true});
      announce("Archive impact is ready for inspection. No writes occurred.");
      return;
    }
    if (action === "create-archive-proposal") {
      state.scenario = "archive-proposal";
      render({focus:true});
      announce("Archive proposal created for review. No writes occurred.");
      return;
    }
    if (action === "confirm-archive") {
      openDialog("Archive AllJobs?", `<p>This Human Gate applies only the reviewed archive proposal after a full re-inspection.</p><ul><li>Set the archived flag to true.</li><li>Stop provider refresh and native writes.</li><li>Retain Tasks, Roadmap, Backlog, and history.</li></ul><p>Proposal digest: <code>2c44…f10</code></p><p>If any checked fact changed, apply returns <code>STALE_STATE</code> and writes nothing.</p>`, "Archive project", () => { state.route = "archived"; state.scenario = "default"; render({focus:true}); });
      return;
    }
    if (action === "create-proposal") {
      state.scenario = "proposal";
      render({focus:true});
      announce("Registration proposal created for review. No writes occurred.");
      return;
    }
    if (action === "inspect-restore") {
      state.scenario = "proposal";
      render({focus:true});
      announce("Restore proposal created for review. No writes occurred.");
      return;
    }
    if (action === "confirm-restore") {
      openDialog("Restore Market Research 2025?", `<p>This Human Gate applies only the reviewed restore proposal after a full re-inspection.</p><ul><li>Set the archived flag to false.</li><li>Resume read-only provider refresh.</li><li>Re-enable native Task writes.</li></ul><p>Proposal digest: <code>781c…ad2</code></p><p>If any checked fact changed, apply returns <code>STALE_STATE</code> and writes nothing.</p>`, "Restore project", () => {});
      return;
    }
    if (action === "confirm-register") {
      openDialog("Register DocLock?", `<p>This applies the exact reviewed proposal:</p><ul><li>Create one native registry document.</li><li>Bind a read-only git mirror.</li><li>Create an empty native Task document.</li></ul><p>Proposal digest: <code>9a72…4c1</code></p>`, "Register DocLock", () => {});
      return;
    }
    if (action === "new-milestone") {
      openDialog("Create native Milestone", `<div class="field"><label for="milestone-title">Milestone title</label><input id="milestone-title" value="Pilot launch" /></div><p>Milestones belong to the business Roadmap. No Backlog object will be created.</p>`, "Create milestone", () => {});
      return;
    }
    announce(`${action} opened in the mockup`);
  }));
}

// Global search handling
const globalSearch = document.querySelector("#global-search-input");
if (globalSearch) {
  globalSearch.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    document.querySelectorAll(".ledger-row, .backlog-item, .project-card").forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = (!query || text.includes(query)) ? "" : "none";
    });
  });
}

window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    const input = document.querySelector("#global-search-input");
    if (input) input.focus();
  }
});

document.querySelector("#scenario-select").addEventListener("change", event => {
  state.scenario = event.target.value;
  render({ focus: true });
  announce(`${event.target.selectedOptions[0].text} state loaded`);
});

document.querySelectorAll(".app-header [data-route]").forEach(button => button.addEventListener("click", () => go(button.dataset.route)));
document.querySelector("[data-action='refresh']").addEventListener("click", () => announce("Refresh started. Existing content remains visible while sources update."));

window.addEventListener("hashchange", () => {
  const route = location.hash.slice(1);
  if (renderers[route] && route !== state.route) {
    state.route = route;
    state.scenario = scenarios[route][0][0];
    render({ focus: true });
    announce(`${route} view loaded`);
  }
});

const initialRoute = location.hash.slice(1);
if (renderers[initialRoute]) state.route = initialRoute;
state.scenario = scenarios[state.route][0][0];
render();
