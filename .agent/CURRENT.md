# Current Status — alljobs

Version:        v0.1.0-retired (release retained; application listener currently absent)
Phase:          Planning Core V1 — T3 pre-implementation
Phase Status:   Brief revision 1 approved; Task 0 has one open production-health decision
Last Updated:   2026-08-26 by Codex

## Current decision

The previously developed AllJobs product is non-authoritative and will be replaced as a greenfield build. Its routes, UI directions, Markdown schemas, sample data, tests, and product documentation are not migration inputs.

The legacy release remains recoverable while the replacement is designed and verified, but no application was listening on `127.0.0.1:3456` during initialization. No legacy product file or production data has been deleted.

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

The architecture baseline and Brief revision 1 are approved. The approval authorizes Task 0 and Task 1's non-production rendered mockup. Legacy-file deletion, production UI, external repository changes, deployment, and production mutation remain blocked until the rendered Mockup Gate is explicitly approved.

## Repository initialization

- Planning baseline commit: `6656480d1905e363d4f9ef3e745345f4d9be6406`;
- Legacy rollback tag: `archive/v0.1.0-retired`;
- Implementation branch: `feature/planning-core-v1`;
- Isolated worktree: `/Users/xtation/AgentWorks/GPT_Workspace/alljobs-planning-core-v1`;
- Baseline: 75/75 legacy tests passed and Next production build passed with the official webpack path;
- Default Turbopack build is blocked by the managed environment's internal socket restriction;
- no application was listening on `127.0.0.1:3456`, and initialization did not start or modify production services.

Full evidence and handoff: `.agent/frontend-design/planning-core-v1/handoff.md`.

## Next safe action

Human Owner decides whether to restore the retired application on `127.0.0.1:3456` during the rebuild or explicitly accept it remaining offline. After that Task 0 production-health gate is resolved, proceed to Task 1's non-production rendered mockup and stop again for approval before retiring legacy tracked files.

## Release history

| Version | Date | Status | Summary |
|---|---|---|---|
| v0.1.0 | 2026-08-12 | Retired as product direction; still deployed temporarily | Legacy multi-project activity ledger; retained only as whole-release rollback until Planning Core cutover |
