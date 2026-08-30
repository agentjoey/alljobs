# Architecture Baseline — AllJobs Planning Core V1

## Architectural Principles

1. **Federated Custody & Single Source of Truth**:
   - Code repositories own their development planning in fixed files: `docs/ROADMAP.md` and `docs/BACKLOG.md`.
   - Business initiatives own their planning in AllJobs-native storage (`data/roadmaps/`, `data/tasks/`).
   - R1 Backlog Control may change only `priority` and `rank` YAML scalars on an existing code-project Backlog Item. It never creates an item or changes its substantive content.

2. **Projections & No Database**:
   - External projections are computed by a safe background Git runner (`-c core.hooksPath=/dev/null`) synchronizing local bare mirrors.
   - Route views read native Markdown and cached mirror projections in-memory without secondary database persistence.

3. **Concurrency & Digest Protection**:
   - Native storage uses exclusive `.lock` files and SHA-256 Expected Digests to prevent stale writes (`STALE_WRITE`).
   - Append-only activity ledger (`data/log/activity.jsonl`) logs all project and task mutations.

4. **Human Gated Consequential Lifecycle**:
   - Registration, archive, and restore require two-phase inspect -> review proposal digest -> explicit confirmation.

## R1 Backlog Control

- **Source selection:** a validated registered Control Host working tree is authoritative, including its uncommitted `docs/BACKLOG.md` bytes. AllJobs falls back to the remote commit or cache only when the entire workspace is unavailable. A present-but-invalid local source remains visible, read-only, and never silently falls through.
- **Ordering:** Backlog read order is `Phase → Priority → Rank`; rank is a positive integer scoped to one Phase and priority lane. Initialization assigns `100`, `200`, and so on, while repairs or moves renumber only the affected lane when necessary. Markdown section order remains editorial.
- **Proposal and Apply:** the browser submits structured intent, not a path, Markdown, field name, or patch. The server derives fixed trusted paths, validates the document, displays a field-only proposal plus complete-file and proposal digests, then revalidates under an exclusive lock before an atomic replacement.
- **Write safety:** planning files must be regular files below the trusted root, never symlinks or conflict-marked/ambiguous/oversized documents. A stale digest, invalid source, unsafe path, or failed atomic replacement produces zero repository write. Preservation checks reject any byte change outside the affected `priority` and `rank` scalar ranges.
- **No Git side effects:** R1 does not commit, push, merge, fetch, execute project code, create backups, or start a coding agent. Activity records contain mutation metadata and digests only, never a Backlog body or secrets.
- **Recovery:** refresh the source and create a new proposal after a stale/locked/invalid result. To disable R1, roll back the AllJobs application to the prior read-only build; do not attempt to reverse an owner-confirmed repository edit automatically.
