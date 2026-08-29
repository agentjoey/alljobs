# Code Project Planning Guide

In code projects, planning documents reside directly within the codebase repository:

- `docs/ROADMAP.md`: Contains sequential development Phases.
- `docs/BACKLOG.md`: Contains single-file implementation Backlog items.

## Authoring Rules

1. **Phases (`docs/ROADMAP.md`)**:
   - `kind`: Must be `phase`.
   - `order`: Must be an integer; unique across the roadmap.
   - `focus`: At most one active phase can have `focus: primary`.

2. **Backlog Items (`docs/BACKLOG.md`)**:
   - `work_mode`: `implementation` or `operations`.
   - `phase`: Required if `work_mode === "implementation"`. Must reference an existing phase ID in `docs/ROADMAP.md`.
   - `priority`: `P0`, `P1`, or `P2`; `rank` is an integer ordering value, unique within its `phase` + `priority` lane. Use `priority: P0` and `rank: 100` when that is the reviewed starting position.
   - `dependencies`: List of other Backlog Item IDs in the same repository. No cycles permitted.

3. **Ownership and ordering boundary**:
   - A validated local working tree takes precedence over mirror, remote commit, and cache projections. A present invalid local source remains visible and must not be silently replaced by older remote content.
   - AllJobs can directly write only `priority` and `rank` on existing Backlog items, after its explicit proposal and Human Gate. It cannot create items or alter titles, phases, dependencies, body text, or any other field.
   - AllJobs never runs automatic Git operations. A repository agent owns new or substantive Backlog items: it inspects current code and architecture, chooses the stable ID, verifies Phase and dependencies, edits `docs/BACKLOG.md`, validates the project, and reports its diff and commit.

4. **Publishing Workflow**:
   ```bash
   git add docs/ROADMAP.md docs/BACKLOG.md
   git commit -m "docs(planning): update roadmap and backlog"
   git push origin main
   ```
   The single AllJobs Control Host will refresh its bare mirror and display the changes automatically.
