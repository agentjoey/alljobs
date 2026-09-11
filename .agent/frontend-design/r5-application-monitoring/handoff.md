# R5 Application Monitoring — Independent Design Review Packet

## Review state

- Workflow: Frontend Design Workflow 3.3
- Tier: T3
- Review type: independent design review in a new session without implementation context
- Implementation authorization: granted 2026-09-11 for Pactify implementation with worker `kimi` (K3), independent reviewer `claude`, and primary-agent acceptance; production credentials, provider mutations, deployment, push, and release remain unauthorized
- Primary-agent self-review: complete on 2026-09-11
- Independent review: **complete on 2026-09-11** — verdict `PASS` (no blocking findings; four non-blocking findings R5-DESIGN-001…004 recorded). Review document: `.agent/frontend-design/r5-application-monitoring/independent-design-review.md`. Reviewer: seat `kimi` via pact task `r5-design-review`; implementation may proceed to Task 1.

## Canonical inputs

- Brief: `.agent/frontend-design/r5-application-monitoring/brief.md`
- Design specification: `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`
- Approved landing mockup: `.agent/frontend-design/r5-application-monitoring/mockup/landing.html`
- Approved Project-detail mockup: `.agent/frontend-design/r5-application-monitoring/mockup/project-detail.html`

## Human-approved decisions

- daily overview optimized for identifying anomalies, near-limit usage, and stale data within one minute;
- explicit Human-owned Project-to-provider-resource bindings;
- Control Host cached projections with no provider fan-out during page rendering;
- bounded normalized history for later analysis;
- Project-first landing page with an attention-first queue;
- Project → Provider Binding → Signal detail;
- explainable state matrix and failure semantics.

## Review focus

1. Verify the design meets the user goal without becoming a general observability or billing platform.
2. Challenge provider capability claims and confirm unsupported/billing-limited facts are represented honestly.
3. Inspect credential, fixed-query, same-origin refresh, SSRF, data-retention, and secret-redaction boundaries.
4. Verify atomic generation/index semantics cannot expose a partially written cycle or erase last trustworthy data.
5. Verify attention precedence, expected-runtime behavior, usage thresholds, and freshness rules do not create false green or false red states.
6. Compare the two retained HTML mockups with the information architecture and responsive requirements in the specification.
7. Identify contradictions with the existing single-Control-Host Planning Core architecture.
8. Flag over-engineering, missing acceptance criteria, or decisions that require another Human Gate.

## Required output

Return findings ordered by severity with exact file and line references. Distinguish blocking findings from suggestions. Conclude with one of:

- `PASS` — no blocking design findings;
- `PASS_WITH_NONBLOCKING_NOTES` — safe to implement after notes are recorded; or
- `CHANGES_REQUIRED` — list the blocking changes needed before an implementation plan.

Do not implement code, edit provider credentials, run provider mutations, deploy, or release.

## New-session prompt

> Independently review the T3 AllJobs Application Monitoring design. Read `AGENTS.md`, `.agent/frontend-design/r5-application-monitoring/brief.md`, `.agent/frontend-design/r5-application-monitoring/handoff.md`, both files under `.agent/frontend-design/r5-application-monitoring/mockup/`, and `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`. Do not inherit or assume the primary agent's reasoning. Validate architecture, provider feasibility, state semantics, credential and SSRF boundaries, atomic cache/history design, responsive mockup coverage, and scope discipline. Return severity-ordered findings with exact file/line evidence and the required verdict. Do not implement or mutate external systems.

## Task 9 — Final candidate verification (2026-09-11)

- **Candidate SHA:** `a81726bed652af1418d27611c11fe7541ffa8d35` (HEAD before the Task 9 artifact commit; Task 9 changed no product code).
- **Test evidence:** `npm test` 789/789 passed (77 files); `tsc --noEmit` clean; `eslint` 0 errors / 69 warnings (baseline unchanged); `next build` clean; Playwright R5 suite 10/10 journeys passed against the production build on `127.0.0.1:3461` (attention triage, complete ledger, critical drill-down, mixed evidence, stale/permission states with specific reasons plus an unsupported optional capability that stays visible in the Collector detail without downgrading attention, unmonitored-absent/never-collected-pending, manual-refresh safe outcome with backoff evidence, keyboard traversal, 390px reflow without horizontal scroll, axe WCAG 2 AA with zero violations on both routes); `npm run verify:deploy` passed. Every journey asserted zero non-127.0.0.1 requests.
- **Rework (evidence integrity):** the OrbitDesk/Vercel fixture projection is now derived by calling `evaluateAttention` in `tests/e2e/r5-fixtures.ts` with the genuine inputs (collector `unsupported_capability`, empty `required_signals`), yielding the honest aggregate `healthy` / no reasons instead of a hand-published `unknown` with a fabricated `unsupported_capability` reason. Queue/ledger counts and assertions updated (5 needing attention; OrbitDesk healthy, absent from the queue); the unsupported state remains asserted in the binding's Collector detail. RED→GREEN recorded in `verification.md`. No product code changed.
- **Secret scan:** clean — no bearer/authorization/secret/api-key/cookie material in the new sources, docs, or generated fixture cache; cache holds normalized metadata only; credential references are never-set env-var names.
- **Screenshot SHA-256 (from the final production build, captured with `scripts/shot.mjs`; landing shots recaptured after the fixture rework):**
  - `final-desktop.png` `4c3a2df0d91f343737f24b3dd7f2385731eba8eb4078c42e48030defa02c1dd2`
  - `final-mobile.png` `78d59edeae15f374a099543006b41efad2ffb55a7d94a239a777a1489cdff7a1`
  - `final-project-detail.png` `eef0537281fb2b63b4f67d23caadcc754f52d5e5738eeaffa54d50951c9391a7`
- **Mockup comparison:** both routes match the approved mockups' information architecture; eight intentional differences (freshness state labels vs relative times, no refresh countdown, binding ids in queue rows, collapsed-by-default detail panels, console link in row action, normalized transition tokens in evidence, operational usage without mockup cost styling, app-wide custody strip) are documented with evidence in `verification.md`. `$impeccable audit` scored 19/20 (Excellent), no P0/P1 findings.
- **Independent reviewer verdict:** pending pact review by seat `claude`.
- **Explicit statements:** not pushed; not deployed; no production credentials configured; no live provider validation performed. Pilot binding selection, live provider validation, Human Owner walkthrough, push/deploy, and release remain pending Human gates.
- Full evidence: `.agent/frontend-design/r5-application-monitoring/verification.md`.
