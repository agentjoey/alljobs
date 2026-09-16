# Caphub P4 Independent Verification Record

**Verifier:** independent (non-implementer, non-reviewer) · **Date:** 2026-09-17 · **Scope:** spec §15 acceptance criteria + §13 test strategy, static/recorded evidence only (suites not run, per instructions)

**Base:** `4b373dd` → **HEAD:** `53f11d7` · Branch `codex/caphub-p4-implementation` (local-only, no upstream)

## Verdict per criterion

**1. Exact-version, append-only, independently approved chains** — PASS (static)
Contracts, lineage `release→deployment_plan→deployment`, review kinds, single-consumption machinery delivered across `lib/caphub/registry/contracts.ts`, `lib/caphub/releases/`, `lib/caphub/deployments/plan.ts`; behavior tests `release-candidate.behavior.test.ts` (464 lines), `deployment.behavior.test.ts` (387 lines) exist.

**2. Deterministic, digest-bound packages/previews/projections** — PASS (static)
`packages/digest.test.ts`, `render.test.ts`, `diff.test.ts`, `projection/markers.test.ts`, `projection/render.test.ts`, `adapters/common.test.ts` cover shuffled-order stability and digest binding.

**3. Human region byte-for-byte; conflicts fail closed** — PASS (static)
`projection/markers.test.ts:111`, `render.test.ts`, `project.behavior.test.ts:148` (fresh-Vault rebuild, equal managed digest), conflict/foreign-file refusal tests in `filesystem.test.ts`.

**4. No unapproved/revoked/stale/consumed decision can write** — PASS (static)
`deployments/publisher.test.ts` (314 lines) + `recovery.test.ts` cover consumption-once, stale preimage/pointer, injected failures; plan creation rejects non-finalized releases (`plan.test.ts`).

**5. Publish/rollback idempotent, pointer-based, recoverable, history-retaining** — PASS (static)
`publisher.ts` (immutable `versions/`, atomic `current.json`), `recovery.ts`, rollback chain tests in `deployment.behavior.test.ts`.

**6. Browser read-only; no absolute roots/secrets** — PASS
`lib/caphub/exports/runtime.ts:96-111` `publicView()` returns only `{enabled, alias}` per target. `queries.ts:626-800` `getCapabilityExportState` maps target **alias**, digests, relative paths only. No `/Users/`, `CODEX_HOME`, `homedir` in `components/caphub/**` or `app/capabilities/**` (grep empty). Adapter logical labels (`~/.hermes/skills`, `.claude/skills`) are spec-mandated display labels (§8.2). Diff to `app/capabilities/[id]/page.tsx` adds no forms/actions.

**7. Config disabled by default, no real roots** — PASS
`config/alljobs.example.json:38-47` adds exports block with every switch false and **no root fields**; `lib/planning/config.ts:133-162` defaults all targets `{enabled:false}`, root optional + paired with alias, strict validation.

**8. Only sentinel-owned temp roots written by tests** — PASS
- `tests/helpers/caphub-postgres.ts:20` `ROOT_PREFIX = "/private/tmp/caphub-pg-"` with realpath prefix assertion (line 88)
- `projection/paths.test.ts:12`, `filesystem.test.ts:18`, `planner.test.ts:18`, `project.behavior.test.ts:27` — all `mkdtemp(join(tmpdir(), "caphub-*"))` after `realpath`
- `deployments/publisher.test.ts:30`, `deployment.behavior.test.ts:43`, `recovery.test.ts:10`, `exports/runtime.test.ts:11` — same pattern
- `tests/e2e/caphub-package-export-fixtures.ts:16,69,81` — `PREFIX = "alljobs-caphub-p4-e2e-"` with tmpdir containment assertion
- `$CODEX_HOME/skills` in `publisher.test.ts:184` is a path *inside* the temp version dir, not a real root.

**9. Evidence recorded** — **FAIL (gap)**
- `p4-implementation-log.md` contains only the Task 0 entry; status still "in progress"; no per-task entries, no final full-gate results (counts for `npm test`/`typecheck`/`lint`/`build`/`verify:deploy`/e2e).
- Plan Task 12 closeout not executed: no `docs(caphub): record p4 implementation evidence` commit (plan line 320); `p4-threat-model.md`, `p4-review.md`, `p4-verification.md` absent from `.agent/caphub/`; no `.agent/CURRENT.md`/roadmap/Linear update.
- No recorded scoped independent Review document (required before/at closeout).
- Mitigating: 12 narrow commits with planned messages for tasks 0–11; focused test files all exist per task; e2e suite + Playwright config + screenshots committed in `53f11d7`.

**10. Clean bounded branch, no push/merge/deploy/production mutation** — **FAIL (worktree dirty)**
- Branch: local-only, no upstream, not tagged (`git tag --contains 53f11d7` empty), no merge. ✓
- But `git status` shows **5 uncommitted modified test files** (`publisher.test.ts`, `deployment.behavior.test.ts`, `filesystem.test.ts`, `project.behavior.test.ts`, `caphub-package-export-fixtures.ts` — trivial `let`→`const` fixes) plus `.pact/seat`. Working tree ≠ recorded HEAD, violating the clean-tree requirement.

## Additional checks

- **Commit boundaries:** 12 commits, messages match plan lines 49/72/96/118/137/156/178/200/225/251/280/299 exactly; `git show --stat` confirms narrow per-task scopes. Task 12 commit missing (see criterion 9).
- **Migration checksums:** 001 = `d48b3392…5fa8`, 002 = `fa8fefde…16c7` — exact match with `p3-verification.md:26-27`; `003_exports.sql` present, manifest checksum `e9df0d79…22e4` matches actual file hash; 001/002 files untouched in diff.
- **Screenshots:** 3 PNGs at `.agent/caphub/p4-screenshots/`; verified visually — `capability-waiting-1440.png` (1440px) and `capability-deployed-390.png` (true 390×2283 device metrics) show Release candidate / Neutral package manifest / Adapter previews / Obsidian projection / Deployment plans / Deployment history sections, no absolute roots, no publish action, Paper Workbench styling. mtimes (07:07:08) precede final commit `53f11d7` (07:07:59) — consistent with capture-then-commit, but the README's "Build SHA: see p4-implementation-log.md final entry" dangles (no final entry exists).
- **Negative checks:** no push/PR/merge/tag/deploy; no provider/infra files in diff (`deploy` matches are only the in-scope `lib/caphub/deployments/*` fixture engines); no real Vault/Agent paths — the only `/Users/` strings are negative-test fixtures (`/Users/owner/secret.sh` etc.) proving rejection/redaction; P4-A/P4-B/P4-C mentioned only as "remain hard stops" (implementation log line 16), never approved.
- **Debug leftovers:** no TODO/FIXME/XXX in the diff; the single `console.log` (`scripts/caphub-cli.ts:12`) is an injected CLI logger, not debug residue.

## Conclusion

**PARTIAL PASS.** Code, configuration, migrations, commit boundaries, root-safety, and screenshot evidence satisfy criteria 1–8. Criteria 9 and 10 **fail on evidence/process grounds, not code grounds**: the Task 12 closeout was never performed (no final-gate evidence, no threat model/review/verification docs, log frozen at Task 0/"in progress") and the worktree is dirty against HEAD. Recommend: commit or revert the 5 pending test lint fixes, execute plan Task 12 (final full gate + closeout commit), then proceed to Codex acceptance. All findings are within-scope and reversible; no real-root, push, or gate violation was detected anywhere in the diff.
## Implementer closeout note (2026-09-17)

The two process findings were recorded while the closeout was still in flight:

- Criterion 9: `p4-implementation-log.md` now carries the full per-task log and final phase-gate
  counts; `p4-threat-model.md`, `p4-verification.md`, and `p4-review.md` exist; the
  `docs(caphub): record p4 implementation evidence` closeout commit `03b39ac` landed immediately after
  the review-fix commit `c3e1313`. `.agent/CURRENT.md` and the Caphub roadmap are updated in the same batch.
- Criterion 10: the five dirty test files were the in-flight `prefer-const` lint fixes; they
  are included in the closeout commit, after which `git status` shows only the untracked
  local `.pact/seat` binding (never committed).

Final gate on the closed tree: 150 files / 1335 tests PASS (clean env), typecheck PASS,
lint 0 errors / 82 warnings, production build PASS, `verify:deploy` PASS, P4 E2E 8/8 PASS.
