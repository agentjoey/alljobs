# R5 Application Monitoring — Pactify Task 5

**Required context:** Read `AGENTS.md`, the complete implementation plan at `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`, the approved design at `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`, and the approved UI brief at `.agent/frontend-design/r5-application-monitoring/brief.md` before editing. Obey the plan's Global Constraints and Shared Contracts. Use TDD/BDD, preserve the listed Human-owned dirty files, do not use production credentials or real provider mutations, and do not push/deploy/release.

verify: npm test -- lib/monitoring/adapters/railway lib/monitoring/adapters/fly lib/monitoring/adapters/conformance.test.ts && npm run typecheck

### Task 5: Add Railway and Fly.io adapters

**Files:**

- Create: `lib/monitoring/adapters/railway/index.ts`
- Create: `lib/monitoring/adapters/railway/queries.ts`
- Create: `lib/monitoring/adapters/railway/index.test.ts`
- Create: `lib/monitoring/adapters/railway/fixtures/*.json`
- Create: `lib/monitoring/adapters/fly/index.ts`
- Create: `lib/monitoring/adapters/fly/index.test.ts`
- Create: `lib/monitoring/adapters/fly/fixtures/*.json`
- Modify: `lib/monitoring/adapters/conformance.test.ts`

- [ ] Before implementation, re-open Railway's official Public API/deployment/metrics references and Fly's official Machines/tokens references. Record URLs and an adapter compatibility date in code comments adjacent to fixed request documents, without copying secrets or live payloads.
- [ ] Write Railway fixture tests for successful/failed/building/sleeping deployments, malformed GraphQL data, GraphQL authorization errors returned with HTTP 200, HTTP 429 with retry metadata, CPU/memory/network metric series, missing optional metrics, and timestamps. Use exactly two static query documents: latest deployment and metrics. Reject documents containing `mutation` and never concatenate binding values into GraphQL text.
- [ ] Implement Railway requests only to `https://backboard.railway.com/graphql/v2`. Parse `<project>/<environment>/<service>` UUID locator, bind values as variables, use `Authorization: Bearer` for account/workspace tokens, enforce response-size/time limits, and normalize Railway's documented deployment states. Metrics expose operational-only CPU/memory/network measures; billing cost/allowance remains unavailable.
- [ ] Write Fly fixture tests for Machines states, health-check summaries when present, empty machine lists under each expected-runtime policy, machine allocation totals, malformed data, 401/403/429, and timestamps.
- [ ] Implement Fly request only as `GET https://api.machines.dev/v1/apps/{validated-app}/machines` with a Bearer token. Aggregate current machine count, running/degraded/unhealthy evidence, allocated vCPU and memory as `operational_only`; do not label allocation as billable consumption and do not call undocumented billing endpoints.
- [ ] Run both adapters through the common conformance harness and verify fixture files contain no token-shaped or authorization data.
- [ ] Run RED then GREEN:

```bash
npm test -- lib/monitoring/adapters/railway lib/monitoring/adapters/fly lib/monitoring/adapters/conformance.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add lib/monitoring/adapters/railway lib/monitoring/adapters/fly lib/monitoring/adapters/conformance.test.ts
git commit -m "feat(monitoring): collect Railway and Fly evidence"
```

**Acceptance:** Both adapters use only fixed official endpoints and read operations, preserve capability/provenance, distinguish sleeping/scale-to-zero policy, and never imply invoice-grade Fly or Railway cost.

---
