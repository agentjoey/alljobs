# Business Project Planning Guide

Business projects are maintained directly within AllJobs on the single Control Host:

- `data/roadmaps/<slug>.md`: Milestones tracking business stages.
- `data/tasks/<slug>.md`: Operational and business tasks.

## Authoring Rules

1. **Milestones (`data/roadmaps/<slug>.md`)**:
   - `kind`: Must be `milestone`.
   - `order`: Must be unique across the roadmap.

2. **Tasks (`data/tasks/<slug>.md`)**:
   - May bind to `roadmap_item: <milestone-id>`.
   - Cannot bind to `backlog` (business projects reject Backlog).
   - If `status: blocked`, `blocked_reason` is required.
   - If `status: waiting`, `waiting_on` is recommended.

3. **Concurrency & Locking**:
   - All mutations on the Control Host use `withProjectLock` and check Expected Digest.
