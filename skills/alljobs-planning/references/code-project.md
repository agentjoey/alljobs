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
   - `dependencies`: List of other Backlog Item IDs in the same repository. No cycles permitted.

3. **Publishing Workflow**:
   ```bash
   git add docs/ROADMAP.md docs/BACKLOG.md
   git commit -m "docs(planning): update roadmap and backlog"
   git push origin main
   ```
   The single AllJobs Control Host will refresh its bare mirror and display the changes automatically.
