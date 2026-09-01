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

---

# Task 2 — attributable context and receipts (`r2-context`)

**Pact task:** `r2-context` (feature `r2-management-assistant`)
**Seat:** `opencode` (worker)
**Branch:** `codex/r2-management-assistant`
**Worktree:** `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r2-pact-orchestrator`
**Base SHA at start:** `532252f` (`pact: ledger sync`)

## Scope audit

Implemented **only** Task 2 from the canonical plan. Files touched:

| File | Change |
|---|---|
| `lib/assistant/context.ts` | new — `assembleAssistantContext()`, `prepareAssistantEntry()`, `SourceFragment`, `AssistantContextBundle`, `AssistantContextReceipt`, `AssistantEntryState`, `ContextAssemblyError` |
| `lib/assistant/context.test.ts` | new — focused RED/GREEN coverage |
| `lib/planning/queries/project.ts` | `ProjectDetailView.assistant?: AssistantEntryState` (type-only bridge) |
| `lib/planning/queries/project.test.ts` | `prepareAssistantEntry` page-bridge tests |
| `app/projects/[slug]/page.tsx` | call `prepareAssistantEntry(slug)` and merge `assistant` into `detail` |

No dependencies installed, no provider/model/credential, no route, no source-gate/tool,
no activity logging, no write, no UI/panel change. `ProjectDetail` renders nothing new —
the `assistant` field is non-rendering (Task 6 owns the panel). Mockup artifacts and
unrelated Human work preserved.

## Design decisions

- **`source_id` = repository-relative path** (`docs/ROADMAP.md`, `docs/BACKLOG.md`,
  `docs/<allowlist>`) so citation IDs match the receipt paths deterministically.
- **Manifest = selected documents only** (required canonical + selected optional);
  **receipt = all documents** (required + every allowlisted optional with `selected`
  flag); **fragments = selected documents with an attempted raw read**.
- **Path safety** (`readContainedFile`): reject non-repository-relative paths, symlinks,
  non-regular files, realpath escapes outside the workspace, invalid UTF-8, and read
  failures — fail closed, never falling back to cache. Local invalid source uses the
  resolver's `invalidLocalSource` result (mode `local-working-tree`, no cache fallback).
- **Read-only labels**: `remote-commit` reads via `git show --end-of-options ref:path`
  (modified `null`); `cached` exposes provenance digests only (no raw fragments,
  modified `null`); both remain read-only.
- **`CONTEXT_LIMIT`** fails explicitly (no silent omission) when selected bytes exceed
  the mode `contextBytes` budget, or a selected optional file exceeds `contextFileBytes`.
- **Browser-safety**: the receipt carries only repo-relative paths, digests, byte counts,
  modified/optional/selected flags, `read_at`, and sanitized issues (absolute `sourcePath`
  mapped to repository-relative or dropped). Fragments, raw content, authoritative paths,
  model, budgets, and permissions never enter `AssistantEntryState`.

## RED → GREEN evidence

**RED (implementation absent, tests present):**

```text
Test Files  2 failed (2)
     Tests  no tests
```
Failed to resolve import `./context` / `../../assistant/context` — the assertions exist
but the module to reject/assemble them does not.

**GREEN (after implementation):**

```text
$ npm test -- lib/assistant/context.test.ts lib/planning/queries/project.test.ts
 Test Files  2 passed (2)
      Tests  22 passed (22)
```

Focused coverage proves: real temporary local sources into fragments + browser-safe
receipt (no fragment content, no absolute workspace path); local dirty precedence
(`modified: true`, dirty value in fragment but not receipt); exact optional allowlist
(includes only allowlisted/selected optional; ignores non-allowlisted ids); symlinked
optional source rejected without reading its target (`CONTEXT_FILE_SYMLINK`); remote
mirror read-only (`source_mode: remote-commit`, `modified: null`, content present);
cached read-only (`source_mode: cached`, `modified: null`, no raw fragments); nullable
raw ranges for a missing required document (null heading/line_start/line_end, empty
content, `PLANNING_FILE_MISSING` issue); deterministic digest + digest change on one
selected byte; explicit `CONTEXT_LIMIT` rejection when required context exceeds the
budget; `PROJECT_NOT_FOUND`; and `prepareAssistantEntry` disabled (`NOT_CONFIGURED`) for
missing/disabled config, enabled with a browser-safe receipt (no fragment content,
absolute path, `contextBytes`, `MiniMax-M3`, or `fragments` key).

## Static checks (run after final code)

```text
$ npm run typecheck      → exit 0
$ git diff --check       → exit 0
$ npm test               → 44 files / 272 tests passed
```

## Plan-file bridge

`ProjectDetailView` gains an optional `assistant?: AssistantEntryState` field (type-only;
`import type`). The Project page calls `prepareAssistantEntry(slug)` after
`getProjectDetail()` and passes `detail={{ ...detail, assistant }}`. `ProjectDetail`
(`components/planning/project-detail.tsx`) is unchanged and renders nothing from it.

## Notes

- `npm run build` was **not** run in this worktree: its `node_modules` is empty
  (dependencies resolve upward to the main repo's `node_modules` for vitest/tsc), and
  Turbopack requires a real local `node_modules` (documented in `AGENTS.md`). This is a
  pre-existing environment condition, not a code issue; `typecheck` is the TS gate here.
  The prior `r2-contracts` task likewise recorded no build output.

## Next safe action

Stop for independent review of `r2-context` before Task 3 (source gates).

---

## Independent reviewer result — Task 2 (2026-09-01)

**Reviewer:** Pact seat `claude` (orchestrator review; separate from the `opencode` implementation run)
**Candidate reviewed:** `c72d03a`
**Verdict:** **ACCEPT**

- Scope remains within Task 2. The page supplies only browser-safe entry state; `ProjectDetail` has no new rendering behavior.
- Inspection found receipt/manifest fragments remain server-side; the browser state excludes fragment content, authoritative paths, model and budgets.
- Independent verification passed: Task 2 focused tests **2 files / 22 tests**, `npm run typecheck`, and `git diff --check 6344651..HEAD`.

Task 3 is not covered by this acceptance and requires a separate Pact assignment/review cycle.

---

# Task 3 — one-time source gates and safe read tools (`r2-source-gates`)

**Pact task:** `r2-source-gates` (feature `r2-management-assistant`)
**Seat:** `opencode` (worker)
**Branch:** `codex/r2-management-assistant`
**Worktree:** `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r2-pact-orchestrator`
**Base SHA at start:** `348b03b` (`pact: ledger sync`)

## Scope audit

Implemented **only** Task 3 from the canonical plan. Files touched:

| File | Change |
|---|---|
| `lib/assistant/source-gates.ts` | new — process-local digest-only one-time gates (`createSourceGate`, `consumeSourceGate`, `rejectSourceGate`) |
| `lib/assistant/source-gates.test.ts` | new — gate lifecycle focused coverage |
| `lib/assistant/source-files.ts` | new — fail-closed bounded list/read (`listProjectFiles`, `readProjectFiles`, `createAssistantReadTools`, `sourceBudgetFromGate`) |
| `lib/assistant/source-files.test.ts` | new — real-filesystem safety coverage |

No shell, Git, provider, dependency, credential, route, UI, activity, write, or
Task 4+ work. No history revival. `SourceFragment` is reused via `import type`
from Task 2's `context.ts` (no runtime coupling).

## Design decisions

- **Gates are digest-only and process-local.** `createSourceGate` binds
  Project/question/manifest digests, the fixed Standard/Deep source budgets
  (`sourceFiles`/`sourceBytes`/`toolCalls`) and the `gateTtlMs` expiry. The store
  holds only digests + gate metadata — never the question, history, source body,
  answer, or reasoning. A process restart invalidates every gate; nothing is
  persisted or recorded to activity.
- **Atomic/single-use/rejectable.** `consumeSourceGate` validates status →
  expiry → Project → question digest → manifest digest in a single synchronous
  transition, then marks the gate `consumed`. A second consume returns
  `SOURCE_GATE_CONSUMED`; `rejectSourceGate` (optionally `reason: "cancelled"`)
  transitions `active` → `rejected`/`cancelled` without granting either
  capability. Lazy cleanup removes gates well past expiry.
- **Fail-closed read.** `readProjectFiles` resolves the registered workspace via
  the existing direct-child trusted-root guard (`isDirectChildOfTrustedRoots` +
  `loadControlHostConfig`), rejects a symlinked/missing/non-directory/untrusted
  workspace, then per path rejects: traversal/absolute/backslash/empty/dot/`..`
  (`SOURCE_PATH_REJECTED`), excluded dirs and credential files
  (`SOURCE_PATH_EXCLUDED`), every symlink at any path component
  (`SOURCE_SYMLINK_REJECTED`), non-regular files (`SOURCE_FILE_NOT_REGULAR`),
  disallowed extensions (`SOURCE_EXTENSION_REJECTED`), per-file oversize
  (`SOURCE_FILE_TOO_LARGE`), NUL/invalid-UTF-8 binary (`SOURCE_FILE_BINARY`), and
  a final realpath containment escape (`SOURCE_PATH_ESCAPED`).
- **Bounded budget.** A `SourceReadBudget` (`sourceBudgetFromGate`) threads
  `remaining_files`/`remaining_bytes`/`remaining_tool_calls` across calls;
  `createAssistantReadTools` binds a gate to a shared session and returns
  `remaining_tool_calls`/`remaining_bytes` on every call (the Task 5 model-tools
  seam). Exceeding any bound fails closed (`SOURCE_FILES_EXCEEDED`,
  `SOURCE_BYTES_EXCEEDED`, `SOURCE_TOOL_CALLS_EXHAUSTED`).
- **Deterministic bounded listing.** `listProjectFiles` walks with
  `readdir({ withFileTypes: true })`, skips excluded dirs/files, symlinks, and
  non-allowed extensions, sorts deterministically, caps at a listing bound, and
  filters by an optional safe `prefix`.
- **Extension allowlist.** Only bounded source/config/document text extensions
  are readable. `EXCLUDED_DIRS` and `EXCLUDED_FILES` follow the plan verbatim,
  with one strengthening: `EXCLUDED_FILES` matches `.env.*` (e.g. `.env.local`,
  `.env.production`) in addition to `.env`, because the plan's literal
  `\.env($|\.)` form does not actually match `.env.*` and those are credential
  files that must fail closed (spec §11.4/§14.2).

## RED → GREEN evidence

**RED (implementation absent, tests present):**

```text
 Test Files  2 failed (2)
      Tests  no tests
```

`Failed to resolve import "./source-gates"` / `"./source-files"` — the assertions
exist but the modules that reject/assemble them do not.

**GREEN (after implementation):**

```text
$ npm test -- lib/assistant/source-gates.test.ts lib/assistant/source-files.test.ts
 Test Files  2 passed (2)
      Tests  33 passed (33)
```

Focused coverage proves: gate budget derivation (standard 6 files/192 KiB/4 calls,
deep 12/384 KiB/8), digest-only storage (no question/history text), single-use
consume, second-consume `SOURCE_GATE_CONSUMED`, Project/question/manifest
mismatch, expiry, unknown-gate, reject and cancel invalidation; deterministic
sorted listing with prefix filtering and exclusions; regular read into a
digest-bearing fragment; traversal/absolute/excluded-dir/excluded-file/symlink/
non-regular/binary-NUL/oversize/disallowed-extension/missing-file rejection;
per-file and total-byte and file-count and tool-call exhaustion; workspace
disappearance; a post-gate symlink escape; and shared tool-call accounting
across a read-tools session.

## Static checks (run after final code)

```text
$ npm run typecheck      → exit 0
$ git diff --check       → exit 0
$ npm test               → 46 files / 305 tests passed (was 44 / 272 in Task 2)
$ npm run lint           → 0 errors (65 pre-existing warnings in unrelated files; none in the new files)
```

## Notes

- `npm run build` was not run in this worktree: its `node_modules` is empty and
  Turbopack requires a real local `node_modules` (documented in `AGENTS.md`).
  `typecheck` is the TS gate here; prior `r2-contracts`/`r2-context` tasks
  likewise recorded no build output.

## Next safe action

Stop for independent review of `r2-source-gates` before Task 4 (MiniMax-M3 model
client).

---

## Independent reviewer result — Task 3 (2026-09-01)

**Reviewer:** Pact seat `claude` (separate from the `opencode` implementation run)
**Candidate reviewed:** `afd33d6`
**Verdict:** **ACCEPT**

- Gate and read-tool scope is limited to Task 3; no provider, credential, route, UI, activity, write, Git/shell, or history addition.
- Review confirmed digest-bound single-use/expiry/rejection state and fail-closed handling for traversal, sensitive files, symlinks, non-regular/binary content and budgets.
- Independent verification passed: focused source tests **2 files / 33 tests**, `npm run typecheck`, and `git diff --check 67da67f..HEAD`.

Task 4 requires a separate dependency/provider compatibility gate and Pact review.

---

## Task 4 Token Plan correction and acceptance (2026-09-01)

**Implementation:** Human Owner-directed orchestrator correction (no worker dispatched)
**Reviewed candidate:** `45e70df` and `b446a89`
**Verdict:** **ACCEPTED by Human Owner direction**

- Replaced the incorrect `vercel-minimax-ai-provider` integration with the official Token Plan OpenAI-compatible contract: `https://api.minimax.io/v1`, `MiniMax-M3`, and server-only `MINIMAX_API_KEY`.
- The installed LaunchAgent stores the key in its private `EnvironmentVariables`; adapter code fails closed if it is missing. No key exists in repository configuration, tests, logs, prompt output, or activity.
- Focused verification: `npm test -- lib/assistant/minimax-token-plan.test.ts lib/assistant/prompt.test.ts lib/planning/config.test.ts` passed **3 files / 15 tests**; `npm run typecheck` and whitespace/removed-provider checks passed.
- Live synthetic validation (explicit Token Plan authorization): official `POST /v1/chat/completions` returned HTTP 200, `model: MiniMax-M3`, `object: chat.completion`, and usage metadata. The key, prompt, reasoning, and response body were not recorded or printed.

The earlier Vercel-provider blocker is superseded. Task 5 remains a separate implementation and review boundary.

### Pact audit exception

The historical task owner was `opencode`, but the corrected Token Plan implementation was
performed directly by the orchestrator after the Human Owner instructed that no worker be
dispatched. On 2026-09-01, the Human Owner explicitly authorized a **Human Owner direct
acceptance exception** for Task 4.

Pactify v1 has no operation to reassign an existing task owner and this project's roster has
no `human` seat. It correctly refused both cancelling the `changes_requested` historical task
with unreviewed commits and reviewer acceptance before an owner checkpoint. No worker identity
was used or simulated. The human-acceptance record is therefore committed as
`.pact/tasks/r2-management-assistant-token-plan-human-acceptance.md`; the code verdict is
accepted by Human Owner direction, while the Pact ledger remains `changes_requested` until the
protocol supports a compliant migration or the historical owner submits a checkpoint.

---

## Task 5 Start Card (2026-09-01)

```md
Workflow: 3.3
Task: R2 Task 5 — bounded orchestration and streaming response route
Role: Primary Agent (Codex)
Tier / reason: T3 — new server Route Handler on the model-backed Project Detail journey
Canonical record: .agent/frontend-design/r2-management-assistant/
Branch / worktree: codex/r2-management-assistant · .worktrees/r2-pact-orchestrator
Mockup Gate: Required — approved Task 0 revision 2; Task 5 has no visual divergence
Review path: focused service/stream/real Request-Response tests, then independent review
Human checkpoints: approved R2 brief + Mockup Gate; no merge, release, or deployment authorization
```

**Current contract reconciliation:** Task 5 is implemented against Task 1's strict fresh-run
intent (no `history`) and Task 4's accepted official MiniMax Token Plan OpenAI-compatible adapter,
not the superseded Vercel-provider/history examples retained in the older canonical plan text.

## Task 5 implementation evidence (2026-09-01)

**Implementation:** Codex primary agent; no implementation worker dispatched
**Candidate:** pending commit on `codex/r2-management-assistant`

- Added the server-only bounded service, strict NDJSON codec, and `POST /api/assistant/respond`.
  The route accepts only same-origin, bounded JSON that parses as the strict intent contract; it
  returns `application/x-ndjson`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`.
- The service rebuilds and compares context before model invocation, invokes MiniMax at most once
  (`maxRetries: 0`), validates output citations against manifest sources, rebuilds context after
  output, records a metadata-only `ASSISTANT_RUN` receipt, and marks stale output non-actionable.
  The new `STALE_CONTEXT` code represents a pre-call mismatch without invoking the provider.
- A source request receives a server-created digest-only single-use gate. Only `inspect_source`
  receives the gate's bounded Task 3 read tools; `answer_without_source` re-sends its current
  bounded question with no gate/tool authority. No history field was restored.
- RED → GREEN: missing service/stream/route modules first failed as expected. Additional RED tests
  caught an initially incorrect denied-source gate pass-through and an overly broad preflight error
  code; both now pass.
- Final focused verification: `npm test -- lib/assistant/contracts.test.ts lib/assistant/service.test.ts lib/assistant/stream.test.ts app/api/assistant/respond/route.test.ts` → **4 files / 41 tests passed**;
  `npm run typecheck` → passed; `git diff --check` → passed.
- Real boundary probe: a temporary loopback-only Next development server on `127.0.0.1:3458`
  received one deliberately invalid cross-origin POST. It returned **403** with `no-store` and
  `nosniff`; no valid intent, provider call, credential, or model output was involved. The server
  was then stopped.

**Scope:** Task 5 only. No UI/Task 6, planning mutation, Backlog application, Git/shell execution,
agent dispatch, deployment, merge, push, or release action.

---

## Task 6 Start Card (2026-09-01)

```md
Workflow: 3.3
Task: R2 Task 6 — Project Detail management-assistant panel
Role: Primary Agent (Codex)
Tier / reason: T3 — a model-backed, project-scoped interaction added to the Planning Core journey
Canonical record: .agent/frontend-design/r2-management-assistant/
Branch / worktree: codex/r2-management-assistant · .worktrees/r2-pact-orchestrator
Mockup Gate: Required — approved Task 0 revision 2; companion is a persistent composer, not a continuous conversation
Review path: focused client tests, final-build desktop/mobile evidence, then independent review and verification
Human checkpoints: approved R2 brief + Mockup Gate; explicit continuation while Task 5 awaits review; no merge, release, or deployment authorization
```

**State matrix:** disabled configuration entry; default and optional-source selection; empty-question
validation; one active loading request; structured success; source-access gate; provider/request error;
stale result; incomplete transport; session persistence limited to mode and current visible direct answer;
project switch closes and clears the panel. All source bodies, reasoning, prompts, credentials, gates,
and action authority remain outside browser storage.

**Design direction:** approved Paper Workbench. Backlog/Task reading remains in the dominant page
column; the assistant is a right-side 420–520px companion Sheet (full-height at 390px). Its result is
a dark-ink-headed structured document record labelled `Companion output`, never conversational bubbles.
The Sheet uses the generated accessible Radix primitive with Paper tokens and no decorative blur.

## Task 6 implementation evidence (2026-09-01)

**Implementation:** Codex primary agent; no implementation worker dispatched
**Candidate:** pending commit on `codex/r2-management-assistant`

- Added the project-scoped `Management assistant` entry to Project Detail and an accessible Radix
  Sheet with heading focus, Escape/close behavior, a persistent composer, Standard/Deep choice,
  optional-document selectors, one active request, and a labelled Companion output record. The
  composer sends a fresh strict intent only; it has no history, browser-supplied source body,
  prompt, reasoning, credential, gate, or action authority.
- The client stores only `mode` and the current visible direct answer/digest in project-scoped
  `sessionStorage`, rejects malformed, oversized, and authority-bearing records, clears the panel
  on project switch, and treats stale, incomplete, validation, source-gate, and request-error
  states explicitly. The NDJSON decoder accepts the service's real terminal ordering
  (`assistant_complete` followed by `run_status: complete`).
- Added only the required shadcn Radix Sheet/Button primitive after `info` and `sheet --dry-run`;
  reviewed the generated overlay and removed its decorative backdrop blur. Companion styling uses
  existing Paper Workbench tokens, a dense document layout, and full-height mobile Sheet rules.
- A final build caught the existing Task 5 Route Handler export violation. The testable route
  factory now lives in `route-factory.ts`; `route.ts` exports only Next-compatible route members.
  A focused route test remains the contract proof for that move.

**Focused verification:**

```text
npm test -- app/api/assistant/respond/route.test.ts components/planning/assistant-session.test.ts components/planning/assistant-panel.test.tsx components/planning/components.test.tsx
  → 4 files / 19 tests passed
npm run typecheck
  → passed
git diff --check
  → passed
./node_modules/.bin/next build --webpack
  → passed (final candidate build)
```

**Final build visual evidence:**

- `mockup-screens/task6-final-desktop-1440.png` — 1440×1000, final build.
- `mockup-screens/task6-final-mobile-390.png` — true 390×844 viewport, final build.
- The current Control Host `config.json` has no `assistant` section. The final build therefore
  correctly displays the disabled entry and its explanation at both widths; a non-secret visual
  placeholder was used only to start the isolated loopback server, and no model request occurred.
  This is separate from the LaunchAgent's configured key. Enabled, source-gate, stale, validation,
  incomplete, error, and project-switch behavior are covered by the focused component tests above.

**Review packet — required independent review / verification:**

```text
Task / revision: R2 Task 6 — approved Project Detail panel, Mockup Gate revision 2
Tier: T3
Candidate: pending commit on codex/r2-management-assistant
Worktree: .worktrees/r2-pact-orchestrator
Authoritative inputs: brief.md; mockup/; .pact/tasks/r2-management-assistant-panel.md;
  Task 1 strict fresh-run contract; Task 4 official Token Plan adapter; Task 5 route contract
Review scope: diff for Task 6 plus route-factory extraction; verify no conversation history,
  source body, reasoning, credentials, gates, or action authority enter sessionStorage/request;
  confirm Sheet focus/close, state matrix, desktop dominance, true-390px full-height behavior,
  and no Task 7 mutation surface.
Evidence: 4 focused test files / 19 tests; typecheck; diff check; final Webpack build; canonical
  final-build 1440px and 390px screenshots above.
Required output: independent findings and verification result written to this handoff, then Pact
  reviewer acceptance only if all required checks pass. Do not merge, release, or deploy.
Independence: no independent reviewer/verification run has yet occurred.
```

**Next safe action:** have a new independent review/verification session assess this candidate,
write its conclusion here, and use the Pact reviewer path. Human Owner still owns final walkthrough,
configuration enablement, merge, release, and deployment decisions.

### Pact checkpoint audit (2026-09-01)

After committing the candidate as `ab966a7`, the orchestrator attempted the required checkpoint:

```text
pactify checkpoint r2-panel --evidence "…"
→ pactify checkpoint: opencode is not the owner of r2-panel (owner: claude)
```

The task is assigned to `claude` but this worktree is bound to the `opencode` seat. No seat switch,
identity simulation, reviewer self-acceptance, merge, release, or deployment was attempted. The
Pact ledger remains `assigned`; an owner checkpoint or an explicit Human Owner exception is required
before the independent reviewer can accept it.

### Human Owner audit exception (2026-09-01)

The Human Owner explicitly authorized the owner/seat mismatch audit exception. The durable record is
`.pact/tasks/r2-management-assistant-panel-human-audit-exception.md`. It allows `ab966a7` and
`ca33780` to enter the independent review packet without an owner checkpoint, but does not waive
independent T3 review/verification, final Human Owner walkthrough, configuration enablement, merge,
release, or deployment approval.

---

# Task 4 — MiniMax-M3 provider proof + adapter (`r2-minimax-client`) — **BLOCKED**

**Pact task:** `r2-minimax-client` (feature `r2-management-assistant`)
**Seat:** `opencode` (worker)
**Branch:** `codex/r2-management-assistant`
**Worktree:** `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/r2-pact-orchestrator`
**Base SHA at start:** `e95a82b` (`pact: ledger sync`)
**Status:** **BLOCKED** — the installed provider cannot transmit the MiniMax-M3
adaptive-thinking option. No adapter/prompt/smoke code was written, per the task
spec: "If any proof is absent, checkpoint as blocked; never substitute provider,
protocol or model."

## Install + inspect (required step, completed)

Installed in the plan's required order (`ai` alone first, inspect, then the
provider), then inspected the installed source before writing any code:

```text
$ node -e "console.log(require('./node_modules/ai/package.json').version)"
7.0.87

$ node -e "console.log(require('./node_modules/vercel-minimax-ai-provider/package.json').version)"
0.0.2

$ node -e "console.log(JSON.stringify(require('./node_modules/vercel-minimax-ai-provider/package.json').dependencies, null, 2))"
{
  "@ai-sdk/anthropic": "3.0.6",
  "@ai-sdk/provider": "3.0.2",
  "@ai-sdk/provider-utils": "4.0.4"
}
```

`ai` (AI SDK v7) exposes: `streamText` (`node_modules/ai/src/generate-text/stream-text.ts`),
`Output.object({ schema, name, description })` (`.../generate-text/output.ts`),
`tool()`, `stepCountIs()`, `providerOptions`, `abortSignal`, `maxOutputTokens`,
`stopWhen`; result streams `textStream`, `fullStream`, `partialOutputStream`, and
promises `text`, `usage`, `finishReason`, `reasoning`/`reasoningText`.

`vercel-minimax-ai-provider@0.0.2` exports (`dist/index.d.ts`):

```ts
minimax            → alias of minimaxAnthropic   (Anthropic-compatible, DEFAULT)
minimaxAnthropic   → createMinimaxAnthropic()
minimaxOpenAI      → createMinimax()             (OpenAI-compatible; NOT to be used)
createMinimax      → alias of createMinimaxAnthropic
createMinimaxOpenAI
```

## Proof table

| # | Required proof | Result | Evidence |
|---|---|---|---|
| 1 | MiniMax-M3 | ✅ PROVEN | `MinimaxChatModelId = 'MiniMax-M2' \| ... \| string`; `minimax("MiniMax-M3")` returns a `LanguageModelV3`. Official MiniMax docs list MiniMax-M3 (context 1M) for both the Anthropic and AI SDK interfaces. |
| 2 | default Anthropic-compatible protocol | ✅ PROVEN | `minimax === minimaxAnthropic`; `createMinimaxAnthropic` wraps `@ai-sdk/anthropic/internal` `AnthropicMessagesLanguageModel`, base URL `https://api.minimax.io/anthropic/v1`, headers `anthropic-version: 2023-06-01` + `x-api-key`, env var `MINIMAX_API_KEY`. |
| 3 | streaming | ✅ PROVEN | `streamText` → `fullStream`/`textStream`/`partialOutputStream`; provider `doStream` maps Anthropic SSE `text_delta`/`thinking_delta`. MiniMax docs: `stream` "Fully supported". |
| 4 | tools | ✅ PROVEN | `streamText({ tools })` → provider maps to Anthropic `tools`/`tool_choice`. MiniMax docs: `tools`/`tool_choice` "Fully supported". |
| 5 | structured output | ⚠️ mechanism only | `Output.object({ schema })` → `responseFormat:{type:'json',schema}`. For "MiniMax-M3" `getModelCapabilities` → `isKnownModel=false`, `supportsStructuredOutput=false`, so the anthropic provider falls back to a `jsonResponseTool` ("json" function tool) + SDK-side JSON parse/Zod validation. Native `output_format`/json_schema is **not** listed in MiniMax's Anthropic supported-parameters table. Workable, but not native structured output. |
| 6 | exact adaptive-thinking option | ❌ **ABSENT — BLOCKER** | See below. |

## Blocker — the exact adaptive-thinking option is not reachable

The MiniMax-M3 Anthropic-compatible API documents exactly one way to enable
thinking (platform.minimax.io/docs/api-reference/text-anthropic-api, "Thinking
Control"):

> - If `thinking` is omitted, thinking is off by default.
> - Set `thinking: {"type": "adaptive"}` to explicitly enable thinking. For
>   MiniMax-M3, `adaptive` is equivalent to thinking on.
> - Set `thinking: {"type": "disabled"}` to explicitly keep thinking off.

The installed provider cannot emit `{"type": "adaptive"}`:

1. `vercel-minimax-ai-provider@0.0.2` reuses `@ai-sdk/anthropic@3.0.6` verbatim
   (`createMinimaxAnthropic` → `AnthropicMessagesLanguageModel`, provider
   `"minimax.messages"`). The string `adaptive` appears **nowhere** in either
   package (`rg -c "adaptive"` = no matches in both `dist/index.js`).
2. `@ai-sdk/anthropic@3.0.6`'s provider options schema
   (`node_modules/@ai-sdk/anthropic/dist/index.js:757-760`) is:

   ```ts
   thinking: z.object({
     type: z.union([z.literal("enabled"), z.literal("disabled")]),
     budgetTokens: z.number().optional()
   }).optional()
   ```

   `parseProviderOptions` (`@ai-sdk/provider-utils`, `safeValidateTypes`) rejects
   any other `type` — passing `thinking:{type:"adaptive"}` throws
   `invalid anthropic provider options` before any request is sent.
3. The only `enabled` path maps to Claude's extended thinking, not MiniMax's
   adaptive form (`@ai-sdk/anthropic/dist/index.js:2452-2466, 2549-2586`):

   ```ts
   const isThinking = anthropicOptions?.thinking?.type === "enabled";
   ...
   thinking: { type: "enabled", budget_tokens: thinkingBudget }   // budget_tokens
   ```

   MiniMax documents no `enabled` value and no `budget_tokens`; sending
   `{type:"enabled", budget_tokens:1024}` would be an unverified provider
   behavior, not the documented `adaptive` option.

Consequence: there is no verified way to enable MiniMax-M3 adaptive thinking
through the installed provider. Both substitution paths are forbidden by the
task ("never substitute provider, protocol or model"; "Do not import
`minimaxOpenAI`"). The provider pins `@ai-sdk/anthropic@3.0.6` exactly, so this
cannot be fixed by upgrading that transitive dependency without changing the
provider's own published contract.

## What was deliberately NOT done

No `model-client.ts`, `minimax-client.ts`, `prompt.ts`, smoke script, or focused
tests were written, because the adapter's "Deep only verified adaptive option"
requirement cannot be satisfied without an unverifiable thinking substitution.

## Recommended next action (for the orchestrator/reviewer)

Reopen the spec to resolve one of:

1. **Provider update** — wait for / request a `vercel-minimax-ai-provider`
   release that maps `providerOptions.anthropic.thinking.type === "adaptive"` to
   MiniMax's `thinking: {"type": "adaptive"}` (or adds a MiniMax-native thinking
   passthrough), then re-run this Task 4 proof.
2. **Spec clarification** — if the intent was actually "enable thinking", have
   the Human Owner re-authorize the exact wire form for Standard/Deep and record
   it in `brief.md` before implementation.

Either way, the fixed `minimax("MiniMax-M3")` + default Anthropic-compatible
protocol + `Output.object` + tools + streaming + `abortSignal` + `maxOutputTokens`
surface all remain intact and ready for the adapter once the adaptive option is
resolvable.
