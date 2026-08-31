/* AllJobs R2 — Management Assistant Mockup controller.
   One shared DOM driven by a single `data-state`; standalone, synthetic, no
   production imports, no model call, no canonical write. */

(function () {
  "use strict";

  const STATES = ["ready", "answer", "source-gate", "exceptions"];
  const EXCEPTION_VARIANTS = ["stale", "incomplete", "invalid-source", "provider-error"];

  let currentState = "ready";
  let exceptionVariant = "stale";
  let receiptOpen = true;
  let mode = "standard";

  const root = document.getElementById("assistant-root");
  const navButtons = Array.from(document.querySelectorAll(".scenario-nav button"));
  const subWrap = document.getElementById("scenario-sub");
  const exceptionSelect = document.getElementById("exception-select");
  const liveRegion = document.querySelector(".live-region");
  const dialog = document.getElementById("source-gate-dialog");
  const openAssistantBtn = document.getElementById("open-assistant");

  /* ------------------------------------------------------------------ utils */
  function announce(msg) {
    liveRegion.textContent = "";
    requestAnimationFrame(function () {
      liveRegion.textContent = msg;
    });
  }

  function focusPanel() {
    const heading = document.getElementById("assistant-title");
    if (heading) heading.focus();
  }

  /* ------------------------------------------------------------------ render */
  function headHtml() {
    return `
      <div class="assistant-head">
        <div>
          <h2 class="assistant-head__title" id="assistant-title" tabindex="-1">Management assistant</h2>
          <p class="assistant-head__sub">tradelinks · code · local-working-tree</p>
        </div>
        <button type="button" class="assistant-close" id="assistant-close" aria-label="Close assistant panel">×</button>
      </div>`;
  }

  function receiptHtml() {
    const openClass = receiptOpen ? " is-open" : "";
    return `
      <section class="receipt${openClass}" aria-label="Context receipt">
        <button type="button" class="receipt__summary" id="receipt-toggle" aria-expanded="${receiptOpen}">
          <span>
            <span class="receipt__label">Context receipt</span>
            <span class="receipt__meta">3 docs · HEAD d712551 · read 14:02Z</span>
          </span>
          <span class="receipt__chevron" aria-hidden="true">${receiptOpen ? "▾" : "▸"}</span>
        </button>
        <div class="receipt__details">
          <div class="receipt__rows">
            <div class="receipt__row">
              <span class="receipt__path">docs/ROADMAP.md</span>
              <span class="receipt__digest">7f3a…c21e · 4.2 KB</span>
            </div>
            <div class="receipt__row">
              <span class="receipt__path">docs/BACKLOG.md</span>
              <span class="receipt__digest">9c4b…81af · 11.8 KB</span>
            </div>
            <div class="receipt__row">
              <span class="receipt__path">docs/architecture.md</span>
              <span class="receipt__digest">1e77…02d3 · 3.1 KB</span>
            </div>
          </div>
          <label class="receipt__optional">
            <input type="checkbox" checked id="opt-arch" />
            <span>include <code>docs/architecture.md</code> (optional · allowlisted)</span>
          </label>
          <p class="receipt__note">3 selected documents are sent to MiniMax for this request. Source code is never included without a separate one-time approval.</p>
        </div>
      </section>`;
  }

  function modeControlHtml() {
    return `
      <div class="mode-control" role="group" aria-label="Analysis mode">
        <button type="button" data-mode="standard" aria-pressed="${mode === "standard"}">
          Standard
          <small>thinking off · smaller budget</small>
        </button>
        <button type="button" data-mode="deep" aria-pressed="${mode === "deep"}">
          Deep analysis
          <small>adaptive thinking · larger budget</small>
        </button>
      </div>`;
  }

  function composerHtml() {
    return `
      <div class="composer">
        <label class="sr-only" for="assistant-question">Ask a question about this project</label>
        <textarea id="assistant-question" placeholder="Ask about this project's planning state…"></textarea>
        <div class="composer__actions">
          <span class="composer__hint">${mode === "standard" ? "standard" : "deep"} · MiniMax-M3</span>
          <button type="button" class="btn btn--primary composer__send" id="composer-send">Ask</button>
        </div>
      </div>`;
  }

  function readyHtml() {
    return headHtml() + `<div class="assistant-body">` +
      receiptHtml() + modeControlHtml() + composerHtml() + `</div>`;
  }

  function citationSup(refs) {
    return " " + refs.map(function (r) {
      return `<span class="citation-sup">[${r}]</span>`;
    }).join("");
  }

  function answerHtml() {
    return headHtml() + `
      <div class="assistant-body">
        <div class="state-banner state-banner--info" role="status">
          <div><strong>Run meta</strong>Standard · MiniMax-M3 · 4.2s · completed</div>
        </div>

        <section class="answer-section" aria-label="Direct answer">
          <p class="answer-label">Direct answer</p>
          <p class="answer-direct">Phase 2 “Reporting” is the active milestone with two open Backlog items. The milestone is gated by one blocked, overdue P1 item (TR-B-003) that shares the order-routing path with the in-progress settlement work.</p>
        </section>

        <section class="answer-section" aria-label="Confirmed facts">
          <p class="answer-label answer-label--fact">Confirmed facts</p>
          <ul class="fact-list">
            <li>Phase 2 “Reporting” is the active milestone and owns two open items.${citationSup(["S2"])}</li>
            <li>TR-B-003 (order routing rate-limit retries) is <em>blocked</em> and overdue, at P1 in the Core phase.${citationSup(["S1"])}</li>
            <li>The Backlog is a read-only projection of <code>docs/BACKLOG.md</code> at HEAD <code>d712551</code>.${citationSup(["S1"])}</li>
          </ul>
        </section>

        <section class="answer-section" aria-label="Citations">
          <div class="citation-ledger">
            <div class="citation-ledger__head">Citations</div>
            <div class="citation-ledger__row"><span class="citation-sup">S1</span><span><span class="citation-path">docs/BACKLOG.md</span><span class="citation-digest">sha256 9c4b…81af</span></span></div>
            <div class="citation-ledger__row"><span class="citation-sup">S2</span><span><span class="citation-path">docs/ROADMAP.md</span><span class="citation-digest">sha256 7f3a…c21e</span></span></div>
          </div>
        </section>

        <section class="answer-section" aria-label="Inferences">
          <p class="answer-label answer-label--infer">Inferences</p>
          <ul class="infer-list">
            <li><span class="infer-tag">INFER</span>The blocked retry item is likely delaying settlement webhooks, since both touch order routing.</li>
            <li><span class="infer-tag">INFER</span>Phase 2 cannot close until TR-B-004 and TR-B-005 land.</li>
          </ul>
        </section>

        <section class="answer-section" aria-label="Unknowns">
          <p class="answer-label answer-label--unknown">Unknowns</p>
          <ul class="unknown-list">
            <li>No acceptance criteria are recorded for TR-B-005.</li>
            <li>Source code is not in default context; implementation feasibility is unverified.</li>
          </ul>
        </section>

        <section class="answer-section" aria-label="Questions">
          <p class="answer-label answer-label--question">Questions</p>
          <ul class="question-list">
            <li>Should TR-B-003 be split into a rate-limit item and a retry-queue item?</li>
          </ul>
        </section>

        <section class="answer-section" aria-label="Recommendations">
          <p class="answer-label answer-label--rec">Recommendations</p>
          <div class="rec-card">
            <div class="rec-card__head">
              <p class="rec-card__title">Split TR-B-003 into two items</p>
              <span class="rec-card__kind rec-card__kind--task">task</span>
            </div>
            <p class="rec-card__body">Separate the rate-limit backoff from the retry queue so the queue can start independently of the backoff tuning.</p>
            <div class="rec-card__actions">
              <button type="button" class="btn btn--quiet" data-action="task-draft">Use as task draft</button>
            </div>
          </div>
          <div class="rec-card" style="margin-top:10px;">
            <div class="rec-card__head">
              <p class="rec-card__title">Define settlement webhook acceptance criteria</p>
              <span class="rec-card__kind rec-card__kind--backlog">backlog</span>
            </div>
            <p class="rec-card__body">Add a P1 Backlog item describing the reconciliation acceptance criteria before the webhook work proceeds.</p>
            <div class="rec-card__actions">
              <button type="button" class="btn btn--quiet" data-action="draft-backlog">Draft Backlog proposal</button>
            </div>
          </div>
        </section>

        <footer class="usage-footer">
          <span><strong>model</strong> MiniMax-M3</span>
          <span><strong>mode</strong> Standard</span>
          <span><strong>usage</strong> 1,240 in · 388 out</span>
          <span><strong>source gate</strong> none</span>
        </footer>

        <button type="button" class="btn btn--quiet new-conversation" data-action="new-conversation" style="width:100%;">New conversation</button>
      </div>

      <div class="sheet-actions" role="group" aria-label="Bottom actions">
        <button type="button" class="btn btn--quiet" data-action="task-draft">Use as task draft</button>
        <button type="button" class="btn btn--primary" data-action="draft-backlog">Draft Backlog proposal</button>
      </div>`;
  }

  function sourceGateHtml() {
    return headHtml() + `
      <div class="assistant-body">
        <div class="state-banner state-banner--info" role="status">
          <div><strong>Source access requested</strong>The documents are insufficient to answer responsibly. Source code needs a separate one-time read.</div>
        </div>

        <section class="gate-request" aria-label="Source access request">
          <p class="gate-request__lead">To confirm whether order routing is shared between TR-B-003 and TR-B-005, I need to inspect the routing module.</p>
          <dl class="gate-facts">
            <div><dt>Capability</dt><dd>list_project_files · read_project_files</dd></div>
            <div><dt>Budget</dt><dd>≤ 6 files · 192 KB · 4 tool calls</dd></div>
            <div><dt>Expected facts</dt><dd>shared routing path · retry owner</dd></div>
            <div><dt>Bound</dt><dd>tradelinks · question digest</dd></div>
            <div><dt>Expires</dt><dd>10 min after approval</dd></div>
          </dl>
          <p class="gate-request__lead">Approval authorizes only this response. It expires on completion, cancel, timeout, or any manifest change. It never becomes standing access.</p>
          <button type="button" class="btn btn--primary" id="gate-review" style="width:100%;">Review gate</button>
        </section>
      </div>`;
  }

  function treatmentHtml(code, text, variant) {
    const badge = { stale: "STALE", incomplete: "INCOMPLETE", "invalid-source": "INVALID SOURCE", "provider-error": "PROVIDER ERROR" }[variant];
    return `
      <div class="treatment treatment--${variant}">
        <div>
          <div class="treatment__code">${code}</div>
          <div class="treatment__text">${text}</div>
        </div>
        <span class="badge badge--${variant === "invalid-source" || variant === "provider-error" ? "blocked" : variant === "stale" ? "active" : "todo"}">${badge}</span>
      </div>`;
  }

  function exceptionDetailHtml() {
    const details = {
      stale: {
        banner: "state-banner--stale",
        title: "STALE",
        body: "Context changed while the response ran. The answer stays readable, but the manifest digest no longer matches, so Task and Backlog actions are disabled until you refresh and ask again.",
        actions: "<button type=\"button\" class=\"btn\" disabled aria-disabled=\"true\">Draft Backlog proposal</button><button type=\"button\" class=\"btn\" disabled aria-disabled=\"true\">Use as task draft</button><button type=\"button\" class=\"btn btn--primary\">Refresh &amp; ask again</button>",
        note: "Disabled because the manifest digest changed during the response."
      },
      incomplete: {
        banner: "state-banner--incomplete",
        title: "INCOMPLETE",
        body: "The stream was interrupted. Partial text is preserved, but this result cannot be promoted into a Task draft or Backlog proposal. No automatic retry occurs after the provider accepted the request.",
        actions: "<button type=\"button\" class=\"btn btn--primary\">Retry</button>",
        note: "Retry is explicit and rebuilds the context manifest."
      },
      "invalid-source": {
        banner: "state-banner--invalid",
        title: "INVALID LOCAL SOURCE",
        body: "docs/BACKLOG.md failed validation. The assistant may explain the validation issues but claims no facts from the affected Roadmap or Backlog, and no remote/cache content is substituted.",
        actions: "<button type=\"button\" class=\"btn\">Inspect issues</button><button type=\"button\" class=\"btn\">Refresh context</button>",
        note: "A present invalid local source is never masked by remote or cached truth."
      },
      "provider-error": {
        banner: "state-banner--error",
        title: "PROVIDER ERROR",
        body: "Distinct operational failures are shown when the provider exposes them: authentication, Token Plan exhaustion, rate limit, timeout, or unavailability. The credential value is never disclosed.",
        actions: "<button type=\"button\" class=\"btn\">Check configuration</button><button type=\"button\" class=\"btn btn--primary\">Retry</button>",
        note: "AllJobs never automatically retries after the provider accepts a request."
      }
    }[exceptionVariant];

    return `
      <section class="answer-section" aria-label="Active exception detail">
        <p class="answer-label answer-label--rec">Active treatment</p>
        <div class="state-banner ${details.banner}" role="alert">
          <div><strong>${details.title}</strong>${details.body}</div>
        </div>
        <div class="rec-card__actions" style="margin-top:10px;">${details.actions}</div>
        <p class="disabled-note">${details.note}</p>
      </section>`;
  }

  function exceptionsHtml() {
    return headHtml() + `
      <div class="assistant-body">
        <section aria-label="Compact exception treatments">
          <p class="answer-label">Compact treatments</p>
          <div class="treatment-strip">
            ${treatmentHtml("STALE", "Context changed during response; actions disabled until refresh.", "stale")}
            ${treatmentHtml("INCOMPLETE", "Interrupted stream; partial text preserved, no promotion.", "incomplete")}
            ${treatmentHtml("INVALID SOURCE", "Backlog failed validation; no remote substitution.", "invalid-source")}
            ${treatmentHtml("PROVIDER ERROR", "Auth / plan / rate / timeout / unavailable, distinct.", "provider-error")}
          </div>
        </section>
        ${exceptionDetailHtml()}
      </div>`;
  }

  function renderPanel() {
    switch (currentState) {
      case "ready": root.innerHTML = readyHtml(); break;
      case "answer": root.innerHTML = answerHtml(); break;
      case "source-gate": root.innerHTML = sourceGateHtml(); break;
      case "exceptions": root.innerHTML = exceptionsHtml(); break;
    }
    bindPanelEvents();
  }

  /* ------------------------------------------------------------------ dialog */
  function gateDialogHtml() {
    return `
      <p class="gate-plate">Human gate · one-time read</p>
      <h2 class="gate-title" id="gate-title">Approve source inspection?</h2>
      <div class="gate-body">
        <p>This authorizes a single, read-only, bounded inspection of <code>src/routing/</code> for this response only. It does not run code, Git, or tests, and it never becomes standing access.</p>
        <div class="gate-binding">
          <div><strong>Project</strong> tradelinks</div>
          <div><strong>Manifest digest</strong> 3f82…09aa</div>
          <div><strong>Capabilities</strong> list_project_files · read_project_files</div>
          <div><strong>Budget</strong> ≤ 6 files · 192 KB · 4 tool calls</div>
          <div><strong>Expiry</strong> 10 min</div>
        </div>
      </div>
      <div class="gate-dialog-actions">
        <button type="button" class="btn btn--quiet" id="gate-deny-2">Deny</button>
        <button type="button" class="btn btn--primary" id="gate-approve-2">Approve once</button>
      </div>`;
  }

  function openGateDialog() {
    dialog.innerHTML = gateDialogHtml();
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      const approve = dialog.querySelector("#gate-approve-2");
      const deny = dialog.querySelector("#gate-deny-2");
      approve.addEventListener("click", function () { dialog.close(); announce("Source inspection approved for this response only."); });
      deny.addEventListener("click", function () { dialog.close(); announce("Source inspection denied."); });
    }
  }

  function closeGateDialog() {
    if (dialog.open) dialog.close();
  }

  /* ------------------------------------------------------------------ events */
  function bindPanelEvents() {
    const close = document.getElementById("assistant-close");
    if (close) close.addEventListener("click", function () { announce("Assistant panel closed."); });

    const receiptToggle = document.getElementById("receipt-toggle");
    if (receiptToggle) {
      receiptToggle.addEventListener("click", function () {
        receiptOpen = !receiptOpen;
        renderPanel();
        announce(receiptOpen ? "Context receipt expanded." : "Context receipt collapsed.");
      });
    }

    document.querySelectorAll(".mode-control button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        mode = btn.getAttribute("data-mode");
        renderPanel();
        announce(mode === "deep" ? "Deep analysis selected." : "Standard mode selected.");
      });
    });

    const send = document.getElementById("composer-send");
    if (send) {
      send.addEventListener("click", function () {
        setState("answer");
        announce("Request submitted. Streaming answer.");
      });
    }

    const approve = document.getElementById("gate-review");
    if (approve) approve.addEventListener("click", openGateDialog);
  }

  /* ------------------------------------------------------------------ state */
  function setState(state) {
    if (STATES.indexOf(state) === -1) return;
    currentState = state;
    navButtons.forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-state") === state));
    });
    subWrap.hidden = state !== "exceptions";
    if (state !== "source-gate") closeGateDialog();
    renderPanel();
    if (state === "source-gate") {
      setTimeout(openGateDialog, 60);
    }
  }

  function buildExceptionSelect() {
    EXCEPTION_VARIANTS.forEach(function (variant, i) {
      const opt = document.createElement("option");
      opt.value = variant;
      opt.textContent = variant.replace("-", " ");
      if (i === 0) opt.selected = true;
      exceptionSelect.appendChild(opt);
    });
    exceptionSelect.addEventListener("change", function () {
      exceptionVariant = exceptionSelect.value;
      renderPanel();
      announce("Exception variant: " + exceptionVariant);
    });
  }

  navButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setState(btn.getAttribute("data-state"));
      announce("State: " + btn.getAttribute("data-state"));
    });
  });

  openAssistantBtn.addEventListener("click", function () {
    setState("ready");
    focusPanel();
    announce("Management assistant opened for tradelinks.");
  });

  /* ------------------------------------------------------------------ boot */
  function boot() {
    buildExceptionSelect();
    const params = new URLSearchParams(window.location.search);
    const stateParam = params.get("state");
    const initial = stateParam && STATES.indexOf(stateParam) !== -1 ? stateParam : "ready";
    setState(initial);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
