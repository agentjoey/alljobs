# Product Backlog — AllJobs Planning Core

This file tracks owner gates only. The executable task sequence and acceptance checks live in `docs/superpowers/plans/2026-08-26-alljobs-federated-planning-core-rebuild.md`.

## P0 — blocked on Human Owner

- [x] Approve `.agent/frontend-design/planning-core-v1/brief.md` revision 1 — approved 2026-08-26.
- [x] Keep the retired application offline during the rebuild — decided 2026-08-26.
- [x] Remove the exact 147-path retired-product manifest while preserving Tunnel/domain/Access and rollback assets — completed 2026-08-26.
- [ ] After Task 1, approve the rendered T3 mockup revision.
- [ ] During pilots, name the real code project and approve creation of the business project.
- [ ] After independent review and verification, approve the final candidate commit and cutover.

## P1 — Planning Core V1

- [ ] Execute Tasks 0–14 of the approved development plan in an isolated worktree.
- [ ] Preserve the existing Tunnel, domain, Access policy, Control Host, `3456` port, and loopback binding.
- [ ] Keep the legacy build serving until the final cutover gate; retain `archive/v0.1.0-retired` for whole-release rollback.

## P2 — separate later brief

- [ ] Design and implement KPI/Measure manual observations after Planning Core V1 has real operational usage.
- [ ] Design connectors, formulas, credentials, ingestion, and reconciliation only under a separate architecture and Human Gate.
