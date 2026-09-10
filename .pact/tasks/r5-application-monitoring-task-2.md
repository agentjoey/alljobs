# R5 Application Monitoring — Pactify Task 2

**Required context:** Read `AGENTS.md`, the complete implementation plan at `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`, the approved design at `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`, and the approved UI brief at `.agent/frontend-design/r5-application-monitoring/brief.md` before editing. Obey the plan's Global Constraints and Shared Contracts. Use TDD/BDD, preserve the listed Human-owned dirty files, do not use production credentials or real provider mutations, and do not push/deploy/release.

verify: npm test -- lib/monitoring/domain/attention.test.ts && npm run typecheck

### Task 2: Implement deterministic attention and freshness evaluation

**Files:**

- Create: `lib/monitoring/domain/attention.ts`
- Create: `lib/monitoring/domain/attention.test.ts`
- Create: `lib/monitoring/domain/fixtures.ts`

- [ ] Write table-driven failing tests for precedence `critical > warning > unknown > watch > healthy`, retention of every applicable reason, required versus optional signals, first collection, auth/permission invalidation, stale maximum-age expiry, delayed collection inside maximum age, known allowance bands at 75/90/100 percent, quota exhaustion with/without observed service impact, transient versus confirmed probe failure, deployment/runtime disagreement, platform incident optionality, and all four expected-runtime policies.
- [ ] Implement pure functions with an injected `now`; do not read the clock, filesystem, config, or network inside the evaluator.
- [ ] Give every reason a stable code, affected dimension, severity, human-safe summary, and evidence timestamp. The leading reason follows precedence then a stable reason-code sort.
- [ ] Never create a numeric composite score. Never treat missing, stale, unauthorized, malformed, or required unsupported data as healthy.
- [ ] Add reusable fixture builders for later adapter, store, query, and UI tests; builders emit only valid schema-version-1 objects.
- [ ] Run RED then GREEN:

```bash
npm test -- lib/monitoring/domain/attention.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add lib/monitoring/domain/attention.ts lib/monitoring/domain/attention.test.ts lib/monitoring/domain/fixtures.ts
git commit -m "feat(monitoring): evaluate explainable attention"
```

**Acceptance:** The complete decision table is deterministic, all reasons survive aggregation, and the five-state precedence exactly matches the approved spec.

---
