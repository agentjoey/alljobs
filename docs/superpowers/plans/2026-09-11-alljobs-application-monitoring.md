# AllJobs Application Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a feature-disabled-by-default, read-only application monitoring workspace that serves cached health, deployment, usage, incident, collector, and freshness evidence for explicit Railway, Fly.io, Neon, and Supabase bindings.

**Architecture:** The existing Control Host refresh process invokes fixed provider adapters and a bounded HTTPS probe, normalizes each result, evaluates explainable attention, and publishes one immutable cache generation behind an atomic index pointer. Next.js reads only local validated projections. Provider failures are isolated; previous trustworthy values survive failures; normalized transition events and bounded rollups support later deterministic analysis.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Zod 4, native `fetch`, Node filesystem/DNS primitives, Tailwind v4, existing shadcn Button, Vitest/Testing Library, Playwright, repository `scripts/shot.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`

**Approved UI:** `.agent/frontend-design/r5-application-monitoring/brief.md`; approved mockups under `.agent/frontend-design/r5-application-monitoring/mockup/`.

## Global Constraints

- [ ] Work only on feature `r5-application-monitoring`; the worker seat is `kimi` (`kimi-k3-worker`) and the independent reviewer seat is `claude` (`claude-opus5-reviewer`). A worker never accepts its own task.
- [ ] Use Pactify's isolated worktrees. Do not edit, stage, move, stash, reset, or overwrite the Human-owned dirty files listed in the orchestration handoff.
- [ ] Run every implementation task test-first: add the named focused test, run it and capture the expected RED, implement the smallest contract, then rerun to GREEN.
- [ ] Any test that crosses UI, adapter/API, cache, action, worker, or process boundaries must assert behavior and side effects rather than implementation shape.
- [ ] Before editing Next.js routes, Server Actions, caching, or revalidation behavior, read the relevant local Next 16.3 guides under `node_modules/next/dist/docs/`.
- [ ] Provider calls are fixed, read-only operations. Credentials resolve only from server environment variables named by Control Host metadata. Never serialize tokens, environment values, authorization headers, raw response bodies, logs, or source content.
- [ ] No page render may call a provider. No browser input may supply a token, provider URL, GraphQL document, provider resource ID, probe URL, custom header, or request body.
- [ ] Monitoring is disabled by default. No production credential setup, live provider binding, launchd change, deployment, push, or release is authorized by this plan.
- [ ] Use native `fetch`; add no runtime dependency unless a separately reviewed blocker proves it necessary.
- [ ] Do not add animation for decoration. Preserve the approved Paper Workbench hierarchy and use motion only for existing focus/expand feedback with reduced-motion support.
- [ ] Every task ends with focused tests, `npm run typecheck`, exact-file staging, a focused commit, Pactify checkpoint, and independent review.
- [ ] Final completion requires full Vitest, lint, typecheck, production build, Playwright state-matrix journeys, secret-leak scan, final-build desktop and true 390px screenshots, independent review/verification, and Human Owner walkthrough. Release remains a later Human Gate.

## Shared Contracts

The implementation must converge on these stable names so tasks compose without guesswork.

```ts
type MonitoringProvider =
  | "railway"
  | "fly"
  | "neon"
  | "supabase"
  | "vercel"
  | "cloudflare"
  | "github";

type AttentionLevel = "critical" | "warning" | "unknown" | "watch" | "healthy";
type ExpectedRuntime = "always-on" | "scale-to-zero" | "scheduled" | "manual";
type RequiredSignal = "deployment" | "runtime" | "usage" | "platform_incident";
type BillingAlignment = "exact" | "provider_estimate" | "operational_only";

interface MonitoringBinding {
  id: string;
  provider: MonitoringProvider;
  resource_kind: string;
  resource_id: string;
  environment: string;
  expected_runtime: ExpectedRuntime;
  required_signals: RequiredSignal[];
  credential_ref: string;
  console_url: string;
  probe?: {
    host_ref: string;
    path?: string;
    method: "GET" | "HEAD";
    expected_status: number[];
    timeout_ms: number;
  };
}
```

Provider-specific `resource_id` validation is closed in each adapter:

- Railway `service`: `<project UUID>/<environment UUID>/<service UUID>`.
- Fly.io `app`: Fly app slug.
- Neon `project`: Neon project identifier; the adapter reads `org_id` from project details before capability-detected paid consumption.
- Supabase `project`: Supabase project ref.

`MonitoringSnapshot` is schema version 1 and includes identity, adapter version/capabilities, `attempted_at`, signal-specific `observed_at`, collector, deployment, runtime, usage, platform incident, freshness, aggregate attention, and all machine-readable reasons. Every serialized schema is `.strict()`.

The Control Host configuration gains optional strict monitoring metadata:

```ts
monitoring?: {
  enabled: boolean;                    // default false
  refreshIntervalSeconds: number;     // integer, 60..86400, default 300
  concurrency: number;                // integer, 1..4, default 3
  credentials: Record<string, {
    provider: MonitoringProvider;
    tokenEnv: string;                  // /^[A-Z][A-Z0-9_]*$/
  }>;
  probeAllowedHosts: Record<string, string>; // exact HTTPS origins
}
```

The state root is always `<resolved ALLJOBS_HOME>/state/monitoring`; it is not configurable to an arbitrary path.

---

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

- [ ] Write failing schema tests for every shared contract, strict unknown-key rejection, lowercase stable binding IDs, unique binding IDs per Project, provider/resource-kind combinations, provider-specific `resource_id` grammar, exact HTTPS console allowlists, relative probe paths, bounded status lists/timeouts, feature-disabled default, credential/provider match, valid environment-variable names, and exact HTTPS probe origins.
- [ ] Add monitoring domain schemas and inferred types. Use closed enums and discriminated unions; never use `z.any()`, free-form provider endpoints, or secret values.
- [ ] Extend `projectRegistrySchema` with optional `monitoring: { bindings }`. Reject duplicate IDs and unsupported required signals based on the selected provider/resource kind. Extension providers may parse but must declare `implemented: false` and cannot collect in Phase 1.
- [ ] Extend Control Host parsing with the optional monitoring block and add `stateDir` and `monitoringStateDir` to resolved paths. Directory creation may create only descendants of resolved `ALLJOBS_HOME`.
- [ ] Keep `config/alljobs.example.json` disabled and use fake environment-variable names only. Include one commented-by-documentation example in adjacent Markdown only if JSON cannot express comments; do not include token-shaped values.
- [ ] Run RED then GREEN:

```bash
npm test -- lib/monitoring/domain/schemas.test.ts lib/planning/domain/schemas.test.ts lib/planning/config.test.ts
npm run typecheck
```

- [ ] Commit exact files:

```bash
git add lib/monitoring/domain/schemas.ts lib/monitoring/domain/types.ts lib/monitoring/domain/schemas.test.ts lib/planning/domain/schemas.ts lib/planning/domain/schemas.test.ts lib/planning/config.ts lib/planning/config.test.ts config/alljobs.example.json
git commit -m "feat(monitoring): define strict monitoring contracts"
```

**Acceptance:** Invalid/unsupported bindings fail closed; feature default is disabled; no secret can enter a parsed repository or cache contract; existing project/config fixtures remain compatible.

---

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

### Task 9: Verify the final candidate and produce release-gate evidence

**Files:**

- Create: `tests/e2e/r5-fixtures.ts`
- Create: `tests/e2e/r5-application-monitoring.spec.ts`
- Create: `playwright.r5.config.ts`
- Create: `.agent/frontend-design/r5-application-monitoring/verification.md`
- Create: `.agent/frontend-design/r5-application-monitoring/final-desktop.png`
- Create: `.agent/frontend-design/r5-application-monitoring/final-mobile.png`
- Create: `.agent/frontend-design/r5-application-monitoring/final-project-detail.png`
- Modify: `.agent/frontend-design/r5-application-monitoring/handoff.md`
- Modify: `docs/operations.md` if present; otherwise create `docs/application-monitoring-operations.md`

- [ ] Write failing Playwright journeys that provision an isolated fixture `ALLJOBS_HOME` and normalized cache without provider network: attention triage, every Project in ledger, critical drill-down, mixed evidence, stale/backoff/permission/unsupported states, empty bindings, manual refresh safe response, keyboard traversal, responsive labels, and automated WCAG AA audit.
- [ ] Add production-like fixture startup in `playwright.r5.config.ts`; bind only `127.0.0.1` and use a port distinct from production. Tests must never read the real Control Host home or credentials.
- [ ] Run the whole story and fix every failure before recording evidence:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npx playwright test --config playwright.r5.config.ts
npm run verify:deploy
```

- [ ] Inspect all modified source and generated fixture/cache data for secrets/raw payloads and check route rendering does not call provider hosts. Record the exact candidate SHA and command results in `verification.md`.
- [ ] Start the final production build on the isolated verification port, then capture the approved fixture states with the repository script. Use a true emulated 390px viewport, not bare headless Chrome `--window-size`:

```bash
node scripts/shot.mjs http://127.0.0.1:3461/monitoring .agent/frontend-design/r5-application-monitoring/final-desktop.png 1440 1 0 light
node scripts/shot.mjs http://127.0.0.1:3461/monitoring .agent/frontend-design/r5-application-monitoring/final-mobile.png 390 2 1 light
node scripts/shot.mjs http://127.0.0.1:3461/monitoring/talentvault .agent/frontend-design/r5-application-monitoring/final-project-detail.png 1440 1 0 light
```

- [ ] Compare final screenshots to both approved mockups and run `$impeccable audit`; document any intentional difference and its evidence. Do not capture from a development server.
- [ ] Document disabled-by-default setup, credential environment-name mapping, one-shot fixture-safe validation, cache layout, operator errors/backoff, rollback by disabling monitoring, and the still-required Human-selected pilot/live-provider/release gates. Do not place actual token examples in docs.
- [ ] Update handoff with exact candidate SHA, test evidence, screenshot hashes, independent reviewer verdict, and explicit statements: not pushed, not deployed, no production credentials configured, no live provider validation performed.
- [ ] Commit exact verification artifacts:

```bash
git add tests/e2e/r5-fixtures.ts tests/e2e/r5-application-monitoring.spec.ts playwright.r5.config.ts .agent/frontend-design/r5-application-monitoring/verification.md .agent/frontend-design/r5-application-monitoring/final-desktop.png .agent/frontend-design/r5-application-monitoring/final-mobile.png .agent/frontend-design/r5-application-monitoring/final-project-detail.png .agent/frontend-design/r5-application-monitoring/handoff.md docs/application-monitoring-operations.md
git commit -m "test(monitoring): verify final application monitoring candidate"
```

If `docs/operations.md` existed and was modified instead, stage it instead of the new operations file.

**Acceptance:** Final build and all automated gates pass against the exact reviewed SHA; screenshots come from that build; independent review has no open blocking finding; production remains unchanged; pilot binding, live provider validation, Human walkthrough, push/deploy, and release remain explicit pending Human Gates.

## Primary Acceptance Protocol

After Pactify reports every task accepted, the primary agent must not rely on worker/reviewer summaries alone.

- [ ] Confirm task ownership/reviewer identity and accepted checkpoints from Pact state/log.
- [ ] Inspect `git diff` and commit history against pre-feature SHA; verify no Human dirty file entered any feature commit.
- [ ] Re-run Task 9's full command set from the final candidate checkout.
- [ ] Re-run behavior probes for one healthy, one critical, one unknown, one backing-off, and one corrupt-cache recovery scenario.
- [ ] Open all three final images and visually inspect desktop/390px/detail against approved mockups.
- [ ] Search tracked changes for token/header/raw response leakage and verify only fixed provider hosts/documents exist.
- [ ] Record the exact accepted SHA and unresolved Human Gates. Do not push, deploy, configure credentials, bind a production Project, or alter launchd without a new explicit authorization.
