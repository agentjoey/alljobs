# Task 9 Security Fix Report

## Scope

- Workflow: Frontend Design Workflow 3.3
- Task: R1 Backlog Control Task 9 independent-review remediation
- Role: Primary fix agent with a separate read-only boundary re-review
- Tier: T3, because the change hardens a filesystem overwrite path
- Branch / worktree: `codex/r1-backlog-control` / `.worktrees/r1-backlog-control`
- Input review: `task-9-code-review.md`
- Mockup Gate: unchanged; the approved R1 mockup remains authoritative
- Release state: no pilot, real-project write, push, merge, deploy, Pact, or production action was performed

This round fixes only the four binding code-review findings. Existing Task 9 design records, verification records, and screenshots were not edited or staged.

## Findings and fixes

### P1 repository-configured executable

Commit `f4b7c36` makes local status inspection deny repository-defined execution paths and adds a malicious-repository regression that fails if the configured fsmonitor executable runs.

### P1 raw-byte digest and UTF-8 preservation

Commit `f4b7c36` hashes the original `Buffer`, performs fatal and round-trippable UTF-8 decoding, and rejects malformed UTF-8 with zero Backlog writes.

### P1 final stale/path identity race

The replacement writer now:

- holds no-follow handles for the resolved workspace, `docs` directory, Backlog, and temporary replacement;
- compares stable device/inode identities at the write boundary;
- reads complete raw-byte snapshots with before/after size, mtime, ctime, identity, and EOF checks;
- verifies the reviewed digest again after a deterministic final-read barrier;
- verifies the temporary inode and digest, and checks source/path/temp identities immediately before `rename`;
- unlinks a failed temporary replacement only while its recorded identity still matches.

The two RED tests originally allowed a successful overwrite. They now return `STALE_WRITE`: one edits Backlog after the final read, and one renames `docs` and installs a symlink before replacement. Both preserve the external/original Backlog targets.

A separate read-only re-review found no remaining concrete exploitable or tested gap. Standard Node does not expose dirfd-relative `openat` / `renameat` or filesystem compare-and-swap; the remaining adjacent syscall intervals require a native or platform-specific primitive and contain no awaited operation.

### P2 actual conflicting repair lane

Ordering analysis now carries each affected Phase/Priority lane and conflicting IDs into `BacklogControlState`. The editor renders an explicit repair action for each actual conflict lane, and the server-side ordering plan rejects a repair intent for any other lane. Component and browser-to-temporary-filesystem tests place the first active item in `phase-1 / P0` and the duplicate ranks in `phase-2 / P1`; only the latter lane is renumbered.

The UI change follows the existing approved component and visual language. Impeccable hardening guidance influenced the explicit action label and the integrated conflict/recovery coverage; it did not change layout or design direction.

## RED to GREEN evidence

- Race tests RED: both late-edit and `docs` symlink-swap cases returned `{ ok: true }` before the boundary writer change.
- Repair-lane unit/component RED: ordering analysis omitted conflict lanes and the UI exposed only the generic first-active-lane repair button.
- Wrong-lane server guard RED: an unrelated lane produced a valid repair plan.
- Focused GREEN: 3 files, 28 tests passed; TypeScript passed.
- Full Vitest: 37 files, 177 tests passed.
- TypeScript: passed with no errors.
- ESLint: exit 0, 64 pre-existing warnings, 0 errors.
- Webpack production build: passed.
- R1 Playwright: 9 passed, 1 opt-in evidence-capture test skipped; the new later-conflict-lane journey passed against an isolated temporary repository on `127.0.0.1:3465`.

## Final verification

The final verification commands are:

```bash
npm test
npm run typecheck
npm run lint
npm run build -- --webpack
npm run test:e2e:r1
git diff --check -- <scoped code/test/report paths>
```

No final screenshot was created or replaced in this remediation round. The opt-in evidence-capture test stayed skipped, matching the explicit no-screens scope; final release evidence remains a later Human/independent gate.
