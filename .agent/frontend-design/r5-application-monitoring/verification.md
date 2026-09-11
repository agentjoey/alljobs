# R5 Application Monitoring — Task 9 Verification Evidence

Date: 2026-09-11 · Release decision updated: 2026-09-12 · Seat: `kimi` (worker) · Independent reviewer verdict: accepted by seat `claude`.

## Candidate under verification

- **Candidate SHA:** `a81726bed652af1418d27611c11fe7541ffa8d35` (`git rev-parse HEAD` taken before the Task 9 artifact commit; working tree carried only the Task 9 verification artifacts listed below).
- Branch: `codex/r5-application-monitoring` in worktree `.worktrees/r5-pact-driver`.
- No product code was modified by Task 9. New files: `tests/e2e/r5-fixtures.ts`, `tests/e2e/r5-application-monitoring.spec.ts`, `playwright.r5.config.ts`. Modified: `docs/operations.md`, `.agent/frontend-design/r5-application-monitoring/handoff.md`.

## Verification chain (run in order, final code)

| Command | Result |
|---|---|
| `npm test` | PASS — 77 test files, 789 tests passed, 0 failed (Vitest 4.1.10) |
| `npm run typecheck` | PASS — `tsc --noEmit`, no output |
| `npm run lint` | PASS — 0 errors, 69 warnings (identical to the pre-Task-9 baseline of 69 warnings; Task 9 files add none) |
| `npm run build` | PASS — Next.js 16.3.0 production build; `/monitoring` and `/monitoring/[project]` compiled as dynamic routes |
| `npx playwright test --config playwright.r5.config.ts` | PASS — 10/10 journeys (chromium, workers 1, `next start -p 3461 -H 127.0.0.1`, `reuseExistingServer: false`) |
| `npm run verify:deploy` | PASS — "All deployment configs and invariants verified successfully." |

RED evidence: with the fixture's `publishCycle` call temporarily disabled, the same suite produced 7 meaningful failures (empty attention queue, missing ledger rows, missing drill-down evidence, refresh ack without a served cycle id) and 3 passes; restored, the suite is fully green. Rework RED (this round): after switching the Vercel fixture to the evaluator-derived projection but before updating the journeys, exactly the 3 journeys that had asserted the fabricated aggregate state failed (attention triage, complete ledger, stale/permission/unsupported); after the assertion rework the suite is 10/10 green.

### E2E journeys (10)

1. Attention triage: queue order Critical → Warning → Unknown ×2 → Watch; healthy projects and healthy bindings absent — including OrbitDesk, whose unsupported-but-optional Vercel capability does not enter the queue; queue items link to their owning Project.
2. Complete ledger: 7 monitored Projects exactly once each (order, state, provider bindings, leading reason, freshness, drill-down action); summary cards agree (7 projects, 8 bindings, 5 needing attention, Expired worst freshness).
3. Critical drill-down: queue → `/monitoring/talentvault`; leading reason; binding comparison; expanded signal matrix with deployment `Succeeded · c41ea1` + runtime `Unhealthy · 2 consecutive failures`, observed timestamps, `Operational only` billing alignment, provider-console link (`rel=noopener`), and reason evidence `runtime_unhealthy_confirmed`.
4. Mixed evidence: succeeded deployment and failed runtime coexist on one binding; state stays Critical, never flattened to healthy.
5. Stale/unknown/permission/unsupported: `collector_permission_denied` + `stale_max_age_exceeded` on MathMagics (retained value labeled Expired); the Vercel extension binding keeps `Unsupported capability` visible in its Collector detail while its aggregate attention stays healthy — zero required signals means an optional unsupported fact never downgrades attention, matching evaluator semantics.
6. Empty/unmonitored: `ledgerless` (no bindings) absent from ledger and queue and 404s on detail; never-collected `novaweb` renders pending unknown / awaiting first collection.
7. Manual refresh: ack announces `queued` naming the served cycle `2026-09-11t06-00-00z`; second immediate click reports `already running` or `backing off` (never a new fan-out); the queued cycle fails closed (credential env vars unset) and the republished projection keeps last-trustworthy values (`Succeeded · c41ea1`, `Unhealthy`) with `Authentication failed` collector state.
8. Keyboard traversal: Tab reaches queue links, the refresh control, and binding toggles; Enter/Space toggle expansion; focused elements show a solid outline.
9. Responsive 390px (emulated): `scrollWidth ≤ clientWidth` on both routes; ledger and binding rows reflow into labeled blocks (`data-label` pseudo labels verified) with state/provider/reason/freshness/action visible.
10. Automated WCAG 2 AA audit (`@axe-core/playwright`, tags `wcag2a`/`wcag2aa`) on `/monitoring` and `/monitoring/talentvault` (with a binding expanded): 0 violations on both.

## No provider network during rendering

Every journey attaches a page `request` listener that fails the test if any HTTP(S) request host is not `127.0.0.1`; all 10 journeys passed with zero external requests. Server-side, the fixture config names credential environment variables (`ALLJOBS_R5_E2E_*`) that are deleted from the runner environment and never set for the web server, so collection fails closed in credential resolution before any adapter request or probe; the Vercel extension binding short-circuits as unsupported with no requests.

## Secret scan

Method: `grep -rniE "bearer|authorization|secret|api[-_]?key|password|cookie"` over the three new source files, the modified docs, and a generated fixture home (`config.json`, project registry JSON, `state/monitoring` cache tree including every generation snapshot and the events log).

Result: CLEAN. The only matches are env-var NAME references (`ALLJOBS_R5_E2E_*_TOKEN` names in fixture config, a comment in the spec, and the pre-existing `MINIMAX_API_KEY` name in the R2 ops section). The fixture cache contains normalized metadata only (schema-versioned snapshots: identity, signals, freshness, attention, reasons; no credential, header, body, or raw-response keys). No token-shaped values anywhere.

## Screenshots (final production build, `next start -p 3461 -H 127.0.0.1`)

Captured with `scripts/shot.mjs` (CDP device-metrics override; 390px is a true emulated viewport) from the same build that passed the chain above; the server was killed afterward and port 3461 is free.

- `final-desktop.png` SHA-256 `4c3a2df0d91f343737f24b3dd7f2385731eba8eb4078c42e48030defa02c1dd2` (1440×1, `/monitoring`)
- `final-mobile.png` SHA-256 `78d59edeae15f374a099543006b41efad2ffb55a7d94a239a777a1489cdff7a1` (390×2 emulated, `/monitoring`)
- `final-project-detail.png` SHA-256 `eef0537281fb2b63b4f67d23caadcc754f52d5e5738eeaffa54d50951c9391a7` (1440×1, `/monitoring/talentvault`; unchanged — the TalentVault route is unaffected by the fixture rework)

## Mockup comparison

Reference renders of the approved mockups were captured to `/tmp/r5-mockup-landing.png` and `/tmp/r5-mockup-detail.png` with the same script. The mockups render dark because their scoped `light-dark()` tokens follow headless Chrome's default dark preference; the application renders its Paper Workbench light theme. Structural comparison is unaffected.

Information architecture matches the approved mockups on both routes: provenance strip → scope/trust summary → attention queue → complete ledger; detail: project attention + leading reason ("Why attention") → provider-binding comparison → expandable signal matrix → recent evidence with bounded deterministic interpretation.

Intentional differences (implementation vs. mockup copy), each covered by e2e assertions:

1. **Freshness is a state label, not a relative time.** Mockup shows "2m ago"/"4m"; the build renders Current/Delayed/Expired/Never-collected — the text-first freshness states required by the brief's freshness model.
2. **No "Next refresh in 56s" countdown.** Collection is scheduled server-side or manual; the UI never promises client-side timing.
3. **Queue rows show the binding id** (`Railway · railway-production-api`) instead of a friendly alias — binding ids disambiguate same-provider bindings and are schema-safe.
4. **Detail bindings render collapsed** on a plain page load; the mockup pre-expands the critical binding. Expansion is a user/keyboard action covered by journeys 3, 4, and 8.
5. **Provider-console link lives in each binding row's Action cell** (visible without expanding); the mockup places it inside the expanded panel head, and has a mockup-only "Inspect binding" shortcut.
6. **Recent evidence renders normalized transition tokens** (`runtime · runtime: healthy → unhealthy`) rather than mockup prose; the deterministic interpretation copy is preserved ("The failure began 4 minutes after the active deployment … correlation evidence only").
7. **Usage cells show operational measures with billing-alignment labels** (`120 cpu_seconds · 12% of allowance`, `Operational only`); the mockup's "US$6.38 · estimate" cost styling was not adopted — cost is only rendered with `exact` provider-reported billing alignment, and the fixture uses operational measures.
8. **The app-wide custody strip (`EXTERNAL: CACHED PROJECTION`)** from the shared AppShell appears above the mockup's own source strip.

## Impeccable audit (`$impeccable audit`)

- Fresh mechanical detector (`detect.mjs`) over the monitoring routes, components, and shared stylesheet reported 13 advisory-only design-system findings: 11 are shared pre-existing stylesheet values and 2 are the R5 warning/watch accent hex values (`#8c5e00`, `#705800`). No blocking detector finding was reported.
- Accessibility 4/4 (axe WCAG AA clean on both routes; keyboard traversal and visible focus verified in e2e). Performance 4/4 (local-cache reads only; no animations added). Theming 3/4 (Paper Workbench tokens throughout; two hard-coded status-accent hex values in `globals.css` for warning/watch). Responsive 4/4 (390px reflow proven, no horizontal scroll, ≥44px coarse-pointer targets). Implementation integrity 4/4 (structure matches the approved mockups; no drift).
- **Audit Health Score: 19/20 (Excellent).** No P0/P1 findings; the token-accent hex values are a P3 note for a future `$impeccable polish` pass. No code changed as a result of the audit.

## Fixture integrity: the Vercel projection is evaluator-derived

The OrbitDesk/Vercel extension binding's published snapshot is produced by calling `evaluateAttention` inside `tests/e2e/r5-fixtures.ts` with the genuine collection inputs (collector state `unsupported_capability`, empty `required_signals`, empty adapter capabilities), so the fixture cannot drift from the collector/evaluator contract. The genuine result — `attention=healthy`, `leading=null`, `reasons=[]` — is what the journeys and screenshots assert: an optional unsupported capability never downgrades attention, while the unsupported state remains visible and asserted in the binding's Collector detail (`Unsupported capability`, zero collection requests).

## Human Owner release decision (2026-09-12)

After reviewing the final desktop, true-390px mobile, and Project-detail screenshots plus the rollback boundary, the Human Owner explicitly instructed: `push and deploy`. This authorizes integrating and deploying the accepted R5 candidate. The deployment remains safe-off: `monitoring.enabled` stays false, no production provider credential is created, and no live provider collection is enabled by this decision.

## Explicit statements

- **Not pushed.** The candidate exists only as local commits in this worktree.
- **Not deployed.** Production (`alljobs.agentjoey.ai`, port 3456, launchd, Tunnel, Access) was never touched; verification ran on isolated port 3461.
- **No production credentials configured.** Every credential reference resolves to an `ALLJOBS_R5_E2E_*` environment variable that is deliberately never set.
- **No live provider validation performed.** All evidence derives from schema-valid fixture projections and fail-closed collection.

## Pending Human gates after safe-off deployment authorization

Human-selected pilot binding, production credential creation/scoping, live provider validation, and authorization to set `monitoring.enabled: true` remain pending Human gates. The 2026-09-12 instruction authorizes push and deployment of the disabled-by-default release only.
