# R5 Application Monitoring — Independent Design & Execution-Readiness Review

- **Reviewer:** seat `kimi` (pact task `r5-design-review`), independent of the primary design session
- **Date:** 2026-09-11
- **Verdict:** `PASS` (four non-blocking findings recorded below; none blocks Task 1)
- **Scope:** read-only review. No implementation code, credentials, provider calls, deploy, push, or release.

## Inputs inspected

- Brief: `.agent/frontend-design/r5-application-monitoring/brief.md` (119 lines)
- Design spec: `docs/superpowers/specs/2026-09-11-alljobs-application-monitoring-design.md` (590 lines)
- Implementation plan: `docs/superpowers/plans/2026-09-11-alljobs-application-monitoring.md` (488 lines)
- Review packet: `.agent/frontend-design/r5-application-monitoring/handoff.md`
- Approved landing mockup: `.agent/frontend-design/r5-application-monitoring/mockup/landing.html` — SHA-256 `e5269735…` matches brief line 44
- Approved detail mockup: `.agent/frontend-design/r5-application-monitoring/mockup/project-detail.html` — SHA-256 `dfb5fc9b…` matches brief line 46
- Pact task graph: `.pact/tasks/r5-application-monitoring-task-0.md` … `task-9.md` (10 tasks, linear dep chain, all owned by `kimi`, reviewed by `claude`)
- Current seams: `lib/planning/config.ts`, `lib/planning/domain/schemas.ts:115` (`projectRegistrySchema`), `app/actions/refresh.ts`, `scripts/planning-refresh.ts`, `lib/planning/providers/refresh.test.ts`, `config/alljobs.example.json`
- Human dirty-file exclusion: this worktree is clean (`git status --porcelain` empty). The Human-owned dirty files live only in the main checkout (`~/AgentWorks/GPT_Workspace/alljobs` on `main`): `data/log/activity.jsonl`, `docs/superpowers/specs/2026-08-29-alljobs-product-roadmap-design.md`, `.agent/frontend-design/r6-multi-device-identity/`, `.superpowers/brainstorm/`, `data/projects/{grandegpt,mathmagics,talentvault}.json`, `docs/ROADMAP.md`, `kimi-debug-session_-20260827-045249.zip`. None overlaps any file in the r5 task graph.

## 1. Spec-to-task traceability

Every spec section maps to at least one pact task; no plan task is missing a spec anchor.

| Spec surface | Plan / pact task |
|---|---|
| §6 binding model, §12.1 credential refs, strict schemas | Task 1 (`r5-contracts`) |
| §8 attention matrix, §9 freshness rules | Task 2 (`r5-attention`) |
| §10 cache/history, atomic publication, retention | Task 3 (`r5-store`) |
| §12.1–12.2 credential/SSRF boundary, §13 adapter contract, §5.1 single-flight/backoff | Task 4 (`r5-collector`) |
| §4 Railway/Fly feasibility | Task 5 (`r5-railway-fly`) |
| §4 Neon/Supabase feasibility | Task 6 (`r5-neon-supabase`) |
| §5.2 manual refresh, §14 worker orchestration | Task 7 (`r5-queries-refresh`) |
| §11 UI information architecture, §11.3 responsive | Task 8 (`r5-ui`) |
| §16 test strategy, §17 rollout, §18 acceptance | Task 9 (`r5-verification`) |

Task 7's RED/GREEN command references `lib/planning/providers/refresh.test.ts`; the file exists. Dependency chain is linear (0→1→…→9), matching the plan's phase order; no circular or missing deps.

## 2. Provider capability honesty

Spec §4 does not overclaim: Fly.io has no identified invoice-grade usage API (operational metrics only, billing marked unavailable); Neon consumption is explicitly plan-dependent with a 403-capability downgrade path (plan Task 6); Supabase billable usage is not claimed from one endpoint; Railway metrics stay provider-labeled. Capability rules (§4) require `not_available` over synthetic zeroes, capability detection retained in snapshot evidence, and forbid labeling a measure "cost"/"allowance" unless the provider reports it. Plan Tasks 5–6 re-open official references before implementation and record compatibility dates in code comments. Honest and enforceable.

## 3. Credential and probe boundaries

- Credentials resolve server-side only from environment variables named by Control Host metadata (`credential_ref` → provider + `tokenEnv`, plan Shared Contracts); secret values never enter repo files, cache, logs, API responses, or HTML (spec §6, §12.1, §12.4). Existing seam `lib/planning/config.ts` already establishes the strict-schema Control Host config pattern that Task 1 extends.
- Railway GraphQL is constrained to a fixed query allowlist with mutation documents rejected and values bound as variables, never concatenated (spec §12.1; plan Task 5).
- Probe SSRF boundary (spec §12.2) is complete: HTTPS only, no userinfo/headers/body, `probeAllowedHosts` reference instead of raw URLs, DNS-resolution rejection of loopback/private/link-local/multicast, `redirect: "manual"`, GET/HEAD only, bounded everything, no persisted body. Plan Task 4 turns each clause into an injected-DNS/fetch test. No gap found.
- Web boundary (spec §12.3): loopback-only origin preserved, same-origin non-idempotent refresh with `no-store`, route input limited to registered identifiers. Plan Task 7's action tests cover each. The existing `app/actions/refresh.ts` provides the same Server Action pattern.

## 4. Atomic publication and recovery

Spec §10.1: immutable per-cycle generations, per-file temp+rename, `index.json` written last via atomic replacement as the sole visibility boundary, index-first reads with schema validation, active+previous generation retained for recovery, corrupt new write cannot erase the known-good projection. Plan Task 3 tests each property (torn cycle, corrupt index, missing referenced snapshot, cleanup only after the visibility boundary). Retention (§10.3) is path-safe: validated filenames only, no arbitrary root/glob/symlink/`~`. Sound.

## 5. Partial-cycle semantics

Spec §5.1 + §9: one adapter failure cannot abort others; failed bindings publish a new snapshot carrying retained last-trustworthy signals plus fresh collector-attempt evidence; auth/permission failure invalidates trust immediately (`unknown`), while timeout/rate-limit retain the last value until max-age expiry; repeated identical failures update attempt metadata without duplicate transition events. Plan Tasks 3–4 make carry-forward and event dedupe explicit test subjects. The `unknown`-never-`healthy` rule holds in both spec §8 and plan Task 2's decision table. Consistent.

## 6. Responsive state matrix

Spec §11.1/§11.2 ordering (provenance → summary → attention queue → complete ledger; detail: attention → bindings → signal matrix → evidence) matches both approved mockups section-for-section. Mockup `@media (max-width: 760px)` blocks reflow rows into `data-label`-labeled blocks without horizontal clipping, preserving status/reason/freshness/action per §11.3. Mockups intentionally sample only a subset of states; the full matrix (partial/stale/backoff/auth/permission/unsupported/first-collection/empty/corrupt-cache) is carried by plan Task 8 component tests and Task 9 Playwright journeys rather than by static HTML. See R5-DESIGN-001/003.

## 7. Accessibility

Mockups use semantic tables with headings, `aria-labelledby` sections, `aria-expanded`/`aria-controls` on expanders, `aria-live` on the detail region, and status conveyed by text + dot (not color alone). Plan Task 8 additionally requires ≥44px coarse-pointer targets, visible focus, keyboard-operable expanded controls, reduced motion, and `aria-live` refresh announcements; Task 9 adds an automated WCAG AA audit. The plan's accessibility bar exceeds the mockup literal CSS; that is the correct direction (R5-DESIGN-003).

## 8. Rollback

Spec §17: feature-disabled until a pilot binding validates; staged rollout (contracts disabled → one-shot collection inspection → scheduled pilot → routes → provider-by-provider expansion); rollback = disable routes and collection, leaving Planning Core, refresh path, tunnel, domain, and Access untouched; cached state preserved and removable only via a separately confirmed scoped operation. Plan Global Constraints reinforce disabled-by-default and forbid launchd/deploy changes. Adequate.

## 9. Remaining Human Gates

Correctly preserved and not preempted by any task: pilot-binding selection, production credential creation/validation, live-provider validation, Human Owner walkthrough, push/deploy/release (brief Start Card; spec §16.5, §17; plan Task 9 acceptance and Primary Acceptance Protocol). Task 9's handoff update must restate these as pending; it does.

## Findings (all non-blocking)

### R5-DESIGN-001 — Mockup sample row order contradicts the approved queue/ledger precedence (minor)

- **Evidence:** `mockup/landing.html:437-450` lists the attention queue as Critical → Watch → Unknown, and the ledger (`landing.html:486-501`) as Critical → Watch → Unknown → Healthy. The spec §8 precedence is `critical → warning → unknown → watch → healthy`, brief matrix rows state warning sorts "before unknown/watch" and watch "after unknown", and spec §11.1 requires the ledger "sorted by attention precedence and then name".
- **Required correction:** none to the approved mockup (sample data is illustrative). Task 8 must implement spec/brief precedence ordering (unknown before watch), and Task 9 must document the mockup row order as an intentional sample-data deviation.
- **Verification:** Task 8's "exact precedence order" component tests assert the spec order; Task 9's screenshot comparison records the deviation with evidence.

### R5-DESIGN-002 — Brief contains one stale status line (documentation)

- **Evidence:** `brief.md:119` says "Formal design specification is pending final Human Owner review; no implementation or implementation plan is authorized yet", contradicting `brief.md:19` ("implementation authorized on 2026-09-11") and the spec header (`…-design.md:3`, "Approved for implementation by Human Owner on 2026-09-11").
- **Required correction:** update or remove the stale bullet at the next brief touch (Task 9 handoff/docs pass is an acceptable vehicle); no implementation impact.
- **Verification:** grep the brief for "pending final Human Owner review" after the touch; line gone or corrected.

### R5-DESIGN-003 — Mockup control sizing is below the plan's 44px coarse-pointer bar (minor)

- **Evidence:** `mockup/landing.html:185-194` (`.aj-open` padding 7px 9px, no min-height) and `mockup/project-detail.html:134-146` (`.aj-action` padding 7px 10px) yield touch targets under 44px; plan Task 8 requires "targets are at least 44px on coarse pointers".
- **Required correction:** none to the mockup; Task 8 styles real controls to ≥44px on coarse pointers even where that exceeds the mockup's literal padding.
- **Verification:** Task 8 component/Playwright checks on target size at 390px; Task 9 WCAG AA audit.

### R5-DESIGN-004 — Detail mockup shows a Railway US$ figure; label discipline must survive implementation (note)

- **Evidence:** `mockup/project-detail.html:358,384` render Railway usage as "US$6.38 · estimate"; plan Task 5 acceptance requires "never imply invoice-grade Fly or Railway cost".
- **Required correction:** none to design. Implementation must render the `billing_alignment` label verbatim from the snapshot (`provider_estimate`/`operational_only` for Railway) and never upgrade it to `exact` or a bare "cost".
- **Verification:** Task 5 fixture tests pin Railway billing alignment; Task 8 component tests assert the alignment label renders.

## Verdict

`PASS` — no blocking design findings. Spec, plan, mockups, pact graph, and existing seams are mutually consistent on every required review surface; the four findings above are recorded for Tasks 1–9 to honor and do not gate Task 1.
