# Current Status — alljobs

Version:        v0.1.0-retired (release retained; application listener currently absent)
Phase:          Planning Core V1 — T3 pre-implementation
Phase Status:   Phase 01 (Tasks 0-2), Phase 02 (Tasks 3-5), Phase 03 (Tasks 6-9) COMPLETE (49/49 tests pass); Phase 04 (Task 10: App Shell & Workbench) in progress
Last Updated:   2026-08-28 by Antigravity

## Current decision

The previously developed AllJobs product is non-authoritative and will be replaced as a greenfield build. Its routes, UI directions, Markdown schemas, sample data, tests, and product documentation are not migration inputs.

The legacy release remains recoverable only through Git history and `archive/v0.1.0-retired`. The retired service is offline, and its exact 147-path product manifest has been removed from the current tree.

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

The architecture baseline and Brief revision 1 are approved. The Human Owner separately authorized exact-manifest legacy cleanup. Task 1 Mockup Gate was explicitly APPROVED by the Human Owner on 2026-08-27. Phases 01, 02, and 03 (Tasks 0 through 9) are complete with 49/49 passing tests.

## Repository initialization

- Planning baseline commit: `6656480d1905e363d4f9ef3e745345f4d9be6406`;
- Legacy rollback tag: `archive/v0.1.0-retired`;
- Implementation branch: `feature/planning-core-v1`;
- Isolated worktree: `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/planning-core-v1`;
- Production build passes with Next.js 16.3 (Turbopack);
- Loopback security `-H 127.0.0.1` preserved.

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

## Next safe action

Execute Phase 04 / Task 10: Implement approved Paper Workbench App Shell, Universal Search (`⌘K`), Portfolio Workbench Dashboard, and Projects Card Grid.

## Release history

| Version | Date | Status | Summary |
|---|---|---|---|
| v0.1.0 | 2026-08-12 | Retired and offline | Legacy multi-project activity ledger; removed from the current tree and retained only by Git history plus `archive/v0.1.0-retired` |
