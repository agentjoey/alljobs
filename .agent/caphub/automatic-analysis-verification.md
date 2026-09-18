# Automatic analysis implementation evidence

- Started: 2026-09-18T14:28:45Z (22:28:45 Asia/Singapore).
- Base: 4cb8c6a; implementation branch: codex/caphub-automatic-analysis-impl.
- Development root: .worktrees/caphub-automatic-analysis. Production remains in .worktrees/caphub-release.
- Execution: inline. One scoped independent review at integration.
- Token accounting: use session token_count differences at the start/end timestamps; report input, cached input, output separately. Account usage percentages are not token counts.
- Production actions pending exact release authorization: migration, worker configuration/start, reload, named real canary, retention activation. No implementation tests use production services.

## Checks

Task 0: isolated worktree created; npm ci succeeded; codex seat bound; origin/main is an ancestor. Existing Pact roster contains no automation feature; do not self-accept or mutate unrelated accepted features.
Old production queue SSR baseline from approved plan: 1.98–10.65 seconds. No production benchmark repeated during development.

## Task results

Task 1 in progress: normalization/schema RED reproduced before implementation. Human conflict-resolution RED reproduced (missing resolver), then GREEN. Current focused checks: 6 files / 27 tests PASS; typecheck PASS; focused ESLint PASS. Real temporary PostgreSQL proves duplicate aliases, unresolved content conflicts, all-reference retention rows, rerun idempotence, and no historical enqueue. No production migration/backfill or provider calls.

Additional Task 1 verification: focused successful-import fixture PASS (1 selected, 5 unrelated skipped); duplicate aliases inherit original import + 30 days. Database checks prove unique requests, running lease constraint, invalid deadlines and missing Capture foreign keys are rejected. Follow-up typecheck and focused lint PASS. Final integration full tests/build remain unrun.

Task 2: intake missing-module RED and multipart conflict 500-vs-409 RED reproduced. Route/service/intake focused run: 3 files / 58 tests PASS; typecheck and focused lint PASS. Added real multipart→PostgreSQL and object-edge recovery coverage: 4 intake behavior tests PASS. Concurrent same-content requests create one object/Capture; different content requires current-ID/digest confirmation, with one winner for concurrent stale confirmation. Original metadata idempotency remains strict. SQL is kept with the small intake service rather than split into a pass-through repository file. Build/browser acceptance is deferred to the integrated Tasks 8/10 gate.
