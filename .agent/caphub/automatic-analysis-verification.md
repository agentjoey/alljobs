# Automatic analysis implementation evidence

- Started: 2026-09-18T14:28:45Z (22:28:45 Asia/Singapore).
- Base: 4cb8c6a; implementation branch: codex/caphub-automatic-analysis-impl.
- Development root: .worktrees/caphub-automatic-analysis. Production remains in .worktrees/caphub-release.
- Execution: inline. One scoped independent review at integration.
- Token accounting: use session token_count differences at the start/end timestamps; report input, cached input, output separately. Account usage percentages are not token counts.
- This header records the original local-development boundary. Production actions were pending at that point and were subsequently completed under the explicit release authorization documented below; local implementation tests still did not use production services.

## Production closeout — 2026-09-19

Task 11 is complete. The application and worker run from `.worktrees/caphub-release` at code SHA `766f8504b703dea86d0bd487aa607941a917aa79`; remote `main` was verified at that SHA before this evidence-only closeout. Neon migration 004 and the idempotent backfill were applied. Historical groups resolved without a different-content conflict: `img_1232.png` has two same-content members and canonical `cap_dee4da33699b446aab12c1f8ba993400`; `img_1194.png` has five same-content members and canonical `cap_379e2508ead34c349fcb303bcd39eff2`.

Private Control Host configuration enables automatic analysis, retention and exports. `com.agentjoey.alljobs` and `com.agentjoey.alljobs-caphub` are running. The Obsidian target is Vault `Caphub`, alias `3b0bc2e2318652e8`, at the approved iCloud Documents path; credentials and connection strings are deliberately absent from this record. The first enabled retention dry-run returned no eligible objects. The successful canary becomes eligible at `2026-10-18T17:00:50.358Z`.

Real-provider canary:

- Capture `cap_c347f87046c2409580633201ec5d6ba6`; job `job_2595efbdf952a6d90f4d349d8e13d707`; Review Request `rev_3425a9e3af96c3452aa6a4236691ff8a`; final state `waiting_for_review`.
- V4 produced six stage artifacts and the ReviewPacket. The audit contains seven `model.started` events across MiniMax and DeepSeek, including one bounded native correction; all final stages succeeded.
- A second same-filename/same-content upload returned `duplicate`, kept the same canonical Capture and Review Request, and left `model.started` at seven.
- The authenticated final UI was inspected in Chrome. The browser automation file-chooser bridge could not address the local canary path, so the image upload itself used the exact production multipart Route Handler on loopback with `Origin: https://alljobs.agentjoey.ai`; no operator analysis CLI substituted for the worker.

Production benchmark:

- Review detail: cold useful 4440 ms / complete 4445 ms; ten warm useful loads 1171–2443 ms. Cold ≤5 s and every warm ≤3 s.
- Queue: cold useful 801 ms; ten warm useful loads 390–1786 ms. Every warm ≤2 s.
- Shell first byte 7–16 ms.

Final screenshots: `automatic-analysis-screenshots/production-v6-review-1440.png` and `automatic-analysis-screenshots/production-v6-workbench-390.png`.

The earlier full-suite result at `1adfabf` was 196 files / 1653 tests PASS. Canary-driven fixes through `766f850` were each covered with focused RED→GREEN regression tests plus typecheck, lint and a fresh production build; the full suite was not rerun after those focused fixes. A later temporary-PostgreSQL fixture attempt was blocked by the host's exhausted SysV shared-memory slots, so it is not reported as a pass. The real production boundary and affected non-PostgreSQL regressions passed.

## Post-release read-only attestation — 2026-09-19

Recorded during the documentation reconciliation, using read-only inspection only (no service, configuration or data change):

- Deployed `.next/BUILD_ID` in `.worktrees/caphub-release`: `2SphQwG3WEBcTQVhB4U7I` (built 2026-09-19 00:55 +08). The earlier IDs in this file belong to local candidates.
- Control Host flags (booleans only): `caphub.enabled`, `registry.enabled`, `analysis.enabled`, `analysis.autoStart`, `retention.enabled`, `exports.enabled` and `exports.obsidian.enabled` are true. Codex/Claude/Hermes targets are absent, so they default to false.
- The Human Owner stated that export and Obsidian have not been verified. Gate P4-A is not passed. No dry-run diff, publish or rollback has been approved or performed.
- Installed `com.agentjoey.alljobs` and `com.agentjoey.alljobs-caphub` plists are mode 0600, `KeepAlive=true`, `RunAtLoad=true`, with `WorkingDirectory` `.worktrees/caphub-release`. All environment keys are non-empty.
  - Worker environment keys: `ALLJOBS_HOME`, `CAPHUB_DATABASE_URL`, four `CAPHUB_S3_*` keys, `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY`, `NODE_ENV`, `PATH`. No migrator credential.
  - App environment keys: the same set plus `CAPHUB_MIGRATION_DATABASE_URL`, without `ALLJOBS_HOME` or `NODE_ENV`. The migrator credential is therefore present in the web process; this is recorded as an optimisation item, not changed.
- Test evidence boundary: the full suite (196 files / 1653 tests) is recorded at `1adfabf` only. No full run is recorded at `766f850` or later.

## Checks

## Final local acceptance — supersedes intermediate pending notes below

Tasks 0–10 local work complete; Task 11 production work pending. Candidate `104c24d`; final build ID `SZseV0x9xcs4J4mrmKQXD`, BUILD_ID SHA-256 `b628be1d8d5e4957f7e1827ae9fc7bd08103f2afc20f7b998a8570f7b3e87efa`.

- Full Vitest run once: 196 files / 1649 tests, 1648 passed and one obsolete smoke expectation failed. Updated Registry custody/Caphub navigation expectation; affected smoke + decision tests 2 files / 12 PASS. Three later added regressions passed focused. No second full-suite run; do not describe this as one clean full run.
- Final importer + workbench focused checks: 8 nonlegacy tests PASS; legacy approved-import replay 1 selected PASS (6 skipped). Packet-scoped Registry IDs isolate new review authority while validated legacy replay retains its original request/APPROVED state. V4 model payload/schema unchanged.
- Final typecheck PASS. Full lint 0 errors / 79 existing warnings; later importer scoped lint PASS. Deployment checks and 11 ops tests PASS.
- Final production build PASS. `npm run test:e2e:caphub-automation`: one comprehensive flow PASS (11.6s test / 14.2s total), actual temporary PostgreSQL, local object storage, fake HTTP model edges, final built Next. Upload/close/reopen/worker completion/review/duplicate/no extra model call/conflict cancellation/new-version successful import/redirects/expiry/loading/unavailable verified.
- 18 final screenshots (9 states, desktop 1440/mobile 390) in `automatic-analysis-screenshots/`; queue, detail, conflict, failure rendering inspected. No horizontal overflow.
- `automatic-analysis-performance.json`: local cold useful 46ms, warm queue 2–4ms, detail 3–5ms. `automatic-analysis-query-plan.json` records actual EXPLAIN ANALYZE BUFFERS; one queue query and bounded detail queries. These are local fixtures, NOT production Neon measurements.
- Independent agent `automation_scoped_review`: initial two blockers repaired (active-review canonical priority and bounded/nonblocking retention); scoped re-review PASS. Additional importer identity/legacy approval preservation review PASS, no new blockers. No repeated global review.
- Linear AGE-252 appended with local completion and pending release; original P3 status preserved.

No production migration, private configuration write, worker install/start, reload, real provider request, object deletion, push or merge. `.pact/seat` remains deliberately unstaged. `docs/ROADMAP.md` is absent; existing Caphub roadmap is updated instead of creating another source of truth.

Task 0: isolated worktree created; npm ci succeeded; codex seat bound; origin/main is an ancestor. Existing Pact roster contains no automation feature; do not self-accept or mutate unrelated accepted features.
Old production queue SSR baseline from approved plan: 1.98–10.65 seconds. No production benchmark repeated during development.

## Task results

Tasks 6/7 implementation: Caphub owns queue/detail/status routes; old URLs redirect; status reads do not start analysis. New conflict flow retains the file, requires an exact-head confirmation, restores chooser focus on cancel, and repairs queue failures with the same idempotency key. Reviews omit the eager dossier and collapse technical/history content. Impeccable distill/craft guidance used for concise existing Paper Workbench UI, not the retired frontend workflow. Focused UI/navigation/status: 57 passed plus one intentionally updated obsolete-copy assertion; subsequent capture form 51 PASS; worker scheduling 1 PASS; typecheck and focused lint PASS. Final build visuals remain pending.

Scoped backend independent review by automation_scoped_review found two blockers: active Review canonical priority and unbounded serial retention. Both reproduced RED, then fixed. Actual PG canonical regression + S3 cancellation + capture form: 60 PASS. S3 deletion now aborts at 5s; hourly sweep runs separately while analysis continues; scheduling regression PASS. Reviewer follow-up is limited to these repairs. No production side effects.

Task 1 in progress: normalization/schema RED reproduced before implementation. Human conflict-resolution RED reproduced (missing resolver), then GREEN. Current focused checks: 6 files / 27 tests PASS; typecheck PASS; focused ESLint PASS. Real temporary PostgreSQL proves duplicate aliases, unresolved content conflicts, all-reference retention rows, rerun idempotence, and no historical enqueue. No production migration/backfill or provider calls.

Additional Task 1 verification: focused successful-import fixture PASS (1 selected, 5 unrelated skipped); duplicate aliases inherit original import + 30 days. Database checks prove unique requests, running lease constraint, invalid deadlines and missing Capture foreign keys are rejected. Follow-up typecheck and focused lint PASS. Final integration full tests/build remain unrun.

Task 2: intake missing-module RED and multipart conflict 500-vs-409 RED reproduced. Route/service/intake focused run: 3 files / 58 tests PASS; typecheck and focused lint PASS. Added real multipart→PostgreSQL and object-edge recovery coverage: 4 intake behavior tests PASS. Concurrent same-content requests create one object/Capture; different content requires current-ID/digest confirmation, with one winner for concurrent stale confirmation. Original metadata idempotency remains strict. SQL is kept with the small intake service rather than split into a pass-through repository file. Build/browser acceptance is deferred to the integrated Tasks 8/10 gate.

Task 3 implementation: durable V4 requests, 120s leases/30s heartbeat, global one-at-a-time claim across processes, stale owner rejection, retry repairing enqueue, CLI default dry-run, autoStart default off. Terminal analysis retrieval skips raw object acquisition (expired-object regression reproduced RED then GREEN). Focused run: 6 files / 65 tests PASS; typecheck and lint PASS. Remaining recovery acceptance uses existing production-workflow tests and Task 8 integrated harness; no real model calls made.

Task 4 implementation: import transaction sets the original +30-day deadline; digest locks coordinate intake/read/delete; exact S3 deletion is a separate port. Missing/shared ineligible references block deletion. Purge receipts preserve metadata; missing S3 objects succeed; failures and post-delete crash recover safely. Worker checks cleanup hourly (25-digest limit), independently of autoStart. Retention defaults off; CLI defaults dry-run. Focused retention/S3/import/config: 4 files / 60 PASS; CLI/runtime 3 files / 5 PASS; latest intake 6 PASS; typecheck and focused lint PASS. No real S3 deletion or production config change. Neon skill used for existing path-style SDK integration; no reprovisioning or region assumptions applied to the already-operational bucket.

Task 5 in progress: one SQL compact projection returns 29 filename rows from 30 Capture fixtures, 25+4 stable pages and whole-result counts. Query-count assertion PASS. Real imported fixture verifies active Review priority, canonical alias status, compact detail and no object-key disclosure (1 selected PASS). Existing queries/runtime regression: 30 PASS; typecheck PASS. Detail reuses existing authority DTO on one acquired connection plus bounded history, avoiding per-evidence queries. Production timing gate remains pending final build and authorized read-only benchmark.
