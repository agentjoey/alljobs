# R1 Backlog Control — Independent Mockup Review Packet

**Review role:** Independent Review Agent (fresh context; not the implementing agent)  
**Review target:** R1 Task 0 Paper Workbench mockup revision 3  
**Status:** Historical packet — independent review completed; revision 3 repair and Human Owner authorization recorded in `mockup-review.md`

## Independent-context prompt

```text
You are the independent Review Agent for AllJobs R1 Backlog Control Task 0.

Do not rely on the implementation agent's conclusions. Start from the authoritative R1 design and implementation plan, the T3 Brief, the standalone mockup source, and its screenshots. Run impeccable critique for the mockup target, inspect the rendered 1440, 900, and true-390px evidence, and return findings only (no implementation changes, no approval).

Write your result to .agent/frontend-design/r1-backlog-control/mockup-review.md under a clearly marked independent-review section. Use APPROVE FOR HUMAN GATE or REQUEST_CHANGES, list P0–P3 findings with evidence, and state whether every required state is present and understandable. Do not approve production implementation or release.
```

## Canonical inputs

- Product Roadmap: `docs/superpowers/specs/2026-08-29-alljobs-product-roadmap-design.md`
- R1 specification: `docs/superpowers/specs/2026-08-29-alljobs-r1-backlog-control-design.md`
- R1 plan: `docs/superpowers/plans/2026-08-29-alljobs-r1-backlog-control.md`
- Brief: `.agent/frontend-design/r1-backlog-control/brief.md` revision 3
- Mockup: `.agent/frontend-design/r1-backlog-control/mockup/index.html`, `styles.css`, `app.js`
- Primary review record: `.agent/frontend-design/r1-backlog-control/mockup-review.md`
- Rendered evidence: `mockup-screens/backlog-1440.png`, `backlog-900.png`, `backlog-390.png`, `backlog-review-390.png`

## Target and scope

- **Tier:** T3 — new core Backlog journey with a future consequential repository write boundary.
- **Target branch/worktree:** `codex/r1-backlog-control` · `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r1-backlog-control`
- **Base/current commit:** `5466c338e5b74c7f672d7b6a710d4b7f8f74b665` / no Task 0 commit yet.
- **Scope reviewed:** HTML mockup behavior and visual direction only. Revision 2 follows the current Planning Core shell and uses a single-column Backlog card stream. There is no production UI, source resolver, Server Action, field patcher, repository write, service change, or deployment in this task.

## Acceptance and state matrix

Verify that the mockup visibly covers:

1. local working tree modified + unranked;  
2. local ranked + page-local editing;  
3. one-item move review;  
4. target-lane group renumber review;  
5. `STALE_WRITE` zero-write recovery;  
6. present invalid local source with no remote fallback;  
7. remote/cache read-only provenance; and  
8. copyable new Backlog Item repository-agent handoff.

Also verify desktop, 900px intermediate, true 390px mobile, reduced-motion switch, visible focus treatment, and that Move Up / Move Down / Change Priority remain available through labeled controls for keyboard/narrow layouts rather than only drag.

## Required review focus

- Paper Workbench continuity: ledger-first hierarchy, amber provenance, paper/ink/hairline language, and no Star Atlas/celestial/dashboard replacement.
- Consequential-flow clarity: page-local draft, review digest, field-only change list, explicit Human Gate, no Git mutation claim, and stale state says zero writes.
- Source authority: local working-tree precedence, present invalid-local no-fallback, remote/cache read-only, and clear recovery language.
- Data density/responsiveness: 30+ realistic synthetic items; no page-level horizontal scroll at 390px; ledger rows recompose rather than shrink into an unreadable table.
- Accessibility: focus visibility, text-backed semantic status, readable source facts, 44px mobile action targets, and reduced motion that does not hide content.

## Evidence commands already run

```bash
node --check .agent/frontend-design/r1-backlog-control/mockup/app.js
git diff --check
node scripts/shot.mjs file:///.../mockup/index.html?state=unranked .agent/frontend-design/r1-backlog-control/mockup-screens/backlog-1440.png 1440 2 0 light
node scripts/shot.mjs file:///.../mockup/index.html?state=renumber .agent/frontend-design/r1-backlog-control/mockup-screens/backlog-900.png 900 2 0 light
node scripts/shot.mjs file:///.../mockup/index.html?state=editing .agent/frontend-design/r1-backlog-control/mockup-screens/backlog-390.png 390 2 1 light
```

## Required output and gate boundary

- Return `APPROVE FOR HUMAN GATE` or `REQUEST_CHANGES`; do not mark the mockup Approved.
- Include concrete evidence for every P0/P1 issue, note P2/P3 observations, and state whether a follow-up visual capture is needed.
- The independent reviewer must not modify the reviewed implementation. If an edit is necessary, a new independent review is required.
- Human Owner remains the only party that may approve this rendered revision and unlock Task 1.
