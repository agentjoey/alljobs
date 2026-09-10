# R5 Application Monitoring — Pactify Task 3

**Required context:** Read `AGENTS.md`, the complete implementation plan at `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`, the approved design at `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`, and the approved UI brief at `.agent/frontend-design/r5-application-monitoring/brief.md` before editing. Obey the plan's Global Constraints and Shared Contracts. Use TDD/BDD, preserve the listed Human-owned dirty files, do not use production credentials or real provider mutations, and do not push/deploy/release.

### Task 3: Build atomic current state, transition events, rollups, and retention

**Files:**

- Create: `lib/monitoring/store/paths.ts`
- Create: `lib/monitoring/store/store.ts`
- Create: `lib/monitoring/store/store.test.ts`
- Create: `lib/monitoring/store/events.ts`
- Create: `lib/monitoring/store/events.test.ts`
- Create: `lib/monitoring/store/rollups.ts`
- Create: `lib/monitoring/store/rollups.test.ts`
- Create: `lib/monitoring/store/retention.ts`
- Create: `lib/monitoring/store/retention.test.ts`

- [ ] Write failing tests in temporary `ALLJOBS_HOME` roots for full immutable generation writes, atomic index-last publication, active-plus-previous recovery, corrupt/unparseable index rejection, missing referenced snapshot rejection, partial-cycle snapshots, last-trustworthy-value preservation, and cleanup after the visibility boundary only.
- [ ] Implement explicit resolved paths matching the approved tree. Validate cycle, project, binding, month, and year names before joining paths. No cleanup accepts an arbitrary root, glob, unresolved environment variable, symlink escape, `~`, or `/`.
- [ ] Append only material transition events: attention, signal state, deployment identity, permission state, or quota band. Repeated identical failures update current attempt metadata without duplicate events.
- [ ] Implement hourly and daily `min/max/last/count` rollups only for numeric measures with identical metric/unit/period semantics. Preserve billing alignment; never combine unlike units or exact and operational-only series.
- [ ] Enforce 90 days hourly and 13 months daily/events. A retention error leaves data intact and returns a normalized issue.
- [ ] Add a recursive serialized-output assertion that rejects keys matching token, secret, authorization, header, raw, body, log, environment value, or source content contracts.
- [ ] Run RED then GREEN:

```bash
npm test -- lib/monitoring/store
npm run typecheck
```

- [ ] Commit:

```bash
git add lib/monitoring/store
git commit -m "feat(monitoring): publish atomic bounded history"
```

**Acceptance:** A torn/corrupt new cycle cannot erase the prior readable generation, transition dedupe is proven, retention is path-safe, and serialized artifacts contain normalized metadata only.

---
