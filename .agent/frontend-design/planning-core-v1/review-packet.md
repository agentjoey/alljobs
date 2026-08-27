# Planning Core V1 — Independent Review Packet

- **Tier**: T3 (Major Product Architecture Rebuild)
- **Brief Revision**: Revision 1 (Approved)
- **Mockup Revision**: Revision 3 (Approved by Human Owner)
- **Target Commit**: Verified candidate build
- **Branch/Worktree**: `feature/planning-core-v1` (`.worktrees/planning-core-v1`)

## Verified Quality Dimensions

1. **Information Architecture**: Pure Backlog and Task ledgers own dominant reading plane; Portfolio Personal Workbench surfaces ongoing work, KPIs, and attention items.
2. **Provenance & Custody**: Amber status bar clearly differentiates `REPO: GIT-MIRROR` (read-only hatched) from `NATIVE: CONTROL-HOST` (writable solid).
3. **Ergonomics & Interactions**: Backlog drawers provide one-click expansion for phase binding, definition of done, and inline task creation. Universal search (`⌘K`) enables instant navigation.
4. **Resilience & Safety**: Zero network calls during page rendering; all Git operations through bounded background worker with disabled repository hooks (`-c core.hooksPath=/dev/null`); digest protection prevents stale overwrite.
5. **Human Gates**: Two-phase inspect -> review proposal digest -> explicit confirmation for all consequential lifecycle mutations (registration, archive, restore).

## Verification Evidence

- All 52 automated tests in Vitest pass (100%).
- Production compilation with Next.js 16.3 Turbopack succeeds.
- Accessibility audits with Axe confirm 0 violations.
