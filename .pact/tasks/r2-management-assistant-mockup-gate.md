# R2 Management Assistant — Task 0: rendered Mockup Gate

## Authority and scope

- Canonical requirements: `docs/superpowers/plans/2026-08-31-alljobs-r2-planning-management-assistant.md`, Task 0 only; `.agent/frontend-design/r2-management-assistant/brief.md` revision 17; and `docs/superpowers/specs/2026-08-30-alljobs-r2-planning-management-assistant-design.md`.
- This is a T3 design-only task. The parent checkout contains unrelated Human changes; preserve them.
- The Pactify sandbox worktree supplied for this task is the required isolation. Do not create a nested worktree. Record its actual path, branch, base SHA, Pact task, and any stale R1 paragraph discrepancy in `handoff.md`.

## Required delivery

Create only the Task 0 artifacts listed in the implementation plan:

- `.agent/frontend-design/r2-management-assistant/handoff.md`
- `.agent/frontend-design/r2-management-assistant/mockup/index.html`
- `.agent/frontend-design/r2-management-assistant/mockup/styles.css`
- `.agent/frontend-design/r2-management-assistant/mockup/app.js`
- `.agent/frontend-design/r2-management-assistant/mockup-review.md`
- `.agent/frontend-design/r2-management-assistant/mockup-screens/*.png`
- the permitted Task 0 update to `.agent/frontend-design/r2-management-assistant/brief.md`

Build one state-driven standalone mockup covering: desktop ready, desktop structured answer, source-access plus stale/incomplete/invalid-source/provider-error safety treatments, and true 390px mobile Sheet behavior. Keep Backlog and Task dominant; use existing Paper Workbench language; do not use generic chat bubbles, gradients, glass, card walls, decorative motion, or a new visual direction.

Read `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, all canonical R2 records, the relevant installed Next 16 documentation, and the full `impeccable` skill before working. Follow the T3 workflow, including Impeccable shape/critique evidence and the Design Quality Model.

Render actual desktop, intermediate, and true mobile evidence with `scripts/shot.mjs`; verify no clipping/horizontal scroll, 44px mobile controls, visible focus, and reduced motion. Write the independent-design-review packet/paste-ready review prompt required by Task 0, but do not self-accept.

## Absolute prohibitions

- Do not install `ai`, `vercel-minimax-ai-provider`, shadcn production components, or any model package.
- Do not add production assistant code, routes, credentials, configuration, model calls, server actions, or deploy changes.
- Do not begin Task 1 or any later R2 task.
- Do not modify unrelated Human changes.

## Completion protocol

Commit only Task 0 evidence on the assigned branch. Run only focused validation for this design-only task (the mockup rendering/inspection and any focused static checks it introduces); do not run repeated full-repository test suites. Update `handoff.md` with the exact commands and outputs, commit SHA, clean/dirty status, and next safe action: independent review then Human Mockup Gate approval. Finally run `pactify checkpoint r2-mockup-gate --evidence ...` with concise evidence.

## Revision 2 — user-approved interaction direction (2026-08-31)

The prior rendered evidence is reopened before Human Mockup Gate approval. Keep this scope inside Task 0 and revise only the standalone mockup/evidence:

- The Project Detail companion must have a **persistent composer**: after an answer renders, the owner can always see and use the current-project input without first closing/reopening the panel. Anchor it at the bottom of the companion plane on desktop and mobile; preserve visible project/mode/context receipt cues. A submission starts a fresh bounded run — it does **not** imply continuous or cross-project conversation history.
- Make the response materially distinct from ordinary Project Detail content. Render it as a clearly labelled **Companion output** / run-record work area with a strong Paper Workbench boundary and hierarchy, separating answer, facts/citations, inferences, unknowns, and recommendations. It must remain a structured document/ledger rather than chat bubbles or a generic card stack.
- Preserve the ledger-first hierarchy: Backlog/Task remain dominant on desktop. On true mobile, retain the full-height Sheet and keep both the output and its persistent composer accessible without horizontal clipping.
- Update the Brief status/revision, handoff, review record, mockup sources, and final screenshots. Record this user decision verbatim enough for a fresh reviewer to understand why the original output treatment was replaced.
- Before implementation, add and run a focused failing static/browser-contract check for the persistent-composer and distinct-output conditions; after the edit, rerun that focused check plus the true 390px render/overflow check. Do not run full repository tests.
- Do not install dependencies or write production R2 code. Re-checkpoint this task and stop for a fresh independent review and then Human Mockup Gate approval.
