# R5 Application Monitoring — Pactify Task 1

**Required context:** Read `AGENTS.md`, the complete implementation plan at `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md`, the approved design at `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`, and the approved UI brief at `.agent/frontend-design/r5-application-monitoring/brief.md` before editing. Obey the plan's Global Constraints and Shared Contracts. Use TDD/BDD, preserve the listed Human-owned dirty files, do not use production credentials or real provider mutations, and do not push/deploy/release.

### Task 1: Define strict bindings, configuration, and normalized domain contracts

**Files:**

- Create: `lib/monitoring/domain/schemas.ts`
- Create: `lib/monitoring/domain/types.ts`
- Create: `lib/monitoring/domain/schemas.test.ts`
- Modify: `lib/planning/domain/schemas.ts`
- Modify: `lib/planning/domain/schemas.test.ts`
- Modify: `lib/planning/config.ts`
- Modify: `lib/planning/config.test.ts`
- Modify: `config/alljobs.example.json`
- Modify: `scripts/verify-deployment-config.mjs`
- Modify: `scripts/verify-deployment-config.test.ts`

- [ ] Repair the pre-existing deployment-verifier drift without changing assistant runtime code: first prove `scripts/verify-deployment-config.test.ts` is RED because Human commit `c9d83c8` replaced the helper name `assistantIsEnabled` with behaviorally equivalent `getAssistantConfig` plus `assistant?.enabled !== true`; then update the verifier to assert the current semantic invariants (`force-dynamic`, disabled/missing config rejection, safe 503/no-store response, and configured `allowedOrigins` pass-through) rather than the obsolete helper identifier.
- [ ] Write failing schema tests for every shared contract, strict unknown-key rejection, lowercase stable binding IDs, unique binding IDs per Project, provider/resource-kind combinations, provider-specific `resource_id` grammar, exact HTTPS console allowlists, relative probe paths, bounded status lists/timeouts, feature-disabled default, credential/provider match, valid environment-variable names, and exact HTTPS probe origins.
- [ ] Add monitoring domain schemas and inferred types. Use closed enums and discriminated unions; never use `z.any()`, free-form provider endpoints, or secret values.
- [ ] Extend `projectRegistrySchema` with optional `monitoring: { bindings }`. Reject duplicate IDs and unsupported required signals based on the selected provider/resource kind. Extension providers may parse but must declare `implemented: false` and cannot collect in Phase 1.
- [ ] Extend Control Host parsing with the optional monitoring block and add `stateDir` and `monitoringStateDir` to resolved paths. Directory creation may create only descendants of resolved `ALLJOBS_HOME`.
- [ ] Keep `config/alljobs.example.json` disabled and use fake environment-variable names only. Include one commented-by-documentation example in adjacent Markdown only if JSON cannot express comments; do not include token-shaped values.
- [ ] Run RED then GREEN:

```bash
npm test -- scripts/verify-deployment-config.test.ts lib/monitoring/domain/schemas.test.ts lib/planning/domain/schemas.test.ts lib/planning/config.test.ts
npm run typecheck
```

- [ ] Commit exact files:

```bash
git add lib/monitoring/domain/schemas.ts lib/monitoring/domain/types.ts lib/monitoring/domain/schemas.test.ts lib/planning/domain/schemas.ts lib/planning/domain/schemas.test.ts lib/planning/config.ts lib/planning/config.test.ts config/alljobs.example.json scripts/verify-deployment-config.mjs scripts/verify-deployment-config.test.ts
git commit -m "feat(monitoring): define strict monitoring contracts"
```

**Acceptance:** Invalid/unsupported bindings fail closed; feature default is disabled; no secret can enter a parsed repository or cache contract; existing project/config fixtures remain compatible.

---
