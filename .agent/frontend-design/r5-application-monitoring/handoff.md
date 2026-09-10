# R5 Application Monitoring — Independent Design Review Packet

## Review state

- Workflow: Frontend Design Workflow 3.3
- Tier: T3
- Review type: independent design review in a new session without implementation context
- Implementation authorization: none
- Primary-agent self-review: complete on 2026-09-11
- Independent review: pending

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

- `APPROVE` — no blocking design findings;
- `APPROVE_WITH_NONBLOCKING_NOTES` — safe to plan after notes are recorded; or
- `CHANGES_REQUIRED` — list the blocking changes needed before an implementation plan.

Do not implement code, edit provider credentials, run provider mutations, deploy, or release.

## New-session prompt

> Independently review the T3 AllJobs Application Monitoring design. Read `AGENTS.md`, `.agent/frontend-design/r5-application-monitoring/brief.md`, `.agent/frontend-design/r5-application-monitoring/handoff.md`, both files under `.agent/frontend-design/r5-application-monitoring/mockup/`, and `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md`. Do not inherit or assume the primary agent's reasoning. Validate architecture, provider feasibility, state semantics, credential and SSRF boundaries, atomic cache/history design, responsive mockup coverage, and scope discipline. Return severity-ordered findings with exact file/line evidence and the required verdict. Do not implement or mutate external systems.
