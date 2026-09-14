# Architecture Baseline — AllJobs Planning Core V1

## Architectural Principles

1. **Federated Custody & Single Source of Truth**:
   - Code repositories own Roadmap planning in `docs/ROADMAP.md` and retain custody of any transition-period `docs/BACKLOG.md` bytes; Linear owns Backlog management.
   - Business initiatives own their planning in AllJobs-native storage (`data/roadmaps/`, `data/tasks/`).
   - Linear owns Backlog management. During the transition, AllJobs may ingest a repository's `docs/BACKLOG.md` only as read-only planning evidence; it cannot reorder, propose, regenerate, or write Backlog content.

2. **Projections & No Database**:
   - External projections are computed by a safe background Git runner (`-c core.hooksPath=/dev/null`) synchronizing local bare mirrors.
   - Route views read native Markdown and cached mirror projections in-memory without secondary database persistence.

3. **Concurrency & Digest Protection**:
   - Native storage uses exclusive `.lock` files and SHA-256 Expected Digests to prevent stale writes (`STALE_WRITE`).
   - Append-only activity ledger (`data/log/activity.jsonl`) logs all project and task mutations.

4. **Human Gated Consequential Lifecycle**:
   - Registration, archive, and restore require two-phase inspect -> review proposal digest -> explicit confirmation.

## Retired R1 Backlog Control

- **Current ownership:** Linear is the only Backlog management system. AllJobs may display repository Backlog document health, provenance, diagnostics, counts, citations, and assistant context as read-only evidence during the transition.
- **No mutation surface:** AllJobs has no Backlog tab, ordering editor, proposal/apply flow, conversion command, assistant Backlog candidate, or repository-agent Backlog handoff. Repository Backlog bytes remain project-owned.
- **Projection boundary:** a validated Control Host working tree may be projected before its remote or cached fallback, but every Backlog projection is read-only. Missing, malformed, unsafe, or unavailable documents remain explicit evidence states and never enable a write path.
- **Retired evidence:** the former R1 behavior remains available only as historical evidence in the [R1 design](superpowers/specs/2026-08-29-alljobs-r1-backlog-control-design.md), [R1 implementation plan](superpowers/plans/2026-08-29-alljobs-r1-backlog-control.md), and [R1 frontend verification](../.agent/frontend-design/r1-backlog-control/verification.md). These records do not describe current capabilities.
- **Rollback:** revert the P0 retirement commits with Git in reverse order and re-run their verification gates. Never regenerate, rewrite, or otherwise mutate a project-owned `docs/BACKLOG.md` as part of rollback.
