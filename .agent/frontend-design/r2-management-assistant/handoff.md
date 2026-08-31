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

---

# Task 1 — contracts, limits, and digests (`r2-contracts`)

**Pact task:** `r2-contracts` (feature `r2-management-assistant`)
**Seat:** `opencode` (worker)
**Branch:** `codex/r2-management-assistant`
**Worktree:** `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r2-pact-orchestrator`
**Commit:** `19fdb2e` (`feat: define r2 assistant contracts`)
**Base SHA at start:** `33e0bb3e5f1ebb85e5b0cbfdb4feeaef9199990d`

## Start Card

```md
Workflow: 3.3
Task: Task 1 (contracts, limits, and digests)
Role: worker
Tier / reason: T3 — core model-backed Project Detail journey
Canonical record: .agent/frontend-design/r2-management-assistant/
Branch: codex/r2-management-assistant
Mockup Gate: approved for revision 2 (Human Owner, 2026-09-01)
Reviewer: claude (independent)
```

## Scope audit

Implemented **only** Task 1 from the canonical plan. Files touched:

| File | Change |
|---|---|
| `lib/assistant/limits.ts` | new — fixed `ASSISTANT_LIMITS` (verbatim from plan) |
| `lib/assistant/contracts.ts` | new — strict Zod schema graph |
| `lib/assistant/contracts.test.ts` | new — focused strict-rejection/bounds tests |
| `lib/assistant/digest.ts` | new — `canonicalize` + `assistantDigest` (SHA-256) |
| `lib/assistant/digest.test.ts` | new — key-ordering + array-order tests |
| `lib/planning/domain/schemas.ts` | add `projectAssistantConfigSchema` + `assistant` field |
| `lib/planning/domain/schemas.test.ts` | add Project assistant-config tests |
| `lib/planning/config.ts` | add strict Control Host `assistant` config |
| `lib/planning/config.test.ts` | new — Control Host assistant config tests |
| `config/alljobs.example.json` | add `assistant.enabled: false`, no credential |

No dependencies installed, no provider invoked, no credentials added, no API
routes/UI/source access/manifests/activity/drafts/proposals behavior, no Task 2+
work. Mockup artifacts and unrelated Human changes preserved.

## Contracts produced

`AssistantMode`, `AssistantRequestIntent` (discriminated `ask | inspect_source |
answer_without_source | draft_task | draft_backlog`), `AssistantContextManifest`,
`AssistantOutcome` (discriminated `management_answer | source_access_proposal`),
`AssistantStreamEvent` (discriminated `run_status | assistant_partial |
source_access_requested | assistant_complete | assistant_error`), `TaskDraft`,
`BacklogProposal`, `AssistantRunRecord`, `ASSISTANT_LIMITS`, `assistantDigest()`,
plus the answer primitives `ManagementCitation`, `ManagementFact`,
`ManagementInference`, `ManagementRecommendation`.

## RED → GREEN evidence

**RED (implementation absent, tests present):** after stashing only the
implementation (`schemas.ts`/`config.ts` assistant additions, `lib/assistant/*.ts`)
with the four test files in place:

```text
 Test Files  4 failed (4)
      Tests  6 failed | 17 passed (23)
```

Failures: missing `projectAssistantConfigSchema`/`assistant` field, missing
`controlHostAssistantConfigSchema`, and missing `lib/assistant/{contracts,digest}`
module imports — the new assertions reject nothing until the schema graph exists.

**GREEN (after implementation):**

```text
$ npm test -- lib/planning/domain/schemas.test.ts lib/planning/config.test.ts lib/assistant/contracts.test.ts lib/assistant/digest.test.ts
 Test Files  4 passed (4)
      Tests  65 passed (65)
```

Focused tests prove: strict rejection of browser-supplied `workspace_path`,
non-minimax provider, non-`MiniMax-M3` model, `api_key`/unknown keys, oversized
questions, malformed digests, over-limit optional sources, invalid mode enum,
repository-relative `context_paths` (absolute/`..` rejected, max 8), both outcome
kinds, citation-source requirements, unknown manifest/task-draft fields, and that
`question`, `answer`, `reasoning`, `fragments`, `draft`, `proposal`, and
`credential` fields cannot enter an `AssistantRunRecord`. Digest tests prove
recursive key-ordering invariance and array-order preservation.

## Static checks (run after final code)

```text
$ npm run typecheck      → exit 0
$ git diff --check       → exit 0
```

Example config re-validated through `controlHostConfigSchema`:
`assistant` → `{ enabled: false, provider: "minimax", model: "MiniMax-M3",
standard: <fixed>, deep: <fixed> }` (no credential key).

## Warnings / notes

- The RED demonstration is captured post-hoc (stash implementation, run tests,
  restore) because the four test files were authored in the same working pass as
  the implementation; the recorded RED/GREEN outputs are exact.
- `provider` and `model` are `z.literal(...).default(...)` so the example config's
  `{ "enabled": false }` validates; `enabled` remains required boolean (fail-closed
  explicitness).
- `standard`/`deep` limits are locked to the exact `ASSISTANT_LIMITS` values via
  per-field `z.literal`; config may omit them (defaulted) but cannot mutate them.
  `ASSISTANT_LIMITS` remains the server-authoritative source of truth and is not
  browser-configurable.
- `ASSISTANT_LIMITS.historyMessages`/`historyChars` remain in `limits.ts` verbatim
  from the plan's fixed-limits block, but the `ask` intent no longer accepts
  browser history (per Mockup revision 2).

## Reviewer rework (round 2)

Two P1 findings resolved:

1. **P1 security — fixed mode limits.** `controlHostAssistantConfigSchema`
   previously used positive-number mode-limit objects, letting config override the
   fixed Standard/Deep budgets. Replaced `standard`/`deep` with strict objects
   whose every budget field is a `z.literal(...)` bound to `ASSISTANT_LIMITS`
   (`contextBytes`, `outputTokens`, `sourceFiles`, `sourceBytes`, `toolCalls`),
   each with `.strict()` and a `.default(ASSISTANT_LIMITS.<mode>)`. Mutated budgets
   now fail validation. Added rejection tests for mutated `standard` and `deep`.

2. **P1 product boundary — no continuous history.** Mockup revision 2 states every
   submission is a fresh bounded run with no continuous conversation. Removed the
   `history` field (and `historyMessageSchema`) from the `ask` intent; the strict
   schema now rejects any browser-supplied `history` key, empty or nonempty, as an
   unknown field. Added rejection tests for nonempty and empty `history`.

**RED (new tests vs pre-fix implementation):** reverting only the two source files
to pre-fix while keeping the updated tests yielded:

```text
 Test Files  2 failed (2)
      Tests  4 failed | 35 passed (39)
```

The 4 failures were exactly the two mutated-budget rejections and the two
history-rejection tests.

**GREEN (after rework):**

```text
$ npm test -- lib/planning/domain/schemas.test.ts lib/planning/config.test.ts lib/assistant/contracts.test.ts lib/assistant/digest.test.ts
 Test Files  4 passed (4)
      Tests  69 passed (69)

$ npm run typecheck      → exit 0
$ git diff --check       → exit 0
```

Example config re-validated: `assistant` → `{ enabled: false, provider: "minimax",
model: "MiniMax-M3", standard: <fixed literals>, deep: <fixed literals> }`; a
mutated `standard`/`deep` value is rejected (`safeParse(...).success === false`).

## Next safe action

Stop for independent review of `r2-contracts` before Task 2 (context assembly).

---

## Independent reviewer result — Task 1 (2026-09-01)

**Reviewer:** Pact seat `claude` (orchestrator review; separate from the `opencode` implementation run)
**Candidate reviewed:** `19fdb2e` plus rework `54172fe`
**Verdict:** **ACCEPT**

### Evidence

- Scope review: limited to the Task 1 configuration, contract, digest, focused-test, example-config, handoff, and Pact ledger files. No dependency, provider invocation, credential, route, UI, source-access, manifest, activity, or Task 2+ change is present.
- Contract review: every Standard/Deep configuration field is now an exact `z.literal` of `ASSISTANT_LIMITS`; configuration may omit budgets but cannot override them. The assistant request schema strictly rejects both empty and non-empty browser `history`, preserving the approved fresh bounded-run behavior.
- Independent focused verification: `npm test -- lib/planning/domain/schemas.test.ts lib/planning/config.test.ts lib/assistant/contracts.test.ts lib/assistant/digest.test.ts` passed **4 files / 69 tests**; `npm run typecheck` and `git diff --check 6e94d42..HEAD` passed.

### Gate boundary

Task 1 is accepted. Task 2 (attributable context and receipts) is not dispatched by this review; it requires a separate Pact assignment and its own RED -> GREEN delivery/review cycle. Final build, independent verification, Human walkthrough, and release approval remain separate T3 gates.
