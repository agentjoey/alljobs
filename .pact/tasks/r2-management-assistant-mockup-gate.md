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
