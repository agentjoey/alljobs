# R5 Application Monitoring — Pactify Task 8

**Required context:** Read `AGENTS.md`, the complete implementation plan at `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`, the approved design at `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`, and the approved UI brief at `.agent/frontend-design/r5-application-monitoring/brief.md` before editing. Obey the plan's Global Constraints and Shared Contracts. Use TDD/BDD, preserve the listed Human-owned dirty files, do not use production credentials or real provider mutations, and do not push/deploy/release.

verify: npm test -- components/monitoring/monitoring-ui.test.tsx tests/smoke/app-shell.test.tsx && npm run typecheck && npm run lint

### Task 8: Build the approved B+A monitoring workspace

**Files:**

- Create: `app/monitoring/page.tsx`
- Create: `app/monitoring/[project]/page.tsx`
- Create: `components/monitoring/monitoring-overview.tsx`
- Create: `components/monitoring/project-monitoring-detail.tsx`
- Create: `components/monitoring/monitoring-refresh-control.tsx`
- Create: `components/monitoring/monitoring-ui.test.tsx`
- Modify: `components/planning/primary-nav.tsx`
- Modify: `components/planning/app-shell.tsx`
- Modify: `app/globals.css`

- [ ] Read local Next route/dynamic-route docs and the approved brief/mockups. Run `$impeccable implement` reasoning against the approved hierarchy. Use the existing shadcn Button primitive; no new component dependency is required for semantic tables, details, status text, and links.
- [ ] Write failing component tests for scope/trust summary, attention-only queue, all-Project ledger, exact precedence order, healthy omission from queue, empty/disabled/loading-safe/partial/stale/backoff/auth/permission/unsupported/corrupt-cache states, Project → binding → signal drill-down, mixed successful deployment plus failed runtime, provider-console link, billing alignment labels, reason evidence, manual-refresh announcements, and secret absence.
- [ ] Implement `/monitoring` in this fixed order: cached-projection provenance strip; Projects/bindings/needs-attention/freshness summary; compact attention queue; complete Project ledger. Add `Monitoring` to primary navigation and return `EXTERNAL: CACHED PROJECTION` custody for monitoring paths.
- [ ] Implement `/monitoring/[project]` in this fixed order: Project attention and leading reason; provider-binding comparison; expanded signal matrix; recent normalized evidence and bounded deterministic interpretation. Never claim root cause.
- [ ] Match the approved Paper Workbench tokens and typography. On desktop use dense semantic tables. At 390px reflow rows into labeled blocks with state, provider/resource, reason, freshness, and action visible. Do not horizontally clip the data surface.
- [ ] Ensure status never depends on color alone, targets are at least 44px on coarse pointers, focus is visible, refresh has `aria-live` state, tables have headings/captions, expanded controls are keyboard operable, and reduced motion is respected.
- [ ] Run RED then GREEN plus condensed design checks:

```bash
npm test -- components/monitoring/monitoring-ui.test.tsx tests/smoke/app-shell.test.tsx
npm run typecheck
npm run lint
```

- [ ] Commit:

```bash
git add app/monitoring components/monitoring components/planning/primary-nav.tsx components/planning/app-shell.tsx app/globals.css
git commit -m "feat(monitoring): add project-first operations workspace"
```

**Acceptance:** The rendered information architecture matches approved B+A and Project → Binding → Signal mockups, the complete state matrix is understandable without color/hover, and narrow layouts retain every critical field.

---
