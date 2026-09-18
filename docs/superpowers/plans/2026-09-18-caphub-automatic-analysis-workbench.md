# Caphub Automatic Analysis Workbench Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for inline execution. Steps use checkboxes for tracking. Independent review is required for the coherent concurrency/deletion changeset, not after every task.

**Goal:** Make browser upload produce a visible Caphub analysis and Review result, with filename conflict confirmation, deduplicated work items, faster reads, and 30-day raw-image retention.

**Architecture:** Keep immutable Registry evidence and V4 analysis contracts. Add operational filename, request, and retention tables; a private single-concurrency worker runs the existing workflow. Caphub queue and detail routes load separately.

**Tech Stack:** Next.js 16.3.3, React 19, TypeScript, PostgreSQL/Neon, pg, Neon S3 adapter, launchd, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-18-caphub-automatic-analysis-workbench-design.md`

## Global constraints

### Execution status — 2026-09-18

- [x] Tasks 0–9: isolated implementation, real temporary PostgreSQL/final-build browser acceptance, disabled operational assets.
- [x] Task 10 local integration: one full test run with an obsolete UI assertion corrected by focused rerun; subsequent affected regressions, typecheck, lint, build, screenshots and scoped independent review complete. Detailed results: `.agent/caphub/automatic-analysis-verification.md`.
- [x] Task 11: production migration/backfill, deployment/worker activation, real-provider canary, duplicate verification, retention activation and production latency verification complete. Evidence is bound to application code SHA `766f8504b703dea86d0bd487aa607941a917aa79`.

The original granular checklists below describe the execution recipe; this dated summary and evidence record are the current completion ledger. Local candidate `104c24d` was superseded by the production fixes through `766f850`. Production Neon timing is recorded in `.agent/caphub/automatic-analysis-verification.md`.

- Preserve Human-owned main changes. The existing `.worktrees/caphub-release` is a live production working directory: do not implement, install dependencies, or build there.
- Create `.worktrees/caphub-automatic-analysis` from the committed plan; use branch `codex/caphub-automatic-analysis-impl` and real dependencies.
- Approved spec supersedes the older operator-only analysis and permanent original-image retention rules for this scope. Existing Human decision controls remain supported.
- Keep V4 schemas, provider selection, token ceilings, and provider correction policy unchanged.
- Production listener remains `127.0.0.1:3456`; exports/targets stay disabled.
- Default `analysis.autoStart=false` and retention execution disabled. Development uses owned temporary PostgreSQL/object fixtures and fake external provider edges.
- Filename normalization: reject separators, empty/reserved names; NFC, trim, locale-independent lowercase. Preserve original display name.
- Same name/content reuses canonical Capture; different content requires Human confirmation bound to the current Capture and digest.
- Thirty days means import timestamp plus 30 days, not upload time. Only successfully imported information qualifies; Human review may still be pending.
- Keep historical metadata and derived results. Shared objects cannot be removed while any live reference remains ineligible.
- Use focused RED→GREEN tests at each changed boundary; run the full suite once at final integration, repeating only affected checks after fixes.
- Production migration/configuration, new LaunchAgent, reload, real provider canary, and retention activation require the concrete release authorization described in Task 11. Previous one-shot V4 authorization is already consumed.
- No retired frontend-design-workflow. Verify final-build interaction, desktop/mobile rendering, and screenshots.

## File map and dependencies

| Area | Files / responsibility |
|---|---|
| Identity and schema | `lib/caphub/automation/contracts.ts`, `filename.ts`, Registry migration 004 |
| Intake | `automation/intake.ts`, `registry/postgres/capture-intake.ts`, Capture service/route factory |
| Queue | `registry/postgres/analysis-requests.ts`, `automation/worker.ts` |
| Retention | `automation/retention.ts`, `registry/postgres/object-retention.ts`, S3 delete port |
| Read model | `registry/work-items.ts`, `registry/review-workbench.ts`, status route |
| Product UI | `app/caphub/**`, `components/caphub/**`, primary navigation and provenance |
| Operations | worker/backfill/benchmark CLIs, worker plist, deployment verifier |
| Evidence | `.agent/caphub/automatic-analysis-verification.md`, CURRENT, ROADMAP, Linear |

Task order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. No agent concurrently edits another task's files.

## Task 0: Isolate execution and bind current context

**Files:** Read `AGENTS.md`, `.agent/CURRENT.md`, `.pact/PROJECT.md`, `.pact/STATE.yml`, approved spec, this plan, existing analysis runner/importer and local Next.js route/rendering guides.

- [ ] Inspect branch, worktree list, production working directory, and dirty files before any mutation.
- [ ] Fetch/pull with fast-forward-only semantics; stop on a divergent base rather than merge unrelated work.
- [ ] Create the implementation worktree from the plan commit:

```sh
git worktree add .worktrees/caphub-automatic-analysis -b codex/caphub-automatic-analysis-impl codex/caphub-automatic-analysis
```

- [ ] Bind the applicable Pact seat following its current roster. Install real dependencies with `npm ci` in the new worktree. Read the installed Next.js documentation before changing routes.
- [ ] Create the verification record with base SHA, approved scope, live worktree warning, test matrix, and release boundary. Record the measured old queue SSR baseline: 1.98–10.65 seconds.
- [ ] Commit only the new evidence file: `docs(caphub): initialize automation implementation evidence`.

## Task 1: Operational schema, identity rules, and migration preflight

**Create:** `lib/caphub/automation/contracts.ts`, `filename.ts`, `filename.test.ts`, `lib/caphub/registry/migrations/004_capture_automation.sql`, `scripts/caphub-automation-backfill.ts`, `scripts/caphub-automation-backfill.test.ts`.
**Modify:** `lib/caphub/registry/migrate.ts`, `migrate.test.ts`, `package.json`.

**Interfaces:** `normalizeCaptureFilename(input: string): string`; `FilenameHead = { filenameKey: string; captureId: string; digest: string; version: number }`. Backfill exposes `inspectAutomationBackfill(pool)` returning bounded conflict groups and canonical selections, and `applyAutomationBackfill(pool, resolutions)` with explicit expected group digests.

- [ ] Add failing normalization tests:

```ts
expect(normalizeCaptureFilename(' IMG_1194.PNG ')).toBe('img_1194.png');
expect(normalizeCaptureFilename('e\u0301.png')).toBe('é.png');
expect(() => normalizeCaptureFilename('../a.png')).toThrow();
```

- [ ] Define reserved names explicitly as `.` and `..`; reject slash, backslash, NUL, and control characters, enforce the existing filename length bound. Cover the complete rule in tests.
- [ ] Add real PostgreSQL migration tests for all four tables, foreign keys, unique filename/version and Capture/contract constraints, safe state constraints, and necessary app grants. Existing immutable-table guards must still pass.
- [ ] Add RED backfill fixtures with duplicate aliases, successful imported canonical Capture, legacy failures, and unresolved same-name/different-digest groups.
- [ ] Implement heads and versions with canonical Capture references and aliases; requests with state, owner token, lease expiry, job/request IDs and timestamps; retention rows for every Capture reference, including those not yet eligible. Register migration 004 and the retention audit event type.
- [ ] Backfill is idempotent and defaults to dry-run; do not enqueue historical Captures or invoke providers. Same-digest aliases inherit the canonical successful import's retention eligibility so duplicate legacy rows do not retain an object forever. Unresolved different-content groups stay blocked for intake.
- [ ] Run `npm test -- --run lib/caphub/automation/filename.test.ts lib/caphub/registry/migrate.test.ts scripts/caphub-automation-backfill.test.ts`; record RED and GREEN. Commit `feat(caphub): add capture automation registry schema`.

## Task 2: Filename-aware intake and conflict replay

**Create:** `lib/caphub/automation/intake.ts`, `lib/caphub/registry/postgres/capture-intake.ts`, `lib/caphub/automation/intake.behavior.test.ts`.
**Modify:** `lib/caphub/service/capture.ts`, `app/api/caphub/captures/route.ts`, `route-factory.ts`, `route.test.ts`.

**Interface:** `receiveAutomatedCapture(input: ReceiveCaptureInput & { expectedCurrentCaptureId?: string; expectedCurrentObjectDigest?: string }): Promise<{ kind: 'created' | 'duplicate'; capture: CaptureRecord }>`; conflict errors carry only existing Capture ID, original filename/date, and digest for the UI confirmation.

- [ ] Write RED tests through multipart route and real PostgreSQL intake for two uploads with different idempotency keys but equal normalized filename/digest. Assert one canonical Capture and one object write.
- [ ] Test different bytes return HTTP 409 before object persistence; confirmed replay produces filename version 2; stale replay preserves version 2 and returns `FILENAME_CONFLICT_STALE`.
- [ ] Test concurrent same-content requests and concurrent confirmation against the same head. Assert one winner and stable retries, not merely callback counts.
- [ ] Hash validated bytes before object write. Serialize filename decisions and idempotency under a consistent lock order; atomically commit Capture, alias/idempotency binding, filename version/head, and raw-object reference. An object write followed by database failure remains recoverable on retry without inventing success.
- [ ] Retain strict original idempotency binding to input metadata. Store duplicate request aliases without changing the original immutable Capture's idempotency key. Cancellation creates no Capture/version/queue row.
- [ ] Replay confirmation fields in the existing multipart POST; preserve origin, upload-size, MIME, and response sanitization checks. Keep legacy safe-off/filesystem receive behavior intact when automation is unavailable.
- [ ] Run `npm test -- --run lib/caphub/automation/intake.behavior.test.ts app/api/caphub/captures/route.test.ts lib/caphub/service/capture.test.ts`; commit `feat(caphub): deduplicate uploads and confirm filename conflicts`.

## Task 3: Durable requests and worker execution

**Create:** `lib/caphub/registry/postgres/analysis-requests.ts`, `lib/caphub/automation/worker.ts`, `worker.behavior.test.ts`, `scripts/caphub-worker.ts`, `scripts/caphub-worker.test.ts`.
**Modify:** `lib/planning/config.ts`, its tests, `config/alljobs.example.json`, intake integration, `package.json`.

**Interfaces:**

```ts
type RequestState = 'queued' | 'running' | 'waiting_for_review' | 'needs_attention' | 'completed';
type AnalysisLease = { captureId: string; contract: 'caphub-analysis-v4'; ownerToken: string };
// ensureAnalysisRequest(captureId): creates only a missing V4 request.
// claimAnalysisRequest(ownerToken, now): AnalysisLease | null.
// heartbeat(lease, now): boolean; finish(lease, outcome): boolean.
// runAnalysisTick(dependencies, signal): Promise<'idle' | 'processed'>.
```

- [ ] RED: Capture persisted but enqueue fails; retry same upload repairs exactly one queue row. A completed V4 import maps to waiting/completed, never a new model run.
- [ ] RED: two database clients claim one request; only one workflow starts. Expired lease recovery and stale-owner finish are tested with an injected clock.
- [ ] Implement claim with `FOR UPDATE SKIP LOCKED`, unique Capture/contract, a 120-second lease renewed every 30 seconds, owner-token-checked updates, and idle polling every 2 seconds. Heartbeat loss aborts local execution; a replacement must not replay an operation whose started audit lacks a terminal outcome.
- [ ] Invoke existing `startAndImport`; preserve runner recovery semantics. If interrupted provider outcome is unknown, mark needs attention using existing `INTERRUPTED_PROVIDER_CALL`. If analysis succeeded but import/queue completion failed, retry the idempotent host import without provider calls.
- [ ] Add explicit `autoStart=false` config default. Enqueue only when enabled; queued work remains persistent when disabled. Do not catch up all historical images automatically.
- [ ] CLI supports `--once`, `--daemon`, and `--dry-run`; dry-run reads eligibility only and constructs no live provider calls. SIGTERM stops claiming and aborts active execution, preserving recoverable state.
- [ ] Run `npm test -- --run lib/caphub/automation/worker.behavior.test.ts scripts/caphub-worker.test.ts lib/caphub/service/production-workflow.test.ts lib/planning/config.test.ts`; confirm actual existing workflow test path before invoking. Commit `feat(caphub): execute durable automatic analysis requests`.

## Task 4: Retention scheduling and exact-object cleanup

**Create:** `lib/caphub/registry/postgres/object-retention.ts`, `lib/caphub/automation/retention.ts`, `retention.behavior.test.ts`.
**Modify:** `lib/caphub/registry/import-review-packet.ts`, `lib/caphub/storage/neon-s3.ts`, `neon-s3.test.ts`, worker CLI, config/tests.

**Interfaces:** `markImportedRetention(captureId, importedAt)`; `sweepRetention({ now, dryRun, limit: 25 })`; separate deletion port `deleteExactObject(ref: ObjectRef): Promise<void>`. Do not grant arbitrary bucket/prefix deletion through the capture upload port.

- [ ] RED tests at 30 days minus 1 ms, exact boundary, pending review with successful import, failed analysis, shared ineligible reference, repeat delete, S3 failure, and crash after S3 success before database receipt.
- [ ] Schedule eligibility from the original successful import; retries must not extend/reset the deadline. Insert eligibility in the import transaction or idempotently reconcile from its committed timestamp.
- [ ] Use a digest advisory lock shared by intake, analysis object acquisition, and retention. Recheck all references while holding the lock through deletion and receipt commit. A missing retention row is ineligible, never permission to delete.
- [ ] Issue SDK `DeleteObjectCommand` for the validated exact digest key. Treat already absent objects as successful deletion; commit purge state and an idempotent audit event. Never delete metadata.
- [ ] Keep duplicate uploads after purge mapped to existing results without restoring bytes or scheduling another analysis. A different filename using expired shared bytes must store the newly uploaded bytes and register a fresh reference under the same digest lock.
- [ ] Default retention execution off; worker checks due cleanup independently once per hour, at most 25 digests per sweep. Failure records bounded error metadata and does not block analysis; development validates with fake S3 and real PostgreSQL.
- [ ] Run `npm test -- --run lib/caphub/automation/retention.behavior.test.ts lib/caphub/storage/neon-s3.test.ts lib/caphub/registry/import-review-packet.test.ts`; commit `feat(caphub): expire imported raw images after thirty days`.

## Task 5: Compact work-item and detail read models

**Create:** `lib/caphub/registry/work-items.ts`, `work-items.postgres.test.ts`, `review-workbench.ts`, `review-workbench.postgres.test.ts`.
**Modify:** `lib/caphub/registry/queries.ts`, `runtime.ts`, focused tests.

**Interfaces:** `getCaphubWorkItems({ limit: 25, cursor, filters })` returns filename, version, current Capture, status, waiting time, recommendation/value/risk, primary href and aggregate counts; `getCaphubReviewDetail(requestId)` returns summary, source/claim evidence, decision DTO, bounded technical/history DTO; `getCaphubCaptureStatus(captureId)` returns Capture/queue/stage/review/retention state.

- [ ] RED fixture: legacy V1/V2/V3 stops, V4 success, same-name duplicate Capture, and another file. Assert one row per current filename, V4 review priority, stable pagination and counts over the whole filtered result rather than the current page.
- [ ] Use a single parameterized SQL statement for queue rows and counts. Apply filename/current-job selection before filters/pagination; select bounded fields instead of full artifact JSON. Add only indexes justified by query plans.
- [ ] Detail loads only the requested item, using bounded SQL aggregation rather than query-per-evidence/history record. Derive the brief summary from existing parsed content; no model summarization call.
- [ ] Fix Capture latest-job selection deterministically: created time plus ID tie-breaker and supersession linkage; do not retain the current unordered `LIMIT 1` join across multiple jobs.
- [ ] Distinguish an unresolved legacy filename conflict from an unavailable Registry. History remains accessible by explicit ID; old decisions are not deleted or silently rewritten.
- [ ] Test query count, no object/provider reads, no private fields, malformed IDs, partial results, and terminal states. Configure finite pool connection acquisition/query timeouts so cold reads cannot hang beyond the specified failure budget.
- [ ] Run `npm test -- --run lib/caphub/registry/work-items.postgres.test.ts lib/caphub/registry/review-workbench.postgres.test.ts lib/caphub/registry/queries.test.ts lib/caphub/registry/runtime.test.ts`; commit `perf(caphub): add compact deduplicated review reads`.

## Task 6: Caphub routes, compatibility, and live status

**Create:** `app/caphub/reviews/page.tsx`, `loading.tsx`, `error.tsx`, `app/caphub/reviews/[id]/page.tsx`, `app/caphub/captures/[id]/page.tsx`, `app/api/caphub/captures/[id]/status/route.ts`, corresponding focused tests.
**Modify:** old review/capture pages, `components/planning/primary-nav.tsx`, `source-status.tsx`, Caphub navigation/decision links.

- [ ] RED: old URLs preserve recognized filters/request selection; new detail stays under Caphub and Caphub navigation is active. Invalid IDs show not-found without unsafe interpolation.
- [ ] Build server queue/detail pages consuming Task 5 interfaces. Queue never preloads the first dossier. Add a compact skeleton matching the eventual rows.
- [ ] Keep existing decision API and exact subject/version/lock confirmation contract; update links and post-decision refresh paths to Caphub routes.
- [ ] Implement metadata-only status endpoint with no-store, bounded safe errors, and no analysis side effects on GET.
- [ ] Add status client polling every 2 seconds while active, backing off to 10 seconds on read failures; stop on terminal state/unmount and announce transitions without duplicate announcements.
- [ ] Run focused route/navigation/status tests; commit `feat(caphub): own review routes and analysis status`.

## Task 7: Upload conflict UI and focused Review presentation

**Create:** `components/caphub/work-items.tsx`, `analysis-status.tsx`, `filename-conflict.tsx`, tests for each.
**Modify:** `capture-form.tsx`, `capture-status.tsx`, their tests, `reviews/review-center.tsx`, `review-dossier.tsx`, `decision-form.tsx`, their tests, `app/caphub/page.tsx`, relevant `app/globals.css` rules.

- [ ] RED interaction: upload duplicate returns existing work; different-content conflict retains the File, displays existing date/digests, and only explicit Create new version resubmits confirmation. Cancel produces no request.
- [ ] Replace P1-only prose with upload-and-analysis wording; show selected file, progress, result link, and raw retention date. Surface queue failure as saved-but-not-queued rather than encouraging a new upload key.
- [ ] Implement short heading “Reviews”, compact file rows, one action, collapsed filters unless active, and compact needs-attention entries. Preserve keyboard controls and focus after navigation/conflict resolution.
- [ ] Detail shows filename/status, recommendation/summary, key claims/source links, unresolved issues and Human decision action. Put IDs, full digest, diff, dimensions, critic and job history inside accessible collapsed details. Keep critical unresolved findings visible.
- [ ] Default approval disposition to the imported recommendation when valid, not the existing hardcoded `build`; retain exact typed confirmation and stale decision protections.
- [ ] Test actual visible content and actions at 390px and desktop; no giant placeholder, horizontal overflow, or repeated safety paragraphs. Add an accessible expired-image state that leaves derived information readable.
- [ ] Run only affected component tests and focused ESLint; commit `feat(caphub): streamline capture and review workbench`.

## Task 8: Reproducible behavior and performance acceptance

**Create:** `tests/e2e/caphub-automation.spec.ts`, `tests/e2e/caphub-automation-fixtures.ts`, `playwright.caphub-automation.config.ts`, `scripts/caphub-review-benchmark.ts`, benchmark tests.
**Modify:** `package.json`, `.agent/caphub/automatic-analysis-verification.md`.

- [ ] Establish an owned temporary fixture with real PostgreSQL, local test objects, fake provider HTTP edges, actual upload route, and actual worker. Use port 3472 on loopback after checking it is free; never attach to production fixtures.
- [ ] Exercise upload → durable queued row → worker → ReviewPacket import → visible Caphub review through the built application. Assert close/reopen page does not lose work, duplicate does not call provider again, conflict waits for Human, and old jobs only appear in expanded history.
- [ ] Verify leases with two worker instances in a targeted real-database test; external side effects remain fake. Prove retention does not delete ineligible shared data.
- [ ] Benchmark scripts parse a server-rendered useful-content marker and measure time to that marker, full completion and first byte. Record server-side Registry duration via safe timing metadata. Do not call a streamed shell “loaded”.
- [ ] Queue gate: one SQL query; 9/10 warm useful-content runs ≤2 seconds; every warm run ≤3 seconds. Detail: 9/10 ≤3 seconds. Cold connection ≤5 seconds or bounded unavailable response; shell ≤250 ms.
- [ ] Save actual timings and SQL plans; if network time prevents the gate, record it as failed/unverified and investigate before claiming performance acceptance. No public caching of private review content or weakening freshness checks.
- [ ] Build once for final E2E. Capture screenshots at 1440 and true CSS 390 for upload, conflict, active analysis, review queue/detail, loading, empty, error and expired image. Use the project CDP/Playwright conventions.
- [ ] Commit `test(caphub): verify automated capture to review journey`.

## Task 9: Worker deployment assets and operational commands

**Create:** `deploy/com.agentjoey.alljobs-caphub.plist`, `scripts/caphub-retention.ts`, associated tests.
**Modify:** deployment verifier/tests, `docs/deployment.md`, `docs/operations.md`, example config, production preflight, verification record.

- [ ] RED deployment tests: template has no secret literals, fixed private worker command and working directory placeholders, no network listener, no auto-enabled retention, and predictable private log locations.
- [ ] Add package commands `caphub:worker`, `caphub:automation-backfill`, `caphub:retention`, `caphub:benchmark`. Backfill and retention default to dry-run; mutation mode requires explicit CLI flags. Flags are operational safeguards, not additional per-task Human gates.
- [ ] Document copying existing credential references into a private mode-0600 worker configuration without logging values. Keep the planning refresh worker independent.
- [ ] Preflight reports migration level, unresolved filename conflicts, queue counts, worker readiness, autoStart/retention flags and exact retention targets; no provider invocation or deletion.
- [ ] Document one release/rollback procedure and interruption handling. Explain that successful source deletion cannot be undone from Registry metadata.
- [ ] Run focused scripts/config tests plus `npm run verify:deploy`; commit `chore(caphub): add automation worker operations`.

## Task 10: Scoped review, integration verification, and handoff

**Files:** verification record, `.agent/CURRENT.md`, `docs/ROADMAP.md`; corresponding Linear issue selected from existing roadmap ownership.

- [ ] Self-review the entire coherent diff against spec sections 4–13. Request one independent review covering transactions/leases, identity confirmation, migration/backfill, S3 deletion race protection and data exposure. Follow-up reviews inspect findings and fixes only.
- [ ] Run affected RED→GREEN checks after repairs. Then run `npm run typecheck`, focused ESLint, `npm run verify:deploy`, full `npm test`, and `npm run build` once at the final integration boundary.
- [ ] Reuse Task 8 final-build evidence if code/config/dependencies have not changed; otherwise rerun affected E2E and screenshots. Independently verify the user journey, rather than relying only on unit counts.
- [ ] Update CURRENT, ROADMAP and the existing Linear work item with local completion, exact commits, evidence and pending production gates. Do not mutate the retired BACKLOG file.
- [ ] Commit a handoff containing candidate SHA, build ID/hash, migrations, config values, worker installation steps, test evidence, performance results, screenshots and exact next action.
- [ ] Stop local development when acceptance is met. A failed independent review or performance gate is not local completion.

## Task 11: Authorized production rollout and closeout

This is the final operational step, not an implementation task requiring a fresh design. Prepare all commands and dry-run evidence before requesting any missing production authorization. Reuse explicit authorization if already granted for these exact operations.

- [x] Present the reviewed commit/build, additive migration/backfill targets, any conflicting existing filenames, worker/config changes, named canary Capture, and retention dry-run targets as one concrete release request.
- [x] After authorization, apply migration 004 and idempotent backfill. Resolve only Human-selected legacy content conflicts; do not choose a different-content head silently.
- [x] Deploy the reviewed app build with autoStart off, install worker disabled, verify redirects, queue and detail reads, and rerun production timing benchmark read-only.
- [x] Enable the authorized worker/autoStart scope and observe the production upload route → durable queue → V4 job → imported Review Request in Caphub. Authenticated browser verification covered the resulting Caphub UI; the automation file-chooser bridge could not address the local path, so the upload itself used the same production multipart Route Handler on loopback with the public origin header.
- [x] Reupload the identical canary through the production upload route; confirm canonical receipt and unchanged provider-call count. Differing-content confirmation remains covered by the final-build fixture rather than transferring another production image.
- [x] Activate retention after its exact-target dry-run and release authorization. The first sweep correctly found zero eligible objects; no artificial expiry was created.
- [x] Verify service health, loopback listener, worker execution, no repeated terminal stop, and performance budgets. Record the canary job/request, provider audit counts and screenshots.
- [x] Push/merge within explicit authorization. Keep the deployed worktree in place while its LaunchAgent references it. Record deployed code SHA separately from later docs-only commits.

## Acceptance mapping

| Spec requirement | Tasks |
|---|---|
| Caphub route hierarchy and redirects | 6–7 |
| Filename normalization, dedupe, Human conflict | 1–2, 7–8 |
| Durable queue, browser-close independence, recovery | 3, 8–9 |
| Current-file Review and analysis-stop history | 1, 5–7 |
| Query count and loading budgets | 5, 8, 11 |
| Short task-focused UI, responsive access | 7–8 |
| Thirty-day retention and shared-object protection | 1, 4, 8–9 |
| Migration, scoped review, exact-build rollout | 9–11 |

## Evidence and execution policy

Keep task checkboxes and commit/test evidence current. Ordinary task/phase boundaries do not require Human reconfirmation. Use inline execution by default under the established session preference; the independent reviewer does not edit implementation files. Stop only for a real missing consequential decision or authorization, and continue independent local work where possible.
