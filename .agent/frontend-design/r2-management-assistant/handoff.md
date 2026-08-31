# R2 Management Assistant — Mockup Revision 2 Handoff

**Pact task:** `r2-mockup-gate-revision-2` (feature `r2-management-assistant`)
**Seat:** `opencode` (worker)
**Branch:** `codex/r2-management-assistant`
**Worktree:** `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r2-pact-orchestrator` (Pactify sandbox worktree — the required isolation; no nested worktree created)
**Base SHA at start of this revision:** `e33999db418e532e96811c4d48300c0cf115fc88`
**Prior Task 0 evidence:** retained as history (`bfc1406`, accepted `r2-mockup-gate`).

## Authority

- Spec: `docs/superpowers/specs/2026-08-30-alljobs-r2-planning-management-assistant-design.md` (approved)
- Brief: `.agent/frontend-design/r2-management-assistant/brief.md` revision 17 + Mockup revision 2 (approved Human decision)
- Plan Task 0: `docs/superpowers/plans/2026-08-31-alljobs-r2-planning-management-assistant.md`
- Task spec: `.pact/tasks/r2-management-assistant-mockup-revision-2.md`

## Why this revision exists (Human Owner decision, verbatim)

The rendered Task 0 evidence was reopened before Human Mockup Gate approval. The
owner's corrected interaction direction:

- **No continuous or cross-project conversation history is requested.**
- **The project-scoped Companion input must be persistent** — the composer stays
  anchored at the bottom of the companion plane (desktop and mobile), including
  after an answer renders; every submission is a new bounded run.
- **The Companion output must be visibly distinct** — a clearly labelled
  `Companion output` run-record work area with a strong Paper Workbench boundary
  and structured sections (answer, facts/citations, inferences, unknowns,
  recommendations), not a chat transcript or card stack.
- **Backlog/Task stay dominant** on desktop; the true-390px full-height mobile
  Sheet keeps both output and composer usable with no horizontal clipping.

This supersedes the original Task 0 treatment, which replaced the composer with
the answer. Recorded in `brief.md` under "Companion interaction direction —
Mockup revision 2 (approved 2026-09-01)".

## Changes made (revision 2 only)

- `mockup/app.js` — persistent composer as the bottom-most element of the panel
  in **every** state (`panelShell()` wrapper: head → scrollable body → composer);
  new `companionOutputHtml()` wraps the answer sections in a labelled
  `Companion output` run-record with `RUN #1` identity and a run-meta strip;
  composer now carries scope + mode (`tradelinks · Standard · MiniMax-M3`) and
  a "new bounded run" note. Removed the now-redundant standalone run-meta banner,
  usage footer, and mobile `.sheet-actions` bar (Task/Backlog actions remain on
  the recommendation cards inside the output).
- `mockup/styles.css` — `assistant-composer` (persistent, bottom-anchored),
  `composer__context`, `companion-output` (2px ink boundary + dark head band +
  recessed meta strip), panel flex-column shell; mobile sheet keeps the composer
  at the bottom and 44px controls.
- `verify-revision-2.mjs` (new) — focused CDP browser-contract check.
- `brief.md` — reopened as Mockup revision 2, decision recorded verbatim.
- `mockup-review.md` — updated for revision 2.
- `mockup-screens/*.png` — six re-rendered captures.

## Focused RED → GREEN evidence

Check: `.agent/frontend-design/r2-management-assistant/verify-revision-2.mjs`
(standalone Node + CDP; no repo deps, no model call, no write).

**RED (before implementation):** 19 checks FAILED — no `.assistant-composer` in
any state, no `.companion-output` in the answer state (only the pre-existing
"no horizontal scroll" check passed).

**GREEN (after implementation):**

```text
== ready state (1440) — persistence + anchor ==
PASS  composer present
PASS  composer is bottom-most element of plane
PASS  composer has textarea + Ask
PASS  composer carries project scope
PASS  composer carries mode
== answer state (1440) — persistence + distinct output ==
PASS  composer present after answer
PASS  composer is bottom-most element after answer
PASS  composer has textarea + Ask after answer
PASS  Companion output region present
PASS  output labelled "Companion output"
PASS  output has run-record identity
PASS  output has Direct answer section
PASS  output has Confirmed facts section
PASS  output has Inferences section
PASS  output has Unknowns section
PASS  output has Recommendations section
== answer state (true 390px) — render / overflow ==
PASS  390px: no horizontal scroll
PASS  390px: composer present in sheet
PASS  390px: composer is bottom-most element
PASS  390px: composer usable (textarea present)

All checks PASSED
```

## Static checks (run after final code)

```text
$ node --check .agent/frontend-design/r2-management-assistant/mockup/app.js
(no output; exit 0)

$ git diff --check
(no output; exit 0)
```

## Screenshots (re-rendered via `scripts/shot.mjs`, true CDP metrics)

| State | File | Size |
|---|---|---|
| ready-1440 | `ready-1440.png` | 532327b |
| answer-1440 | `answer-1440.png` | 914432b |
| answer-900 (intermediate) | `answer-900.png` | 789288b |
| source-gate-1440 | `source-gate-1440.png` | 676316b |
| exceptions-1440 | `exceptions-1440.png` | 628062b |
| mobile-390 (true CDP mobile) | `mobile-390.png` | 544391b |

Visual inspection confirmed: no overlap between the composer and answer content,
no horizontal scroll/clipping at 390px, 44px mobile controls, `Companion output`
dark boundary clearly distinct from ordinary Project Detail content, Backlog
ledger still dominant on desktop.

## Working-copy state

- Unrelated Human changes preserved and not staged/committed: `.pact/seat`
  (bound to `opencode`), `opencode.json` (`$schema` key). These remain untracked
  from prior sessions and are untouched here.
- Revision 2 edits are confined to `.agent/frontend-design/r2-management-assistant/`.

## Next safe action

Fresh independent design review (impeccable critique + rendered inspection; see
paste-ready prompt in `mockup-review.md`), then Human Owner Mockup Gate approval.
**Do not** install model packages, add shadcn production components, or begin
Task 1 before approval.
