# Caphub P4 Acceptance-Fix Independent Review Record

**Reviewer:** independent scoped agent (non-implementer) · **Date:** 2026-09-17
**Scope:** acceptance-fix diff `3b167b3..196110d` against `.agent/caphub/p4-codex-acceptance-fix-handoff.md`
**First-pass verdict:** 1 HIGH, 4 MEDIUM, 2 LOW — every HIGH/MEDIUM fixed in `196110d` and re-verified.

## First-pass findings and resolution

1. **HIGH — crash-convergence accepted `stage: "versioned"`**, letting a forged pointer + versioned operation complete without `realizeDeployment` (no deployment record, no approval consumption).
   **Fixed:** convergence requires `stage === "realized"` (publisher.ts); regression test proves a forged pointer with a versioned operation fails `STALE_DEPLOYMENT`, never calls `realizeDeployment`, and leaves the operation at `versioned` with no writes.
2. **MEDIUM — `preview_diff_digest` not reproduced; missing diff/adapter RED-GREEN tests.**
   **Fixed:** `createPublishAuthority` extracted as an exported, tested factory (scripts/caphub-publish.ts) that revalidates exports enablement, exact release version/digest, finalized release approval, adapter name/version/source digest, output manifest digest, and reproduces `preview_diff_digest` from the active manifest snapshot; publisher passes `ApplyEvidence` to the mandatory callback. Tests: diff mismatch, adapter version change, disabled exports all fail closed.
3. **MEDIUM — rollback idempotent replay permanently failed** (marker action `publish` vs rollback operation).
   **Fixed:** operation-anchored verification accepts only publish-created version directories (`marker.action === "publish"`); rollback replay regression test passes.
4. **MEDIUM — unvalidated `manifest_digest` joined into walked paths** in the exported dry-run helper.
   **Fixed:** `readOperation` now parses and strictly validates target-controlled operation JSON (ID formats, hex digests, enums); malformed records are unreadable rather than trusted.
5. **MEDIUM — "Candidate only" copy and history-derived `deployed` survived in release/deployed states.**
   **Fixed:** recommendation line is state-aware ("Release-bound" vs "Candidate only"); `deployed` derives from the active pointer naming this exact release (`activePointer.releaseId === release.recordId`), so a shared target pointer no longer mislabels unrelated capabilities. Component tests assert the absence of every contradictory string.
6. **LOW — lease temp name lacked randomness; crashed-run temp files wedge a version directory.**
   **Fixed:** lease temp names carry a random suffix. Leftover-temp wedging remains fail-closed by design (spec-aligned; no silent repair of target state) — recorded here as accepted behavior.
7. **LOW — `LockError` leaked from projection apply; unused-var lint drift; handoff doc trailing blank line.**
   **Fixed:** projection maps lock conflicts to `ProjectionApplyError`; unused imports removed (fresh lint: **0 errors / 79 warnings**). The trailing blank line lives in the Codex-authored handoff document, which is preserved verbatim.

## Re-verification after fixes

- `lib/caphub` + components + CLI suites: 84 files / 562 tests PASS (incl. new HIGH-1, rollback-replay, and authority-factory regressions).
- Production build PASS; P4 E2E **11/11 PASS** (whole-page assertions re-validated after the deployed-semantics correction).
- Full unit/component suite at closeout: **152 files / 1361 tests PASS**.
- `npm run typecheck` PASS; `npm run lint` 0 errors / 79 warnings; `npm run verify:deploy` PASS.
