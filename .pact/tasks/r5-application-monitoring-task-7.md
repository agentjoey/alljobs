# R5 Application Monitoring — Pactify Task 7

**Required context:** Read `AGENTS.md`, the complete implementation plan at `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`, the approved design at `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`, and the approved UI brief at `.agent/frontend-design/r5-application-monitoring/brief.md` before editing. Obey the plan's Global Constraints and Shared Contracts. Use TDD/BDD, preserve the listed Human-owned dirty files, do not use production credentials or real provider mutations, and do not push/deploy/release.

### Task 7: Expose cached queries, bounded refresh, and worker orchestration

**Files:**

- Create: `lib/monitoring/adapters/index.ts`
- Create: `lib/monitoring/queries/landing.ts`
- Create: `lib/monitoring/queries/landing.test.ts`
- Create: `lib/monitoring/queries/project.ts`
- Create: `lib/monitoring/queries/project.test.ts`
- Create: `app/actions/monitoring-refresh.ts`
- Create: `app/actions/monitoring-refresh.test.ts`
- Create: `scripts/monitoring-refresh.ts`
- Create: `scripts/monitoring-refresh.test.ts`
- Modify: `scripts/planning-refresh.ts`
- Modify: `package.json`

- [ ] Read the local Next 16.3 Server Actions, caching, revalidation, dynamic route, and route handler guides before editing.
- [ ] Write query tests proving index-first local reads only, schema rejection, corrupt-current recovery, disabled state, empty bindings, attention sort then Project name, queue exclusion of healthy Projects, single Project isolation, bounded recent evidence, and no bulk history or secrets in returned view models.
- [ ] Implement `getMonitoringLanding()` and `getMonitoringProject(slug)` as server-only/no-store local projection readers. The landing queue and ledger must derive from the same snapshots.
- [ ] Write action tests for same-origin enforcement, feature-disabled rejection, registered Project/binding-only selection, malformed/cross-origin/arbitrary provider inputs, global single-flight, backoff result, queued/current snapshot identity, and normalized safe errors. The action accepts `{ project: string; binding_id?: string }` only and revalidates monitoring paths after queueing.
- [ ] Implement a one-shot `scripts/monitoring-refresh.ts --once` path and integrate monitoring into `scripts/planning-refresh.ts` behind `monitoring.enabled`. Catch and report monitoring failures separately so they cannot fail Git planning refresh. Add `monitoring:refresh` package script.
- [ ] Add a deterministic fixture-mode adapter registry usable only when `NODE_ENV === "test"` and explicitly injected by tests; production resolution never accepts a browser-selected adapter.
- [ ] Run RED then GREEN:

```bash
npm test -- lib/monitoring/queries app/actions/monitoring-refresh.test.ts scripts/monitoring-refresh.test.ts lib/planning/providers/refresh.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add lib/monitoring/adapters/index.ts lib/monitoring/queries app/actions/monitoring-refresh.ts app/actions/monitoring-refresh.test.ts scripts/monitoring-refresh.ts scripts/monitoring-refresh.test.ts scripts/planning-refresh.ts package.json
git commit -m "feat(monitoring): serve and refresh cached projections"
```

**Acceptance:** Server rendering performs zero provider calls, manual refresh cannot widen authority, scheduled monitoring failure does not break planning refresh, and every view model is bounded and secret-free.

---
