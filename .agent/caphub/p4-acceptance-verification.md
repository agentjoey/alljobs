# Caphub P4 Acceptance-Fix Independent Verification Record

**Verifier:** independent verification agent (non-implementer, non-reviewer) · **Date:** 2026-09-17
**Bound final SHA:** `1bda3ba` (`docs(caphub): record acceptance review evidence`) — confirmed HEAD at verification time.
**Scope:** acceptance-fix range `3b167b3..1bda3ba` against `.agent/caphub/p4-codex-acceptance-fix-handoff.md`. Suites not re-run per protocol; lint run fresh; everything else verified by direct inspection.

## Verdict: PASS (10/10 items)

1. **Commit range** — 6 commits from `3b167b3` (`5939156`, `728c1a7`, `4996f8b`, `628b553`, `196110d` narrow fixes + `1bda3ba` docs); no merges/tags.
2. **Fix→files→tests mapping** — all 7 handoff fixes have implementation + focused regression tests at the final SHA.
3. **Forged-pointer test** — deterministic `STALE_DEPLOYMENT`; authority invoked; `realizeDeployment` never called; no operation/pointer/version writes (`publisher.acceptance.test.ts:166-191`); idempotent replay re-anchored on completed operation + pointer + verified bytes; target JSON strictly parsed.
4. **Lease tests** — live-lock refusal preserves the lock; stale takeover only for the same operation (recovery/publisher/projection layers).
5. **Two-manifest dry-run fixture** — only the active manifest participates; adapter-relative paths.
6. **Whole-page E2E** — waiting / released-not-deployed / deployed each assert presence and absence of contradictions.
7. **Screenshots** — README hashes match on-disk files; capture times sit between the final code commit and the docs commit.
8. **Evidence corrections** — 14 commits base→3b167b3; `.pact/seat` tracked + preserved; fresh lint **0 errors / 79 warnings** matches the record.
9. **Negative checks** — no push/PR/merge/tag/deploy/provider/production roots; P4-A/B/C untouched; `.pact/seat` in no fix commit.
10. **No TODO/FIXME/debug leftovers** in the fix diff.

Review spot-checks at `196110d` all confirmed: HIGH convergence stage gate, `createPublishAuthority` (incl. preview-diff reproduction tests), rollback replay, `readOperation` validation, state-aware page copy with activePointer-scoped `deployed`, lease temp randomness, `LockError` mapping, lint hygiene.

Recorded gates (implementer/reviewer, suites not re-run): full suite **152 files / 1361 tests PASS**; P4 E2E **11/11 PASS**; typecheck/build/`verify:deploy` PASS; lint 0 errors / 79 warnings.

**Conclusion:** all 7 Codex acceptance findings are corrected at `1bda3ba` with focused regression tests and consistent evidence; verification-ready for Codex re-acceptance. No acceptance, production readiness, or Human gate is claimed. P4-A/P4-B/P4-C remain closed Human gates.
