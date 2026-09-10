# R5 Application Monitoring — Pactify Task 0

**Required context:** Read `AGENTS.md`, the complete implementation plan at `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`, the approved design at `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`, and the approved UI brief at `.agent/frontend-design/r5-application-monitoring/brief.md` before editing. Obey the plan's Global Constraints and Shared Contracts. Use TDD/BDD, preserve the listed Human-owned dirty files, do not use production credentials or real provider mutations, and do not push/deploy/release.

### Task 0: Pass the independent design and execution-readiness gate

**Files:**

- Create: `.agent/frontend-design/r5-application-monitoring/independent-design-review.md`
- Modify: `.agent/frontend-design/r5-application-monitoring/handoff.md`
- Read: `.agent/frontend-design/r5-application-monitoring/brief.md`
- Read: `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`
- Read: `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`

- [ ] Inspect the approved brief, both mockups, design spec, this task graph, current domain/config/store/query/action/worker seams, and the Human dirty-file exclusion list.
- [ ] Write an evidence-backed review covering spec-to-task traceability, provider capability honesty, credential/probe boundaries, atomic publication/recovery, partial-cycle semantics, responsive state matrix, accessibility, rollback, and remaining Human Gates.
- [ ] Record one of `PASS` or `CHANGES_REQUIRED`. Findings use stable IDs `R5-DESIGN-###`, severity, evidence path, required correction, and verification method. Do not modify implementation code.
- [ ] Update the handoff review status and link to the review. If any blocking finding exists, finish with `CHANGES_REQUIRED`; Pactify must stop before Task 1 until the finding is corrected and re-reviewed.
- [ ] Verify no product source file changed:

```bash
git diff --name-only HEAD -- app components lib scripts tests config
```

Expected: no output.

- [ ] Commit only the two review documents:

```bash
git add .agent/frontend-design/r5-application-monitoring/independent-design-review.md .agent/frontend-design/r5-application-monitoring/handoff.md
git commit -m "docs(monitoring): pass independent design review"
```

**Acceptance:** Review is independently authored, all critical design surfaces are covered, verdict is `PASS`, and no product source changed.

---
