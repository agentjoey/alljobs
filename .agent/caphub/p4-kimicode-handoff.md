# Caphub P4 KimiCode Implementation Handoff

Copy the prompt below into a new KimiCode implementation session. Use model `k3-256k` when the client permits model selection.

---

You are implementing Caphub P4 in the AllJobs repository.

Repository:

`/Users/xtation/AgentWorks/GPT_Workspace/alljobs`

Planning branch:

`codex/caphub-p4-spec-plan`

Required implementation branch:

`codex/caphub-p4-implementation`

Use a new isolated worktree, preferably:

`/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/caphub-p4-implementation`

Do not edit the main checkout or the production-serving `.worktrees/caphub-release` worktree. Do not stash, reset, restore, overwrite, move, stage, or delete any Human-owned dirty/untracked file.

Start by checking out the latest local commit on `codex/caphub-p4-spec-plan`, recording its exact SHA, and creating the required isolated implementation branch/worktree from that commit. If the branch/worktree already exists, inspect it and continue only if it is clean and contains no unknown work.

Use KimiCode model `k3-256k` if model selection is available.

Before editing code:

1. Follow `AGENTS.md` session startup in the isolated implementation worktree: run `git pull` only against the clean selected branch and read `.agent/CURRENT.md`.
2. Bind the required pact seat from `.pact/PROJECT.md` without changing another seat's worktree.
3. Read these files completely:
   - `docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`
   - `docs/superpowers/specs/2026-09-16-caphub-obsidian-package-export-design.md`
   - `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`
   - `docs/superpowers/plans/2026-09-16-caphub-obsidian-package-export.md`
   - `.agent/caphub/p3-threat-model.md`
   - `.agent/caphub/p3-verification.md`
   - `.agent/caphub/p4-kimicode-handoff.md`
4. Use `superpowers:executing-plans` and follow the P4 plan task-by-task in exact order. Use the repository's TDD skill for every feature/defect and BDD for every real boundary.

Implementation rules:

- The approved P4 spec and implementation plan are authoritative. Do not redesign the architecture or expand scope.
- The old frontend-design workflow has been retired for Caphub Task 7+ and must not be used. Reuse the existing Paper Workbench UI.
- Begin every task with focused failing tests, implement the minimum contract, make the focused tests pass, and create the plan's narrow local commit.
- Keep test/reviewer scope controlled: direct tests per task, one final phase-wide full gate, one scoped independent review, and one scoped independent verification. Do not run the full suite after every task and do not repeat global reviews for local fixes.
- Preserve the checksums and contents of Registry migrations 001 and 002. P4 database changes go only into forward migration 003.
- All export features and targets remain disabled by default. Real root paths must be absent from delivered configuration.
- Automated filesystem writes are allowed only in freshly created sentinel-owned temporary directories used by tests.
- Do not configure or touch a real Obsidian Vault, `$CODEX_HOME`, `.claude/skills`, `~/.hermes/skills`, package repository, production PostgreSQL, provider, or secret.
- Do not make model/provider calls from the application or probes during P4 implementation.
- Do not install or enable generated capabilities, execute generated commands, add executable/binary package content, or let application code run Git.
- Do not push, create/merge a PR, merge to `main`, tag, release, deploy, restart services, or switch traffic. Local scoped commits are required.
- Do not delete data/files, use destructive Git, or clean unrelated AllJobs legacy content.
- Keep P5/P6 out of scope. In particular, do not implement Kimi Builder, BuildProposal execution, ImplementationAsset, runtime routing, usage learning, or update watching.
- Do not expose absolute roots, secrets, environment values, SQL messages, or internal stack traces in browser/client data, logs, manifests, diffs, screenshots, or handoff records.

Hard stops—pause and report rather than proceeding:

1. Any real credential, secret, production storage/database account, or sensitive configuration is required.
2. Any real Vault/Agent/package root must be configured, read, dry-run, or written (Gate P4-A/P4-B/P4-C).
3. Any real provider call, production migration, service restart, deployment, traffic switch, public release, push, PR, merge, or tag is required.
4. Any deletion, Human-work overwrite, force operation, destructive Git, or hard-to-recover change is required.
5. The approved spec, roadmap, and plan materially conflict on architecture, security, or acceptance.
6. A test, scoped review, verification, dependency advisory, migration issue, or security finding cannot be resolved within the approved scope.
7. Completion would require OCR/model analysis, automatic approval, installation, code execution, shell, Git, deployment, or another capability outside P4.

At completion:

1. Run the plan's single final full gate and focused P4 browser suite exactly once on the final implementation state, unless a later cross-cutting fix legitimately invalidates it.
2. Capture the final-build P4 screenshots at 1440px and true 390px device metrics.
3. Obtain one independent P4-scoped Review and one independent P4-scoped Verification. Fix all blocker/high/medium findings, with targeted reruns/re-review.
4. Update `.agent/CURRENT.md`, the Caphub roadmap, P4 evidence documents, and the existing P4 Linear issue in one factual closeout batch. Do not create a duplicate Linear issue.
5. Make the final bounded local documentation/evidence commit.
6. Leave the implementation worktree clean and do not push or merge.
7. Return a complete Handoff Record for Codex acceptance containing:
   - planning base SHA, branch, worktree, final SHA, and ordered commits;
   - files and behavior delivered per plan task;
   - exact focused and final verification commands/results/counts;
   - independent Review/Verification identities, scope, findings, and resolution commits;
   - final screenshot paths and bound build SHA;
   - migration checksums and PostgreSQL fixture version;
   - proof that only sentinel-owned temporary roots were written;
   - configuration audit showing all exports/targets disabled and no real roots present;
   - Linear status/evidence;
   - unresolved low findings, if any;
   - explicit confirmation that no push/PR/merge/tag/release/deploy/provider/production action occurred;
   - remaining P4-A/P4-B/P4-C gates and the next safe action.

Do not claim P4 complete or production-ready. Report the branch as “ready for independent Codex acceptance”; Codex will verify it before any Human gate is proposed.
