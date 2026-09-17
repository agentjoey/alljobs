# Caphub P4 Codex Acceptance Fix Handoff

Use this prompt with KimiCode (`k3-256k`) in the existing isolated worktree.

---

Continue Caphub P4 on the existing implementation branch and fix the Codex acceptance findings. Do not restart P4, redesign the approved scope, or perform unrelated refactors.

## Identity and working boundary

- Repository: `/Users/xtation/AgentWorks/GPT_Workspace/alljobs`
- Worktree: `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/caphub-p4-implementation`
- Branch: `codex/caphub-p4-implementation`
- Reviewed commit: `3b167b3dee9fdb74e53e1997701dedac99cabdda`
- Planning base: `4b373dd91c365594283038f083d37a01488ec515`
- Linear issue: `AGE-253`, currently In Progress
- `.pact/seat` is a tracked local seat-binding modification. Preserve it and never stage, restore, overwrite, or commit it.
- Do not touch the main checkout or any Human-owned dirty/untracked files.
- The retired `frontend-design-workflow` does not apply.

Read the approved P4 spec, development plan, current implementation evidence, and this acceptance handoff before editing:

- `docs/superpowers/specs/2026-09-16-caphub-obsidian-package-export-design.md`
- `docs/superpowers/plans/2026-09-16-caphub-obsidian-package-export.md`
- `.agent/caphub/p4-implementation-log.md`
- `.agent/caphub/p4-review.md`
- `.agent/caphub/p4-verification.md`
- `.agent/caphub/p4-codex-acceptance-fix-handoff.md`

## Acceptance outcome

Codex acceptance at `3b167b3` is **changes requested**. P4-A, P4-B, and P4-C remain closed. Do not claim acceptance, production readiness, or recommend a Human gate until Codex reaccepts the final fix commit.

The existing implementation has useful passing coverage, but the following boundary failures must be corrected.

## Required fixes, in order

### 1. Block forged-pointer publish bypass

`lib/caphub/deployments/publisher.ts` currently derives `alreadyApplied` from an untrusted `current.json`. A forged pointer matching deployment/release identity skips `revalidate`, skips `assertAuthority`, skips version materialization, then still calls `realizeDeployment`, writes a completed operation, and returns success.

Required behavior:

- Never infer a completed/idempotent publish from `current.json` alone.
- Idempotent success must require a validated completed operation for the exact plan/deployment plus a valid pointer and fully verified durable version contents.
- A pointer without the required operation/version state must fail closed before Registry mutation, pointer replacement, approval consumption, or any target write.
- Parse and validate target-controlled JSON instead of casting it directly to trusted types.

Add a regression test reproducing the exact forged-pointer case. It must prove:

- authority revalidation is not skipped;
- `realizeDeployment` is not called;
- no operation is marked completed;
- no pointer or version file is written;
- the result is a deterministic fail-closed P4 error.

### 2. Make spec section 9.2 apply-time revalidation complete and mandatory

`assertAuthority` must not remain an optional callback. Immediately before the first side effect, revalidate every approved authority/digest required by the spec, including:

- exports and exact target remain enabled;
- exact finalized Release authority;
- exact approved and unconsumed Deployment decision;
- Registry version/digests;
- adapter name, version, and source/output digest;
- preview manifest and `preview_diff_digest` reproduction;
- target sentinel, `target_preimage_digest`, and expected current pointer;
- no new symlink or unsafe path.

Any mismatch must fail before filesystem writes, Registry mutation, decision consumption, or pointer change.

Add focused RED-to-GREEN tests for changed target bytes with an unchanged pointer, changed preview diff, changed adapter identity/version, and an omitted/missing authority checker.

### 3. Verify existing immutable version bytes

`writeVersionFiles` currently trusts `.caphub-version.json` when its manifest digest and action match. Treat the marker and directory as untrusted target state.

Before returning `existing`, verify the exact expected file set, paths, byte counts, and SHA-256 digests. Missing, changed, unexpected managed files, symlinks, or unsafe descendants must fail closed. Do not silently repair or overwrite conflicting existing version content.

Add tests for tampered content, missing content, marker-only directories, unexpected managed files, and symlink substitution.

### 4. Preserve the single-writer invariant during recovery

`reconcileDeployment` and `reconcileProjection` must not unconditionally remove a lock that may belong to a live process.

Introduce a deterministic owner/lease/staleness contract or another safe recovery-lock mechanism. Recovery may take over only when it can prove the old lock is stale and belongs to the interrupted operation. A live or unknown lock must return `PUBLISH_RECOVERY_REQUIRED` without deleting it.

Add focused concurrency/recovery tests for live lock refusal and proven-stale takeover.

### 5. Complete durability requirements

The spec requires same-directory exclusive temporary files, file `fsync`, and atomic rename. Apply this consistently to:

- `current.json`;
- operation records;
- version marker files;
- any recovery records changed by this fix.

Directory durability may remain best-effort only where the approved spec allows it; file durability before rename is mandatory. Add focused injected-failure tests where practical.

### 6. Correct dry-run active-file selection

`scripts/caphub-export.ts` currently walks the entire `versions/<release>/<version>` parent, which can mix multiple manifest directories. Bind the active pointer/operation to the exact active manifest digest and read only that directory.

Normalize base and next files to the same logical adapter paths so the reviewed diff is meaningful and reproducible. Add a regression fixture containing two manifests for one Release version and prove only the active manifest participates.

### 7. Remove contradictory whole-page lifecycle states

The capability page currently renders the old P3 Candidate-only content together with the P4 export panel. A deployed page can simultaneously say:

- `A Candidate is not a released capability`;
- `Candidate only`;
- `No Release`;
- `No Deployment or Usage`;
- and also `Deployed Release` with an active pointer.

Drive the header, recommendation, and lifecycle cards from one combined release/deployment display state. Preserve truthful Candidate-only copy only for the actual Candidate-only state.

Add a whole-page browser assertion for waiting, released-not-deployed, and deployed states. Each state must assert both required content and absence of contradictory content. Capture replacement final-build screenshots only after the final production build.

## Evidence corrections

Correct the handoff/evidence records while closing the fix batch:

- Base-to-reviewed-head history contains 14 commits, not 15.
- `.pact/seat` is tracked and locally modified, not untracked.
- The earlier independent verification did not verify final commit `3b167b3`; an independent verifier must evaluate the final fix commit rather than relying on an implementer closeout note.
- Reconcile the recorded lint warning count with the fresh final command output.

## Development and verification discipline

- Use TDD for each defect and BDD for filesystem/Registry/UI boundary behavior.
- Keep tests and review scoped to these findings; do not repeatedly run the full repository suite after every edit.
- Suggested sequence:
  1. Add focused failing regression tests for one finding.
  2. Implement the minimum safe fix.
  3. Run only the directly affected tests.
  4. Repeat for the next finding.
  5. At the final batch boundary, run the combined P4-focused suite once.
  6. Then run fresh `typecheck`, lint, build, deployment invariants, and the P4 E2E suite once.
  7. Run the full unit/component suite once at final closeout only.
- Do not perform repeated global reviews. After implementation, request one independent review scoped to this acceptance-fix diff and one independent verification scoped to final acceptance evidence. Reviewer and verifier must not edit implementation files.
- Fix all blocker/high findings and any medium finding listed above before re-handoff.

## Required final evidence

Return a concise handoff containing:

- final commit SHA and exact commit range from `3b167b3`;
- files changed and why;
- RED and GREEN commands/results for each regression group;
- combined focused test result;
- final full-suite result;
- typecheck, lint, build, deployment verification, and P4 E2E results;
- final-build screenshot paths and hashes;
- independent review outcome;
- independent verification outcome bound to the final SHA;
- `git diff --check` result;
- final `git status --short --branch`, explicitly explaining the preserved `.pact/seat` modification;
- confirmation that no real Vault/Agent root, provider, production database, deployment, service restart, push, PR, merge, tag, or release was used.

Update the existing P4 implementation log, review/verification evidence, `.agent/CURRENT.md`, and Caphub roadmap factually. Do not create duplicate Linear issues. Leave `AGE-253` In Progress for Codex acceptance; Codex will update its final state.

Create one or more narrow local commits for the fixes and evidence. Do not push, merge, deploy, publish, or enter any Human gate.

---

