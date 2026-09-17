# Caphub P4 Implementation Log

**Implementer:** KimiCode (`k3-256k`) · **Seat:** `kimi` (worker, bound in this worktree only)
**Status:** implementation accepted locally; P4-A/P4-B/P4-C remain closed Human gates

## Task 0 — isolated baseline (this entry)

- **Planning base SHA:** `4b373dd91c365594283038f083d37a01488ec515` (`docs(caphub): define p4 export phase`, tip of `codex/caphub-p4-spec-plan`)
- **Implementation branch:** `codex/caphub-p4-implementation`
- **Worktree:** `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/caphub-p4-implementation`
- **Toolchain:** Node v24.14.0 · npm 11.9.0 · PostgreSQL 17.11 (Homebrew, `initdb`/`pg_ctl` at `/opt/homebrew/opt/postgresql@17/bin`)
- **Tree state at start:** clean (`git status --short` empty except the local `.pact/seat` binding, which is never staged); `git diff --check` exit 0
- **Focused baseline evidence (same exact base as recorded P3 full-suite evidence):**
  - `npx vitest run lib/caphub/registry/schemas.test.ts lib/caphub/registry/confirmations.test.ts lib/caphub/registry/migrate.test.ts lib/planning/config.test.ts`
  - Result: **4 files / 63 tests PASS** (migrate runs against a fresh temporary PostgreSQL 17.11 cluster)
- **Plan boundary recorded:** no real Vault/Agent/package roots, no provider/model calls, no production configuration, no production migration, no publish/deploy, no push/PR/merge/tag/release, no service restart or traffic switch. Automated filesystem writes only under freshly created sentinel-owned temporary roots. Gates P4-A/P4-B/P4-C remain hard stops.
- **pact:** seat `kimi` bound locally; no task dispatch (P4 tracked by plan, not pact board).

## Running task log

Tasks follow `docs/superpowers/plans/2026-09-16-caphub-obsidian-package-export.md` in exact order 0–12, one narrow commit per task.

## Task log (chronological)

| Task | Commit | Delivered | Focused verification |
|---|---|---|---|
| 0 | `8261209` | isolated worktree/branch, seat `kimi`, baseline log | `git diff --check` 0; 4 files / 63 tests PASS |
| 1 | `14e1c3f` | `lib/caphub/packages` schemas/digest/types; registry `deployment_plan`/`dpl_`/deployment review kinds + lineage | 3 files / 59 tests PASS; typecheck PASS |
| 2 | `0ef490a` | `003_exports.sql` (forward-only; 001/002 checksums preserved), `PostgresExportStore` compose/finalize/plan/realize, concurrency + idempotency | migrate + exports + caphub-stores 3 files / 27 tests PASS; records/reviews regression 18 tests PASS |
| 3 | `9919adc` | pure `composeCapabilityPackage`, `ReleaseService.createCandidate/finalizeApproval`, deterministic release identity | compose 10 + service 10 + behavior 7 = 27 tests PASS (real PG) |
| 4 | `4d808d3` | deterministic neutral package renderer (package.yaml/instructions/policies/evaluation/provenance + experience/references), bounded unified diff with root redaction | 4 files / 56 tests PASS |
| 5 | `11ec447` | byte-safe Obsidian document parser + renderer, human region byte preservation, managed digest | 2 files / 18 tests PASS |
| 6 | `01274b8` | target-root validator (sentinel/alias/symlink/nesting), read-only planner (create/update/unchanged/conflict/orphan), fixture-safe apply with lock + recovery + reconcile | 6 files / 45 tests PASS |
| 7 | `fe003a0` | shared adapter contract + Codex/Claude/Hermes pure previews, license/permission/dependency fail-closed | 4 files / 14 tests PASS |
| 8 | `c4fcf2e` | `DeploymentService` exact plans, fixture publisher (immutable version dirs, atomic pointer, operation records, recovery), rollback retains history, full BDD chain | plan 9 + publisher 5 + recovery 4 + behavior 1 = 19 tests PASS (real PG + temp roots) |
| 9 | `554f37c` | disabled-by-default export config, `ExportRuntime` gating + root validation, safe CLIs (`caphub:project/export/publish`) | config 40 + runtime 4 + CLI 4 = 48 tests PASS |
| 10 | `2ba0538` | `getCapabilityExportState` safe DTO + leakage tests, Review Center deployment filter, read-only P4 UI panel + manifest diff | queries 9 + pg 2 + components 25 = 36 tests PASS |
| 11 | `32dbcd2` | P4 Playwright suite (8 scenarios), production-build fixture server, screenshots 1440 + true 390 | E2E 8/8 PASS; screenshots in `.agent/caphub/p4-screenshots/` |

## Final phase gate (Task 12)

Run once on the tree at `53f11d7`; the scoped independent Review then landed fixes in `c3e1313`
(re-verified by the affected 78 files / 520 tests, publisher regressions, typecheck, lint,
production build, and P4 E2E 8/8) followed by the doc-only closeout `03b39ac`:

- `env -u MINIMAX_API_KEY npm test` — **150 files / 1335 tests PASS** (the `MINIMAX_API_KEY` var is set-but-empty in this shell and makes a pre-existing, P4-untouched `lib/assistant/prompt.test.ts` assertion fail when present; with a clean env the whole suite is green).
- `npm run typecheck` — PASS (0 errors).
- `npm run lint` — **0 errors, 82 warnings** (P3 baseline 66; P4 net +16 warnings, all `no-explicit-any`/unused-var style in new test files, no new error).
- `npm run build` — Next.js 16.3 production build PASS (P4 routes dynamic).
- `npm run verify:deploy` — all deployment configs and invariants verified successfully.
- `npm run test:e2e:caphub-package-export` — **8/8 PASS** against the production build with fixture PostgreSQL and sentinel-owned fixture roots.

Environment: Node v24.14.0 · npm 11.9.0 · PostgreSQL 17.11 (Homebrew) · Next.js 16.3.0.

## Boundary confirmation

No push, PR, merge, tag, release, deploy, service restart, traffic switch, provider call, real root configuration, or production action occurred. Only sentinel-owned temporary directories under the system temp dir were written. Gates P4-A/P4-B/P4-C remain open Human gates.

## Independent review and verification (Task 12)

- **Review** (scoped, independent): 0 blocker / 0 high / 7 medium / 8 low. All 7 medium fixed (apply-time revalidation, approval selection, plan identity, cross-call idempotency, recovery convergence, partial version resume, export-CLI pointer validation) plus 3 low fixes; see `.agent/caphub/p4-review.md`. Re-verification: 78 files / 520 tests PASS; publisher 7/7 including two new regression tests; build + P4 E2E 8/8 PASS.
- **Verification** (scoped, independent): criteria 1–8 PASS; 9–10 flagged process gaps (closeout pending, tree dirty mid-flight) which the closeout commit resolves; see `.agent/caphub/p4-verification.md`.
- Per the bounded-review rule, the full suite was not re-run after the review fixes; the fixes are confined to the covered `lib/caphub`, CLI, and component suites listed above.

## Codex acceptance fix batch (2026-09-17, reviewed base 3b167b3)

Codex acceptance at 3b167b3 was **changes requested** (7 boundary findings). Fixes, in order, each with RED→GREEN focused tests:

| # | Finding | Fix commit | Key changes | Regression tests |
|---|---|---|---|---|
| 1 | Forged-pointer publish bypass | `5939156` | `alreadyApplied` removed; idempotent success anchored on validated completed operation + pointer + fully verified version bytes; target JSON parsed/validated (`parsePointerJson`); forged pointer fails STALE before any write | `publisher.acceptance.test.ts` (7 tests incl. forged-pointer no-write proof) |
| 2 | §9.2 revalidation optional | `5939156` | `assertAuthority` mandatory; strict `fullRevalidate` order: authority → manifest reproduction → pointer equality → preimage reproduction → rollback dir | omitted-checker + preimage-mismatch tests |
| 3 | Version bytes trusted via marker | `5939156` | `verifyVersionDirectory`: exact file set/paths/bytes/SHA-256, no missing/extra/symlink; resume-safe materialization fails closed on unexpected files | tampered/missing/marker-only/unexpected/symlink tests |
| 4 | Recovery deleted live locks | `728c1a7` | `acquireLeaseLock` in recovery.ts: takeover only for same operation + provably dead pid + staleness bound; wired into publisher + projection apply/reconcile | 3 recovery lease tests + 2 publisher + 2 projection tests |
| 5 | Durability gaps | `4996f8b` | `writeFileDurable` (same-dir exclusive temp + fsync + atomic rename) applied to current.json, operation records, version marker/files, projection recovery record, lease owner.json | covered by existing injected-failure reconciles |
| 6 | Dry-run walked mixed manifests | `4996f8b` | `readActiveManifestDirectory` binds pointer→operation→exact manifest dir; CLI normalizes adapter-relative paths | two-manifest CLI regression test |
| 7 | Contradictory lifecycle copy | `628b553` | `CapabilityRegistryDetail` takes `exportView`; one combined state (candidate-only / release-bound / deployed); aside cards driven by release/deployment truth | 3 component tests + 3 whole-page E2E assertions |

### Final gates for the fix batch (at `628b553`)

- Combined focused suite (`lib/caphub` + `components/caphub` + CLI): **79 files / 538 tests PASS**.
- Full unit/component suite (closeout, clean env): **151 files / 1355 tests PASS** (+20 vs previous gate).
- `npm run typecheck` PASS; `npm run lint` **0 errors / 89 warnings**.
- `npm run build` PASS (final screenshots bound to this build); `npm run verify:deploy` PASS.
- P4 E2E: **11/11 PASS** (8 prior scenarios + 3 whole-page lifecycle assertions).

### Evidence corrections (per acceptance handoff)

- Base (`4b373dd`) → reviewed head (`3b167b3`) history is **14 commits** (earlier handoff miscounted 15).
- `.pact/seat` is a **tracked** file with a local seat-binding modification (opencode→kimi); preserved, never staged/restored/committed in any fix commit.
- The earlier independent verification evaluated pre-fix evidence; a fresh independent verification is bound to the final fix SHA (see `.agent/caphub/p4-acceptance-verification.md`).
- Lint warnings reconciled from fresh output: 89 (was recorded as 81/82 mid-batch before the fix batch grew the test surface).

### Scoped independent review of the fix batch

One independent reviewer evaluated `3b167b3..628b553`: 1 HIGH + 4 MEDIUM + 2 LOW. All HIGH/MEDIUM fixed in `196110d` (convergence stage gate, mandatory authority factory with diff reproduction, rollback replay, operation JSON validation, state-aware page copy, lease temp naming) plus LOW hygiene; see `.agent/caphub/p4-acceptance-review.md`. Re-verification: 84 files / 562 tests, build PASS, E2E 11/11, full suite 152 files / 1361 tests, typecheck PASS, lint 0 errors / 79 warnings, verify:deploy PASS.

## Codex final re-acceptance closeout (2026-09-17)

Codex directly closed the remaining acceptance gaps in five narrow commits after the prior
verification record:

| Commit | Scope |
|---|---|
| `eb571a9` | bind pointer, operation, plan, marker, bytes, exact Release/Deployment authority, idempotent replay preimage, and rollback target bytes |
| `6e2b5f3` | remove broad Next build tracing without weakening workspace-root rejection |
| `ab6893d` | make the P4 browser fixture use the production canonical pointer digest |
| `7ae8402` | close final reviewer findings: operation+marker forgery, pre-lease authority/root/sentinel preflight, apply evidence binding, marker-less unsafe directory handling, and post-write exact verification |
| `d595e64` | close verifier TOCTOU finding by applying the under-lock root/sentinel recheck to realized crash-convergence before pointer reads or completion writes |

Focused RED→GREEN evidence included forged marker-manifest binding, production replay from the
approved preimage, consumed/wrong Deployment authority, rollback target tampering, combined
operation+marker forgery, authority-before-lease ordering, mutated sentinel rejection,
marker-less symlink rejection, exact apply-evidence binding, and sentinel mutation during lease
acquisition on realized recovery. The final directly affected files passed **2 files / 27 tests**;
the broader P4 set had already passed all unaffected tests.

Final gate at code SHA `d595e6443a2400b2602c70de0211c70503f85cba`:

- `env -u MINIMAX_API_KEY npm test` — **152 files / 1373 tests PASS**.
- `npm run typecheck` — PASS.
- `npm run lint` — **0 errors / 79 warnings** (all pre-existing/non-blocking at this final diff).
- `npm run build` — Next.js 16.3.0 Turbopack production build PASS with no build warning.
- `npm run verify:deploy` — PASS.
- `npm run test:e2e:caphub-package-export` — **11/11 PASS** against the final build; true 390px viewport and WCAG A/AA checks included.
- `git diff --check` — PASS.

One scoped independent reviewer first returned **CHANGES_REQUIRED** for 1 Critical and 3
Important trust-boundary findings. All four were fixed in `7ae8402`; the same reviewer performed
a fix-only re-review and returned **PASS**. A subsequent verifier found one additional Important
TOCTOU in realized crash-convergence; `d595e64` fixes it with a RED→GREEN regression. Final
independent verification will be rebound to the updated evidence commit and recorded separately in
`.agent/caphub/p4-acceptance-verification.md`.

No real Vault/Agent root, provider, production PostgreSQL, deployment, service restart, push,
PR, merge, tag, release, P4-A, P4-B, or P4-C action occurred. `.pact/seat` remains a tracked,
locally modified seat binding and is absent from every P4 fix/evidence commit.
