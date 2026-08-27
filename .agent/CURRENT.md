# Current Status — alljobs

Version:        v1.0.0-candidate (Planning Core V1 implementation & verification complete)
Phase:          Planning Core V1 — Phase 04 / Pre-Release Pilot & Cutover (Task 14)
Phase Status:   Phases 01, 02, 03, and 04 (Tasks 0-13) COMPLETE (53 vitest + 6 Playwright/a11y tests pass, 100% PASS); Ready for Task 14 Owner Pilot & Live Cutover
Last Updated:   2026-08-28 by Antigravity

## Current decision

The previously developed AllJobs product was retired and replaced with the federated Planning Core V1 greenfield build. All legacy routes, UI directions, and sample data were removed.

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

## Repository & Verification Status

- Planning baseline commit: `6656480d1905e363d4f9ef3e745345f4d9be6406`;
- Legacy rollback tag: `archive/v0.1.0-retired`;
- Implementation branch: `feature/planning-core-v1`;
- Isolated worktree: `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/planning-core-v1`;
- Vitest suites: 53 tests passing across 19 test files (100% PASS);
- Playwright E2E & Axe accessibility audits: 6 tests passing (0 WCAG AA violations);
- Production build: Next.js 16.3 (Turbopack) passes with 0 errors;
- Deployment invariants (`verify:deploy`): 100% verified;
- Agent skill validator (`planning:skill:validate`): 100% verified.

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
- **Task 11 (Detail & Journeys)**: Vertical Roadmap timeline, Accordion Backlog Drawers, Universal Task Ledger, Native Task Form, 2-phase Registration & Restore flows.
- **Task 12 (E2E & Accessibility)**: Playwright E2E suites, Axe WCAG AA audits, Verification Record, Review Packet.
- **Task 13 (Deployment & Operations)**: LaunchAgents (`alljobs`, `alljobs-refresh`), deployment invariant verifier, operational recovery documentation.

## Next safe action

Execute Task 14: Human Owner Pilot validation walkthrough, candidate merge, and live service launch on Control Host.

## Release history

| Version | Date | Status | Summary |
|---|---|---|---|
| v0.1.0 | 2026-08-12 | Retired and offline | Legacy multi-project activity ledger; removed from the current tree and retained only by Git history plus `archive/v0.1.0-retired` |
| v1.0.0-candidate | 2026-08-28 | Implementation Complete & Verified | Greenfield rebuild of AllJobs Federated Planning Core with Paper Workbench UI, zero DB, safe Git mirrors, and digest protection |
