# Current Status — alljobs

Version:        v0.1.0-retired (release retained; application listener currently absent)
Phase:          Planning Core V1 — T3 pre-implementation
Phase Status:   Task 1 revision 3 Mockup Gate APPROVED by Human Owner (2026-08-27); Task 2 (Clean Application Foundation) in progress
Last Updated:   2026-08-27 by Antigravity

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

The architecture baseline and Brief revision 1 are approved. The Human Owner separately authorized and completed exact-manifest legacy cleanup. Task 1 Mockup Gate was explicitly APPROVED by the Human Owner on 2026-08-27. Authorization is now active for Task 2 (Clean Application Foundation).

## Repository initialization

- Planning baseline commit: `6656480d1905e363d4f9ef3e745345f4d9be6406`;
- Legacy rollback tag: `archive/v0.1.0-retired`;
- Implementation branch: `feature/planning-core-v1`;
- Isolated worktree: `/Users/xtation/AgentWorks/GPT_Workspace/alljobs/.worktrees/planning-core-v1`;
- Baseline: 75/75 legacy tests passed and Next production build passed with the official webpack path;
- Default Turbopack build is blocked by the managed environment's internal socket restriction;
- no application was listening on `127.0.0.1:3456`, and initialization did not start or modify production services.
- Human Owner explicitly accepted the retired application remaining offline during the rebuild.

Full evidence and handoff: `.agent/frontend-design/planning-core-v1/handoff.md`.

## Legacy cleanup

- Human Owner authorized cleanup and accepted the retired application remaining offline;
- exactly 147 tracked legacy paths were removed according to `docs/retired-v0.1-manifest.md`;
- old routes, actions, UI components, sample data, legacy parsers/tests, old product docs, sprint record, and old UI evidence are absent;
- Tunnel/domain/Access knowledge, deployment templates, Planning Core records, toolchain files, Git history, and rollback tag remain;
- no replacement runtime, route, product data, production UI, external repository change, deployment, or production mutation was created.

## Task 1 mockup status (Revision 3) — APPROVED

- **Human-selected visual world:** `Paper Workbench` / 纸面工作台 (pleurat.com-derived, 2026-08-27 decision);
- **Composition:** Pure Backlog and Task ledgers own the dominant reading plane; all atlas, star plots, and dot-grid relationship diagrams are removed;
- **Signature element:** The amber provenance status bar (`#status-strip`) binding route path, source custody, Git revision / document digest, and freshness state;
- **Custody notation:** External read-only sources use diagonal hatch pattern / dashed badge; AllJobs-native writable sources use solid ink / amber fills;
- **Colorway & typography:** Light cream paper field (`#F1EEE6` / `#FBF7E6`), deep ink (`#16140E`), General Sans + IBM Plex Mono;
- **Surfaces:** Standalone synthetic mockup covers Portfolio, Projects, Tasks, Code Project, Business Project, Register, and Archived;
- **Enhancements:** Projects cards grid, Backlog drawers, Header search, vertical Roadmap timeline, Personal Portfolio Workbench Dashboard;
- **Gate verdict:** Explicitly **APPROVED** by Human Owner on 2026-08-27 ("mockup gate 通过，进入下一步").

## Next safe action

Execute Task 2: Create the clean application foundation, minimal Next.js shell (`app/layout.tsx`, `app/page.tsx`, `app/globals.css`), install foundation dependencies, write foundation smoke test, update docs, and verify build/tests pass.

## Release history

| Version | Date | Status | Summary |
|---|---|---|---|
| v0.1.0 | 2026-08-12 | Retired and offline | Legacy multi-project activity ledger; removed from the current tree and retained only by Git history plus `archive/v0.1.0-retired` |
