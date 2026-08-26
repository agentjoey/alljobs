# Current Status — alljobs

Version:        v0.1.0-retired (legacy build still serving until approved cutover)
Phase:          Planning Core V1 — specification
Phase Status:   Draft brief and executable plan ready for Human Owner approval
Last Updated:   2026-08-26 by Codex

## Current decision

The previously developed AllJobs product is non-authoritative and will be replaced as a greenfield build. Its routes, UI directions, Markdown schemas, sample data, tests, and product documentation are not migration inputs.

The existing production build remains online only to avoid service interruption while the replacement is designed and verified. No legacy product file or production data has been deleted in the specification phase.

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

The architecture baseline is approved. Brief revision 1 and its development plan are documentation outputs only; they do not authorize implementation, legacy-file deletion, external repository changes, deployment, or production mutation.

## Next safe action

Human Owner reviews and approves or revises Brief revision 1. After approval, execution begins at Task 0 of the development plan, creates a recoverable legacy tag and isolated worktree, then stops again at the required rendered Mockup Gate before retiring legacy tracked files.

## Release history

| Version | Date | Status | Summary |
|---|---|---|---|
| v0.1.0 | 2026-08-12 | Retired as product direction; still deployed temporarily | Legacy multi-project activity ledger; retained only as whole-release rollback until Planning Core cutover |
