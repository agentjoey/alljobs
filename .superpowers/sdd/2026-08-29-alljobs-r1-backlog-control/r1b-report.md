# R1-B Proposal-Only Downgrade Report

## Start Card

- Workflow: 3.3
- Task: R1-B proposal-only downgrade for Backlog ordering
- Role: Primary implementation agent
- Tier / reason: T3 — removes a repository-write capability at the data-integrity boundary
- Canonical record: `.superpowers/sdd/2026-08-29-alljobs-r1-backlog-control/r1b-report.md`
- Branch / worktree: `codex/r1-backlog-control` / `.worktrees/r1-backlog-control`
- Mockup Gate: Skipped — approved safety downgrade reuses the existing review surface; no new page, layout, or visual direction
- Review path: focused action/component/E2E evidence, then independent review and verification outside this implementation session
- Human checkpoints: no pilot, merge, deploy, production, or Pact action; Human Owner retains release authority

## Scope

- Remove the direct Apply Server Action, client invocation, and post-Apply revalidation.
- Keep local-first Backlog reading and digest-bound proposal generation.
- Turn review into a copyable repository-agent / Human Owner application handoff.
- Prove the temporary Backlog and activity ledger remain unchanged.

## State matrix

- Editing: unchanged local-only ordering draft and discard path.
- Proposal loading: existing `Preparing review` disabled state retained.
- Proposal success: exact field review plus selectable/copyable application handoff.
- Proposal error / validation: existing recoverable error and read-only blockers retained.
- Clipboard success: announces `Application handoff copied to clipboard.`
- Clipboard unavailable: announces manual-selection recovery while the read-only textarea remains available.
- Permission / source boundary: remote and cached sources remain read-only; invalid local source remains authoritative and disabled.

## Implementation

- `app/actions/backlog.ts` exports proposal preparation only; Apply schemas, write import, revalidation, and Apply action are gone.
- `lib/planning/backlog/mutations.ts` no longer exports or contains a direct Apply primitive, atomic replacement, lock acquisition, or activity writing.
- The client editor has no Apply state, Apply invocation, success/write state, or router refresh.
- Review shows full project, HEAD, complete-file SHA-256, proposal SHA-256, visible field changes, and a copy-only handoff that explicitly says AllJobs did not write.
- The handoff remains selectable if Clipboard API access fails; desktop keyboard and 390px mobile copy routes remain available.

## RED evidence

- `npm test -- app/actions/backlog.test.ts components/planning/backlog-ordering.test.tsx` failed on the old implementation for the expected reasons: Apply Server Action still exported, `Confirm and apply` still rendered, and no copy handoff existed (3 failures).
- `npm test -- lib/planning/backlog/mutations.test.ts` failed because `applyBacklogOrderingChange` was still exported (1 expected failure).

## GREEN evidence

- Focused Vitest: 3 files, 22 tests passed.
- TypeScript: `npm run typecheck` passed.
- ESLint: exit 0 with 65 pre-existing warnings outside this R1-B diff and no errors.
- Production build: `npm run build` passed; the prior whole-project filesystem tracing warning disappeared after writer removal.
- Isolated production-build Playwright: 8 passed, 1 evidence-only test intentionally skipped. It verified local-first reads, clipboard contents, no Apply control, byte-identical temporary Backlog, unchanged Git HEAD/status, no activity entry, keyboard-only copy, 390px layout, and WCAG AA scans.
- Temporary final-build screenshots inspected: `/private/var/folders/t4/1s8y_4jj27ldxtjwp9cgz7j80000gn/T/alljobs-r1b-copy-only-1440.png` and `/private/var/folders/t4/1s8y_4jj27ldxtjwp9cgz7j80000gn/T/alljobs-r1b-copy-only-390.png`; no repository screenshots were changed.
- Impeccable detector ran once. Its nine advisory findings point to pre-existing `app/globals.css` lines 329–555; the R1-B styles begin after line 865 and introduced no detector finding.
- `git diff --check` passed.

## Remaining gates

- This implementation session did not perform independent Review/Verification, Human Owner walkthrough, pilot, merge, push, deployment, production checks, or Pact actions.
- Existing user-owned documentation, canonical frontend records, verification files, and final screenshots remain outside this commit.

## Commit

- Required message: `fix(planning): make r1 backlog proposals copy-only`
- The exact commit SHA is reported by the implementation-session handoff after commit creation.
