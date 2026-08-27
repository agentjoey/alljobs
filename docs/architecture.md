# Architecture Baseline — AllJobs Planning Core V1

## Architectural Principles

1. **Federated Custody & Single Source of Truth**:
   - Code repositories own their development planning in fixed files: `docs/ROADMAP.md` and `docs/BACKLOG.md`.
   - Business initiatives own their planning in AllJobs-native storage (`data/roadmaps/`, `data/tasks/`).
   - AllJobs never performs writebacks to code repositories.

2. **Projections & No Database**:
   - External projections are computed by a safe background Git runner (`-c core.hooksPath=/dev/null`) synchronizing local bare mirrors.
   - Route views read native Markdown and cached mirror projections in-memory without secondary database persistence.

3. **Concurrency & Digest Protection**:
   - Native storage uses exclusive `.lock` files and SHA-256 Expected Digests to prevent stale writes (`STALE_WRITE`).
   - Append-only activity ledger (`data/log/activity.jsonl`) logs all project and task mutations.

4. **Human Gated Consequential Lifecycle**:
   - Registration, archive, and restore require two-phase inspect -> review proposal digest -> explicit confirmation.
