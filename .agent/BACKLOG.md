# Product Backlog — AllJobs Planning Core

This file tracks owner gates only. Executable task sequences and acceptance checks live in the approved plans under `docs/superpowers/plans/`.

## P0 — Planning Core V1 owner gates

- [x] Approve `.agent/frontend-design/planning-core-v1/brief.md` revision 1 — approved 2026-08-26.
- [x] Keep the retired application offline during the rebuild — decided 2026-08-26.
- [x] Remove the exact 147-path retired-product manifest while preserving Tunnel/domain/Access and rollback assets — completed 2026-08-26.
- [x] After Task 1, approve the rendered T3 mockup revision — approved 2026-08-27.
- [ ] During pilots, name the real code project and approve creation of the business project.
- [x] After independent review and verification, approve the final candidate commit and cutover — completed 2026-08-28.

## P0 — Backlog management retirement

- [x] Approve Human Gate P0-A deletion/retention boundary — approved 2026-09-14.
- [x] Execute Tasks 1–8 of `2026-09-14-alljobs-backlog-retirement.md` in an isolated worktree.
- [x] Pass independent Human Gate P0-B review with shared parsing/projection, Roadmap/Task, assistant, monitoring, loopback, and Cloudflare boundaries intact.
- [x] Approve Human Gate P0-C and release the verified candidate to `origin/main` and the Control Host — completed 2026-09-14.
- [x] Preserve every external project-owned Backlog; no project Backlog source was mutated by the retirement or release.

## P1 — Planning Core V1

- [x] Execute Tasks 0–14 of the approved development plan in an isolated worktree.
- [x] Preserve the existing Tunnel, domain, Access policy, Control Host, `3456` port, and loopback binding.
- [x] Keep the retired service offline and retain `archive/v0.1.0-retired` for whole-release rollback.

## P2 — separate later brief

- [ ] Design and implement KPI/Measure manual observations after Planning Core V1 has real operational usage.
- [ ] Design connectors, formulas, credentials, ingestion, and reconciliation only under a separate architecture and Human Gate.
