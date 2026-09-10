# R5 Application Monitoring — Pactify Task 4

**Required context:** Read `AGENTS.md`, the complete implementation plan at `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`, the approved design at `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`, and the approved UI brief at `.agent/frontend-design/r5-application-monitoring/brief.md` before editing. Obey the plan's Global Constraints and Shared Contracts. Use TDD/BDD, preserve the listed Human-owned dirty files, do not use production credentials or real provider mutations, and do not push/deploy/release.

### Task 4: Implement credential resolution, adapter conformance, collector isolation, backoff, and SSRF-safe probes

**Files:**

- Create: `lib/monitoring/adapters/contracts.ts`
- Create: `lib/monitoring/adapters/conformance.ts`
- Create: `lib/monitoring/adapters/conformance.test.ts`
- Create: `lib/monitoring/adapters/fixture.ts`
- Create: `lib/monitoring/collector/credentials.ts`
- Create: `lib/monitoring/collector/credentials.test.ts`
- Create: `lib/monitoring/collector/backoff.ts`
- Create: `lib/monitoring/collector/backoff.test.ts`
- Create: `lib/monitoring/collector/probe.ts`
- Create: `lib/monitoring/collector/probe.test.ts`
- Create: `lib/monitoring/collector/collect.ts`
- Create: `lib/monitoring/collector/collect.test.ts`

- [ ] Define `MonitoringAdapter` with fixed `provider`, `version`, `capabilities`, `validateBinding`, and `collect`. Collection returns schema-validated normalized evidence; adapters never write storage.
- [ ] Write a conformance harness proving fixed hosts/methods, abort deadlines, size limits, closed error taxonomy, safe timestamps, unsupported capability representation, and no serialized secret/raw response.
- [ ] Write failing credential tests: missing ref, provider mismatch, missing environment value, present token, redaction in thrown/logged/serialized forms. Return an opaque credential handle to the adapter call and no token-bearing object to snapshots.
- [ ] Write failing collector tests for bounded concurrency, global single-flight, per-provider exponential backoff with jitter injection, honoring `Retry-After`, manual refresh not bypassing backoff/minimum interval, one-adapter isolation, partial-cycle publication, and previous trustworthy signal carry-forward.
- [ ] Write DNS/fetch-injected probe tests rejecting HTTP, userinfo, absolute binding paths, non-allowlisted `host_ref`, loopback/private/link-local/multicast/reserved IP literals, DNS answers in those ranges, cross-origin redirects, excess redirects, custom headers/body, oversize metadata, and timeouts. Permit only exact configured HTTPS origin plus relative path, GET/HEAD, `redirect: manual`, expected statuses, and no persisted body.
- [ ] Implement with injected clock, random source, DNS lookup, and fetch. Do not make a real network request in tests.
- [ ] Run RED then GREEN:

```bash
npm test -- lib/monitoring/adapters/conformance.test.ts lib/monitoring/collector
npm run typecheck
```

- [ ] Commit:

```bash
git add lib/monitoring/adapters/contracts.ts lib/monitoring/adapters/conformance.ts lib/monitoring/adapters/conformance.test.ts lib/monitoring/adapters/fixture.ts lib/monitoring/collector
git commit -m "feat(monitoring): isolate bounded read-only collection"
```

**Acceptance:** Collector failures are isolated and safe, probe SSRF checks cover hostname and resolved-address boundaries, credentials cannot cross the server contract, and the fixture adapter passes conformance.

---
