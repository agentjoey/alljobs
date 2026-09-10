# R5 Application Monitoring — Pactify Task 6

**Required context:** Read `AGENTS.md`, the complete implementation plan at `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`, the approved design at `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`, and the approved UI brief at `.agent/frontend-design/r5-application-monitoring/brief.md` before editing. Obey the plan's Global Constraints and Shared Contracts. Use TDD/BDD, preserve the listed Human-owned dirty files, do not use production credentials or real provider mutations, and do not push/deploy/release.

verify: npm test -- lib/monitoring/adapters/neon lib/monitoring/adapters/supabase lib/monitoring/adapters/conformance.test.ts && npm run typecheck

### Task 6: Add Neon and Supabase adapters

**Files:**

- Create: `lib/monitoring/adapters/neon/index.ts`
- Create: `lib/monitoring/adapters/neon/index.test.ts`
- Create: `lib/monitoring/adapters/neon/fixtures/*.json`
- Create: `lib/monitoring/adapters/supabase/index.ts`
- Create: `lib/monitoring/adapters/supabase/index.test.ts`
- Create: `lib/monitoring/adapters/supabase/fixtures/*.json`
- Modify: `lib/monitoring/adapters/conformance.test.ts`

- [ ] Re-open the official Neon API authentication/project details/compute endpoints/consumption history references and Supabase Management API authentication/project health/API-count usage references. Record compatibility date and links next to fixed operations.
- [ ] Write Neon fixture tests for `GET /api/v2/projects/{project_id}`, `GET /api/v2/projects/{project_id}/endpoints`, free-plan project `data_transfer_bytes`, paid-plan `/api/v2/consumption_history/v2/projects` capability, idle/suspended compute under each expected-runtime policy, 403 consumption capability downgrade, auth failure, 429, malformed data, and timestamps.
- [ ] Implement fixed Neon GETs on `https://console.neon.tech`; obtain `org_id` from validated project details before the optional paid consumption query. Expose project `data_transfer_bytes` as provider-estimated current-billing-period usage, paid consumption metrics as exact only where Neon labels them invoice-aligned, and unsupported paid history as `not_available` without downgrading optional usage.
- [ ] Write Supabase fixture tests for `GET /v1/projects/{ref}/health` service states and `GET /v1/projects/{ref}/analytics/endpoints/usage.api-counts`, permission failures, 429, partial health, unavailable usage, malformed data, and timestamps.
- [ ] Implement fixed Supabase GETs on `https://api.supabase.com` with Bearer authentication. Normalize service health separately from API request counts; request totals are operational measures unless the provider response supplies a matching allowance. Permission failure on optional usage becomes `not_available`; required usage becomes `unknown`.
- [ ] Run both adapters through conformance and secret-fixture scans.
- [ ] Run RED then GREEN:

```bash
npm test -- lib/monitoring/adapters/neon lib/monitoring/adapters/supabase lib/monitoring/adapters/conformance.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add lib/monitoring/adapters/neon lib/monitoring/adapters/supabase lib/monitoring/adapters/conformance.test.ts
git commit -m "feat(monitoring): collect Neon and Supabase evidence"
```

**Acceptance:** Free/paid Neon capability differences and Supabase permission differences are explicit; health and usage remain separate; no unsupported value becomes zero or healthy.

---
