# Caphub P4 Independent Review Record

**Reviewer:** independent scoped agent (non-implementer) · **Date:** 2026-09-17
**Scope:** complete planning-base→HEAD diff — authorization, exact-version Registry semantics, path safety, transaction/recovery, deterministic output, scope exclusions, browser leakage, migration 003
**Verdict:** 0 blocker · 0 high · 7 medium · 8 low. All medium findings fixed in the review-fix commit; lows dispositioned below.

## Medium findings and resolution

1. **Apply-time revalidation incomplete (spec §9.2)** — publish never revalidated finalized Release authority, exact release digest, or adapter source digest.
   **Fixed:** `publishToTarget` accepts `assertAuthority` (called before any side effect); `scripts/caphub-publish.ts` wires full revalidation (release version/digest, finalized approval, adapter `source_digest`).
2. **Oldest-approval selection shadows valid re-approval** — `plan.ts` and the publish CLI picked the first matching approval, so approve → revoke → re-approve → finalize was wrongly rejected.
   **Fixed:** both now select the approval consumed by the Release record (falling back to the latest consumed match in the CLI).
3. **Plan identity excluded target state → re-plan collision** — `derivePlanRecordId` now includes `expected_current_pointer` and `target_preimage_digest`; publish → rollback → re-publish mints a new plan instead of `REGISTRY_DIGEST_CONFLICT`.
4. **Cross-call idempotency broken by wall-clock `created_at`** — `ReleaseService.createCandidate` and `DeploymentService.createPlan` now pre-check the derived record identity and return the already-recorded immutable version on retry.
5. **Recovery could not converge after a crash between pointer replacement and the completed operation record** — `publishToTarget` computes the result pointer up front, detects the already-applied state, skips stale revalidation, and completes the operation record deterministically. Regression test added (pointer-then-crash reconcile).
6. **Partial version directory wedged retries** — `writeVersionFiles` now resumes file-by-file: existing files are kept only when their bytes reproduce the planned digest; missing files are written; the marker is written last. Regression test added.
7. **Export CLI traversal read from a tampered pointer** — `activeFiles` validates `release_id`/`release_version` shape before any path join; invalid pointers yield an empty snapshot.

## Low findings disposition

- Fixed: duplicated CLI mains removed from `scripts/caphub-cli.ts`/`caphub-export.ts` (single source in `caphub-project.ts`/`caphub-publish.ts`); `permissions`/`license.spdx_id` gained the unsafe-text refinement; home-dir rejection now normalizes trailing slashes.
- Accepted/recorded: workspace-root guard depends on `process.cwd()` (sentinel + ownership checks still apply when launched elsewhere); store-level defense-in-depth note on export-store subject binding; service-layer enablement assertion left to callers (CLIs/page) for P4; version-dir marker match trusts the previously verified manifest (files are content-addressed).

## Re-verification after fixes

- `lib/caphub` + components + CLI suites: 78 files / 520 tests PASS.
- New regressions: pointer-crash reconcile + partial version resume (publisher 7/7).
- typecheck PASS; lint 0 errors / 81 warnings; production build PASS; P4 E2E 8/8 PASS on the rebuilt binary.
