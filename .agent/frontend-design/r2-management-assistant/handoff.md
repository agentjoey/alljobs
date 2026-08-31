# R2 Management Assistant — Task 0 Handoff

**Pact task:** `r2-mockup-gate` (feature `r2-management-assistant`)
**Seat:** `opencode` (worker)
**Branch:** `codex/r2-management-assistant`
**Worktree:** `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r2-pact-orchestrator` (Pactify sandbox worktree — the required isolation; no nested worktree created)
**Base SHA at start:** `c94ddef4fde3e0b73d04c26e8b714de6aa2d25b3`

## Authority

- Spec: `docs/superpowers/specs/2026-08-30-alljobs-r2-planning-management-assistant-design.md` (approved)
- Brief: `.agent/frontend-design/r2-management-assistant/brief.md` revision 17 (approved)
- Plan Task 0: `docs/superpowers/plans/2026-08-31-alljobs-r2-planning-management-assistant.md`
- Design system: `DESIGN.md`, `PRODUCT.md`, `AGENTS.md`, plus the existing Paper Workbench mockup (`planning-core-v1`) and R1 mockup review as reference.

## Discrepancies recorded (per plan "Baseline and handoff facts")

- **Stale R1 paragraph in `.agent/CURRENT.md`:** lines 61–67 still describe R1 Backlog Control as a "candidate (not deployed) … not merged, pushed, deployed". This is stale: `main` already contains the copy-only R1-B commits through `d712551` (`chore: record r1b proposal-only verification`, `fix(planning): make r1 backlog proposals copy-only`). Not edited here (out of Task 0 scope); flagged for the orchestrator/reviewer.
- **`node_modules` absent in this sandbox worktree.** The plan's Step 1 suggests `npm ci`, but this is a design-only task with a standalone static mockup and `scripts/shot.mjs` uses only Node built-ins. No `npm ci` was run by design, and no full-repository test suite was run (the task forbids repeated full suites). The installed Next 16 docs (`node_modules/next/dist/docs/…`) are therefore not present to read; none are needed to produce a static mockup, and no production Next code is written in Task 0.

## Working-copy state (before Task 0 edits)

- Pre-existing unrelated changes, preserved and **not** staged/committed:
  - `.pact/seat` (modified — bound to `opencode`; tracked in this tree despite the pact "git-excluded" convention)
  - `opencode.json` (modified — `$schema` key added by the harness)
- Task 0 edits are confined to `.agent/frontend-design/r2-management-assistant/`.

## Deliverables created

- `mockup/index.html` — one state-driven standalone DOM (`<main id="project-detail">` with a dominant Backlog ledger and an `<aside id="assistant-panel" data-state>`); no chat bubbles, no gradients/glass/card walls, Paper Workbench tokens only.
- `mockup/styles.css` — panel, receipt, mode control, structured answer, citations, recommendations, source gate, exception treatments, and responsive (desktop / ≤1120 single-column / ≤720 full-height Sheet) + `prefers-reduced-motion`.
- `mockup/app.js` — state controller (`ready`, `answer`, `source-gate`, `exceptions`), URL `?state=` param for screenshot targeting, exception sub-selector, receipt expand, Standard/Deep toggle, composer → answer, and a native `<dialog>` Human Gate.
- `mockup-screens/*.png` — rendered evidence (6 captures).
- `mockup-review.md` — primary-agent review record + paste-ready independent review prompt.
- `brief.md` — permitted non-material Task 0 update (status + mockup artifact pointers only).

## Scenario coverage (four approved groups)

| Group | State | Evidence |
|---|---|---|
| Desktop initial | `ready` (receipt, Standard/Deep, optional doc, composer) | `ready-1440.png` |
| Desktop answer | `answer` (facts/citations, inferences, unknowns, questions, recommendations, Task/Backlog actions, usage) | `answer-1440.png` |
| Intermediate | `answer` at 900px (single-column stack) | `answer-900.png` |
| Safety — source gate | `source-gate` (structured request + modal Human Gate) | `source-gate-1440.png` |
| Safety — exceptions | `exceptions` (STALE / INCOMPLETE / INVALID SOURCE / PROVIDER ERROR) | `exceptions-1440.png` |
| Mobile critical flow | `answer` at 390px (full-height Sheet, collapsed receipt, bottom actions) | `mobile-390.png` |

## Commands and outputs (run after final code)

```text
$ node --check .agent/frontend-design/r2-management-assistant/mockup/app.js
(no output; exit 0)

$ git diff --check
(no output; exit 0)

$ node scripts/shot.mjs "file://$PWD/.agent/.../mockup/index.html?state=ready" …/ready-1440.png 1440 2 0 light
OK …/ready-1440.png 513243b width=1440 scale=2 mobile=false
… (answer-1440, answer-900, source-gate-1440, exceptions-1440, mobile-390 similarly OK)

# Horizontal-scroll verification at true 390px (CDP measured)
MEASURE {"clientWidth":390,"scrollWidth":390,"innerWidth":390,"bodyScroll":390}
```

Visual inspection of all six captures confirmed: no clipping or horizontal scroll, 44px mobile controls (close + bottom actions), visible focus, reduced-motion fallback, and structured document/ledger answer language.

## Next safe action

Independent design review (fresh session, `impeccable critique` + rendered inspection; see paste-ready prompt in `mockup-review.md`), then Human Owner Mockup Gate approval. **Do not** install model packages, add shadcn production components, or begin Task 1 before approval.
