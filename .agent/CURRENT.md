# Current Status — alljobs

Version:        v1.0.0 (Planning Core V1 live and healthy)
Phase:          Planning Core V1 — Live Production
Phase Status:   Tasks 0 through 14 COMPLETE; Live on Control Host (127.0.0.1:3456) & Cloudflare Tunnel
Last Updated:   2026-09-17 by Codex after local P4 implementation acceptance

## Current decision

The previously developed AllJobs product was retired and replaced with the federated Planning Core V1 greenfield build. All legacy routes, UI directions, and sample data were removed.

Linear now owns Backlog management. AllJobs retains repository Backlog only as read-only planning evidence and has no Backlog management, proposal, conversion, repair, or handoff path.

The legacy release remains recoverable only through Git history and `archive/v0.1.0-retired`.

## Preserved production assets

- Cloudflare Tunnel identity and credentials;
- `alljobs.agentjoey.ai` DNS route;
- Cloudflare Access application and allow policy;
- current development machine as the single Control Host;
- `127.0.0.1:3456` as the mandatory loopback-only origin boundary.

## Canonical planning documents

- Architecture baseline: `docs/superpowers/specs/2026-08-26-alljobs-federated-planning-core-design.md`
- T3 implementation spec / Brief revision 1: `.agent/frontend-design/planning-core-v1/brief.md`
- Development plan: `docs/superpowers/plans/2026-08-26-alljobs-federated-planning-core-rebuild.md`
- Mockup brief revision 3: `.agent/frontend-design/planning-core-v1/mockup-brief.md`
- Mockup review & evidence: `.agent/frontend-design/planning-core-v1/mockup-review.md`
- Verification record: `.agent/frontend-design/planning-core-v1/verification.md`
- Independent review packet: `.agent/frontend-design/planning-core-v1/review-packet.md`

## Live Services on Control Host

- **App Listener (`com.agentjoey.alljobs`)**: Running on `127.0.0.1:3456`
- **Refresh Worker (`com.agentjoey.alljobs-refresh`)**: Running bare mirror sync every 300s
- **Cloudflare Tunnel (`com.agentjoey.cloudflared`)**: Forwarding `alljobs.agentjoey.ai` → `http://localhost:3456` with Access OTP auth
- **Verification Evidence**: 68 Vitest files / 744 tests passing, 27 Playwright E2E tests passing with 1 conditional evidence capture skipped, Next.js 16.3 Turbopack production build verified, deployment safety invariants verified, loopback smoke 200, and Cloudflare Access entry 302.

## Completed Tasks Summary

- **Task 0 & 0A (Cleanup & Gate)**: 147 legacy files removed, rollback tag anchored, Brief revision 1 approved.
- **Task 1 (Mockup Gate)**: Paper Workbench revision 3 (pleurat aesthetic, amber status bar, Backlog drawers, vertical Roadmap timeline, Personal Workbench dashboard) APPROVED by Human Owner.
- **Task 2 (Clean Foundation)**: Next.js minimal semantic shell (`app/layout.tsx`, `app/page.tsx`, `app/globals.css`), documentation rebuild, smoke tests passing.
- **Task 3 (Canonical Domain & Relations)**: `lib/planning/domain/schemas.ts`, `relations.ts`, `errors.ts`, ProofIssue isolation, cycle detection.
- **Task 4 (Pure Markdown Parsers)**: `lib/planning/markdown/section-document.ts`, `roadmap.ts`, `backlog.ts`, `tasks.ts`, `render.ts`, test fixtures.
- **Task 5 (Atomic Native Storage)**: `lib/planning/native/store.ts`, `lock.ts`, `digest.ts`, `activity.ts`, `paths.ts`, `STALE_WRITE` protection.
- **Task 6 (Control Host Config & Git Refresh)**: `lib/planning/config.ts`, `providers/git-runner.ts`, `providers/git-markdown.ts`, `providers/refresh.ts`, `scripts/planning-refresh.ts`.
- **Task 7 (Registration, Archive, Restore Lifecycle)**: `lib/planning/registry/inspect.ts`, `apply.ts`, `archive.ts`, `restore.ts`, `proposal.ts`.
- **Task 8 (Projections & Typed Server Actions)**: `lib/planning/queries/portfolio.ts`, `project.ts`, `tasks.ts`, `attention.ts`, `app/actions/projects.ts`, `native-planning.ts`, `refresh.ts`.
- **Task 9 (Agent Skill)**: `skills/alljobs-planning/SKILL.md`, references, examples, and `planning:skill:validate`.
- **Task 10 (Shell & Overview)**: AppShell, Universal Search (`⌘K`), SourceStatus amber strip, Portfolio Personal Workbench, Project Card Grid.
- **Task 11 (Historical V1 Detail & Journeys)**: Vertical Roadmap timeline, former Backlog drawers retired by P0, Universal Task Ledger, Native Task Form, 2-phase Registration & Restore flows.
- **Task 12 (E2E & Accessibility)**: Playwright E2E suites, Axe WCAG AA audits, Verification Record, Review Packet.
- **Task 13 (Deployment & Operations)**: LaunchAgents (`alljobs`, `alljobs-refresh`), deployment invariant verifier, operational recovery documentation.
- **Task 14 (Release & Cutover)**: Merged to `main`, launchd services active, live domain verified.

## Caphub P4 (implementation accepted locally)

- **Branch / worktree:** `codex/caphub-p4-implementation` · `.worktrees/caphub-p4-implementation`
- **Scope:** Capability Package contracts, deterministic renderers, Obsidian projection with byte-preserved human regions, Codex/Claude/Hermes preview adapters, exact Deployment plans, fixture publish/rollback, disabled-by-default export runtime, safe CLIs, read-only P4 UI.
- **Status:** Codex final acceptance fixes complete through `7ae8402`: approved-manifest binding survives joint operation+marker forgery, exact Release/plan/Deployment authority is checked before the lease and again under lock, root/sentinel state is freshly validated, rollback bytes are verified, and marker-less unsafe directories fail closed. Final gate: 152 files / 1372 tests PASS; typecheck PASS; lint 0 errors / 79 warnings; warning-free production build; deploy invariants PASS; P4 E2E 11/11. One scoped final Review returned PASS after its 1 Critical/3 Important findings were fixed; final independent Verification is pending against the evidence commit.
- **Boundary:** no real Vault/Agent root, production database, provider call, push, merge, deploy, or release occurred. Gates P4-A/P4-B/P4-C remain open Human gates; local implementation acceptance does not authorize them.
- **Evidence:** `.agent/caphub/p4-implementation-log.md` · `p4-threat-model.md` · `p4-verification.md` · `p4-screenshots/`

## Next safe action

Keep `codex/caphub-p4-implementation` and its isolated worktree for Human integration. Any real P4 target configuration, dry run, adapter enablement, publish, or rollback requires the corresponding P4-A/P4-B/P4-C authorization.

## Caphub development status — 2026-09-16

- P1 Foundation is accepted; P2 fixture analysis is complete while live Kimi structured output remains unproven.
- P3 Review Center and PostgreSQL Registry implementation/fixture verification passed independent Review and Verification with zero blocker/high/medium findings, was merged to `main`, and was deployed at `bac60042064e258072f025d42ce2d6633ba21a43` with production Registry and Analysis disabled.
- Human separately authorized a Capture-only production trial. Capture is enabled on the Control Host; Analysis and Registry remain disabled, and the enablement verification did not create a Capture.
- Gate P3-D remains a hard stop for production PostgreSQL selection, credentials, backup/PITR, migration, or Registry/Analysis enablement.
- P4 design, plan, local implementation, Codex acceptance, and scoped Review are recorded on `codex/caphub-p4-implementation`; final independent Verification is pending and integration remains a separate Human decision.
- No real Vault/Agent root, dry run, publish, rollback, push, merge, deployment, or P4-A/P4-B/P4-C approval has occurred.

## P0 Backlog retirement (live)

- **Branch / worktree:** `codex/p0-backlog-retirement` · `.worktrees/p0-backlog-retirement`
- **Status:** R1 Backlog management is retired on `main` and live on the Control Host. Human Gates P0-A, P0-B, and P0-C are complete.
- **Current boundary:** Linear owns Backlog management. AllJobs may ingest repository Backlog only as read-only transition evidence for document health, provenance, diagnostics, counts, search, citations, assistant context, and Task references.
- **Retired surfaces:** no Backlog tab, ordering editor, proposal/apply path, conversion command, assistant Backlog candidate, repository-agent Backlog handoff, or R1 runner remains.
- **Historical evidence:** former R1 design, implementation, and frontend records remain in Git as retired evidence; they are not current instructions or release candidates.
- **Release boundary:** the app service was rebuilt and restarted without changing the refresh worker, Tunnel, Cloudflare Access, domain, or mandatory loopback binding. No external project-owned Backlog was mutated.

## Release history

| Version | Date | Status | Summary |
|---|---|---|---|
| v0.1.0 | 2026-08-12 | Retired and offline | Legacy multi-project activity ledger; removed from the current tree and retained only by Git history plus `archive/v0.1.0-retired` |
| v1.0.0 | 2026-08-28 | Live in Production | Greenfield rebuild of AllJobs Federated Planning Core with Paper Workbench UI, zero DB, safe Git bare mirrors, and digest protection |
| P0 retirement | 2026-09-14 | Live in Production | Removed R1 Backlog management and proposal paths; retained repository Backlog solely as read-only evidence under Linear ownership |
