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

## Final Codex verification rebind (2026-09-17)

**Verifier:** independent verification agent (non-implementer, non-reviewer)

**Final code SHA:** `d595e6443a2400b2602c70de0211c70503f85cba`

**Bound evidence SHA:** `20e2a7143a750aba06cbd3e2f508c03cd43f94cd`

The first final-verification pass correctly returned **FAIL** for one Important TOCTOU: the
`stage === "realized"` crash-convergence branch acquired the lease but did not repeat the fresh
root/sentinel validation before reading the pointer and writing the completed operation.

Commit `d595e64` moves the under-lock root/sentinel revalidation to the common post-lease path,
covering normal publish and realized recovery. Its focused regression mutates the sentinel from
the lease callback after preflight, proves the unfixed code completes incorrectly, and proves the
fixed code returns `UNSAFE_TARGET_ROOT` while the operation remains `realized`.

Fix-only re-verification result: **PASS**.

1. TOCTOU blocker resolved before pointer reads or completion writes.
2. Focused final result: **2 files / 27 tests PASS**.
3. Final recorded gate is consistent: **152 files / 1373 tests PASS**, typecheck PASS, lint 0 errors / 79 warnings, warning-free build, deploy invariants PASS, P4 E2E 11/11.
4. Final-build screenshot hashes match and capture times postdate `d595e64`.
5. `git diff --check` PASS; `.pact/seat` is the only dirty file and is absent from both code/evidence commits.
6. No real root/provider/production DB, push, merge, deployment, tag, release, or P4-A/P4-B/P4-C action occurred.

**Final conclusion:** P4 local implementation acceptance and independent Verification are PASS.
This does not authorize integration or any real-target Human gate.
