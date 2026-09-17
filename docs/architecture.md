# Architecture Baseline — AllJobs Planning Core V1

## Architectural Principles

1. **Federated Custody & Single Source of Truth**:
   - Code repositories own Roadmap planning in `docs/ROADMAP.md` and retain custody of any transition-period `docs/BACKLOG.md` bytes; Linear owns Backlog management.
   - Business initiatives own their planning in AllJobs-native storage (`data/roadmaps/`, `data/tasks/`).
   - Linear owns Backlog management. During the transition, AllJobs may ingest a repository's `docs/BACKLOG.md` only as read-only planning evidence; it cannot reorder, propose, regenerate, or write Backlog content.

2. **Planning projections & bounded database use**:
   - External projections are computed by a safe background Git runner (`-c core.hooksPath=/dev/null`) synchronizing local bare mirrors.
   - Planning route views read native Markdown and cached mirror projections in-memory without secondary database persistence.
   - Caphub has a separate, disabled-by-default PostgreSQL Registry for versioned capability metadata; it never becomes the source of truth for Planning Core documents.

3. **Concurrency & Digest Protection**:
   - Native storage uses exclusive `.lock` files and SHA-256 Expected Digests to prevent stale writes (`STALE_WRITE`).
   - Append-only activity ledger (`data/log/activity.jsonl`) logs all project and task mutations.

4. **Human Gated Consequential Lifecycle**:
   - Registration, archive, and restore require two-phase inspect -> review proposal digest -> explicit confirmation.

## Caphub P1 Adapter and Custody Boundary

Caphub P1 adds a bounded intake adapter without changing Planning Core's
federated custody model. The browser POST passes strict image and context input
to a platform-neutral capture service. That service depends on `CaptureStore`,
`CaptureObjectStore`, and `CaptureAuditLog` ports; the P1 adapters place strict
metadata, SHA-256-addressed immutable bytes, and monthly audit events only below
the derived `<ALLJOBS_HOME>/state/caphub` root. HTTP callers cannot choose a
path, and GET returns validated metadata rather than object bytes or storage
keys.

The detailed [Caphub P1 custody and operations guide](caphub-foundation.md)
defines the state tree, idempotency, backup/recovery unit, and rollback boundary.
A future metadata adapter must implement the existing port under a separately
approved migration; it does not alter object custody. P1 remains
disabled-by-default and stops every Capture at `received` with Human review
required. Record/index and audit serialization is process-local for the single
active Control Host process; it is not multi-writer coordination, and recovery
preserves and escalates interrupted pre-index state. P1 contains no analysis,
provider, approval, publication, installation, execution, or deployment
capability.

## Caphub P1–P4 local-first activation boundary

The approved initial Registry is PostgreSQL 17 on the single Control Host. It
accepts only a private Unix socket and separates `caphub_app` from
`caphub_migrator`; forward-only migrations are checksum-bound and append-only
evidence is protected by grants plus triggers. Filesystem Capture objects stay
in their existing immutable custody tree. A source-digest-bound importer copies
only Capture metadata and deterministic audit evidence into the Registry and
never removes or rewrites its source.

Analysis is operator-started. MiniMax M3 and Kimi `k3-256k` adapters are
server-only, bounded, tool-free, and non-retrying. ReviewPacket import produces
Human-reviewable Candidate records. Candidate approval may authorize Release
composition, but a distinct exact Release approval is required before
finalization. Neither approval authorizes publication.

P4 generates a neutral Capability Package and deterministic read-only adapter
previews. During the pilot the exports master may support those previews, but
all Obsidian/package/Codex/Claude/Hermes targets remain disabled and have no
configured root. Deployment plans, external writes, publish, install, rollback
writes, Git, code execution, and P5/P6 automation remain outside this boundary.

The code remains Neon-ready through standard PostgreSQL SQL, roles,
transactions, and connection configuration. Neon is not provisioned for the
initial pilot and is reviewed before P6 or earlier if RPO/PITR, multi-host,
growth, or operations burden requires it.

## Retired R1 Backlog Control

- **Current ownership:** Linear is the only Backlog management system. AllJobs may display repository Backlog document health, provenance, diagnostics, counts, citations, and assistant context as read-only evidence during the transition.
- **No mutation surface:** AllJobs has no Backlog tab, ordering editor, proposal/apply flow, conversion command, assistant Backlog candidate, or repository-agent Backlog handoff. Repository Backlog bytes remain project-owned.
- **Projection boundary:** a validated Control Host working tree may be projected before its remote or cached fallback, but every Backlog projection is read-only. Missing, malformed, unsafe, or unavailable documents remain explicit evidence states and never enable a write path.
- **Retired evidence:** the former R1 behavior remains available only as historical evidence in the [R1 design](superpowers/specs/2026-08-29-alljobs-r1-backlog-control-design.md), [R1 implementation plan](superpowers/plans/2026-08-29-alljobs-r1-backlog-control.md), and [R1 frontend verification](../.agent/frontend-design/r1-backlog-control/verification.md). These records do not describe current capabilities.
- **Rollback:** revert the P0 retirement commits with Git in reverse order and re-run their verification gates. Never regenerate, rewrite, or otherwise mutate a project-owned `docs/BACKLOG.md` as part of rollback.
