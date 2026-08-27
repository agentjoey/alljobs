# AllJobs Planning Core V1 — Implementation Spec / T3 Brief

**Revision:** 1
**Status:** Approved — revision 1 approved for Task 0 and Task 1; production UI and legacy retirement remain blocked by the rendered Mockup Gate
**Date:** 2026-08-26
**Architecture baseline:** [`docs/superpowers/specs/2026-08-26-alljobs-federated-planning-core-design.md`](../../../docs/superpowers/specs/2026-08-26-alljobs-federated-planning-core-design.md)

## Start Card

```text
Workflow: 3.3
Task: Replace legacy AllJobs with the federated Roadmap / Backlog / Task planning core
Role: Primary Agent
Tier / 理由: T3 — greenfield routes and navigation, new data contracts and write paths, registration/archive flows, destructive retirement of the legacy product
Canonical record: .agent/frontend-design/planning-core-v1/brief.md (revision 1)
Branch / worktree: this revision is documentation-only on main; implementation MUST use an isolated branch and worktree, with production remaining on the legacy build until release approval
Mockup Gate: Required — new information architecture, project-type variants, responsive layouts, and consequential registration/archive actions
Review path: fresh-context independent Design Review before production UI; fresh-context independent Verification against the final candidate build; T3 should use different agents or harnesses
Human checkpoints: approve this brief revision; approve rendered mockup; approve any scope/risk change; approve the final candidate build and release/rollback decision
```

## Approval record

- **Decision:** Approved without revision.
- **Human Owner:** Joey.
- **Approved revision:** 1.
- **Approval date:** 2026-08-26.
- **Authorized next work:** Complete Task 0 repository gates and proceed to Task 1's non-production rendered mockup and independent Design Review.
- **Still blocked:** legacy-file deletion, production UI implementation, external repository changes, deployment, production mutation, and Task 2+ until the rendered Mockup Gate is explicitly approved.

Post-approval sequencing decision, 2026-08-26:

- the Human Owner chose to keep the retired application offline;
- the Human Owner authorized clearing the already-retired product assets before Task 1;
- the cleanup is limited to the exact recoverable manifest in `docs/retired-v0.1-manifest.md`;
- this decision does not authorize a replacement runtime, production UI, external repository change, deployment, or production mutation before the rendered Mockup Gate.

## Mockup Gate record

- **Candidate:** Paper Workbench revision 3 (pleurat.com-derived).
- **Prepared:** 2026-08-27 on `feature/planning-core-v1` in the isolated Planning Core worktree.
- **Human direction:** 2026-08-27 decision “全面转向 pleurat 风格”, superseding Star Atlas revision 2. All decorative atlas diagrams removed in favor of pure ledger lists plus provenance panels; light cream paper ground only; signature amber provenance status bar (`#status-strip`) binding route path, source custody, revision/digest, and freshness state to every consequential surface; hatch fill for external read-only custody and solid fill for native writable custody.
- **Enhancements approved:** Projects cards grid, Backlog expandable accordion drawers, Header universal search (`⌘K`), vertical Roadmap timeline, and Personal Portfolio Workbench Dashboard.
- **Independent review:** round 1 returned `PASS WITH FIXES` (25/36); rev2 closed functional findings; rev3 rebuilds the visual system to Paper Workbench with empirical pleurat tokens.
- **Human Gate disposition:** **APPROVED** by Human Owner on 2026-08-27 ("mockup gate 通过，进入下一步").
- **Authorization granted:** Proceed to Task 2 (clean application foundation and Next.js minimal shell).

## 1. Outcome

AllJobs becomes a personal, single-owner planning control plane for code-development and business-operation projects. It visualizes one coherent Project → Roadmap → Backlog/Task model while preserving source ownership:

- code Roadmap and Backlog stay in fixed repository documents and are read-only in AllJobs;
- business Milestones and native Tasks are maintained in AllJobs Markdown;
- Tasks may be external read-only objects or AllJobs-native writable objects;
- registration, archive, and restore are explicit Human-gated workflows;
- the current development machine remains the only Control Host;
- other computers contribute through the browser, Git pushes, or reviewed branch/patch handoff.

The first usable release must let the owner register and inspect one code project, create and manage one business project, see cross-project attention and Tasks, and archive/restore projects without duplicating external planning data.

## 2. Baseline → target

| Area | Baseline | Target |
|---|---|---|
| Product | v0.1 multi-project activity ledger with sample data | Planning Core V1 built from the approved federated model |
| Code planning | AllJobs-owned project/log Markdown | Repo-owned `docs/ROADMAP.md` and one `docs/BACKLOG.md`, read-only in AllJobs |
| Business planning | No first-class Milestone model | AllJobs-native Milestones and Tasks |
| Tasks | Legacy line-based task/log behavior | Stable section identity, per-object source ownership, digest-protected native writes |
| Registration | Seed files placed in `data/` | inspect → proposal digest → Human Gate → recheck/apply |
| Unbind | None | archive as non-destructive unbind; Human-gated restore |
| Deployment | One local Next server behind Tunnel and Access | Same host, domain, Tunnel, Access, port, and loopback boundary plus a bounded refresh worker |
| UI | Legacy routes and two retired visual directions | New Planning information architecture approved through a T3 rendered mockup |

## 3. Greenfield reset boundary

The legacy product is not a migration source. No compatibility parser, dual-read period, legacy seed import, or visual carry-over is permitted.

### 3.1 Preserve unchanged as infrastructure identity

- Cloudflare Tunnel identity and credentials outside the repository;
- production hostname `alljobs.agentjoey.ai` and its DNS route;
- Cloudflare Access application and allow policy;
- production origin port `3456`;
- loopback-only listener `127.0.0.1` and the rule that Tunnel is the only application ingress;
- the current development machine as the single Control Host;
- Git history, plus an annotated legacy-release tag created before tracked files are retired.

These assets are not recreated, rotated, deleted, or reconfigured by the Planning Core implementation.

### 3.2 Preserve as reviewed templates or reusable tooling

The following files may survive only after their contents are revalidated against this brief:

- `deploy/cloudflared-config.example.yml`;
- `deploy/com.agentjoey.cloudflared.plist`;
- `deploy/com.agentjoey.alljobs.plist`;
- `.gitignore`, `components.json`, build/lint/test configuration, and package-manager files;
- `scripts/shot.mjs` and any generic accessibility script that still passes against the new build;
- the managed Next.js and Pact instruction blocks in `AGENTS.md` / `CLAUDE.md`.

Keeping a file does not make its old product assumptions authoritative. Deployment prose, paths, scripts, dependencies, and agent instructions must be rewritten or removed when they refer to v0.1.

### 3.3 Retire from the replacement runtime

- all legacy routes and Server Actions under `app/`;
- all `components/workbench/` components and old visual tokens;
- all `lib/data/` readers, derivations, appenders, schemas, and tests;
- all legacy `data/projects/`, `data/tasks/`, and `data/log/` sample content;
- `PRODUCT.md`, `DESIGN.md`, `README.md`, `docs/architecture.md`, and `docs/operations.md` as v0.1 descriptions; these names may be recreated with Planning Core content;
- `.agent/CURRENT.md`, `.agent/BACKLOG.md`, `.agent/sprints/sprint-001.md`, and both legacy frontend-design evidence trees as active project state; only Git history retains them;
- all tests whose assertions describe the retired product.

The Human Owner explicitly authorized deletion of the exact retired-asset manifest before the rendered mockup because the retired application will remain offline. Cleanup is a recoverable Git deletion only; creating the replacement runtime, routes, or production UI remains blocked until the rendered Mockup Gate is approved.

## 4. Scope

### 4.1 Priority 1 — required for Planning Core V1

- Project type, work modes, registration status, operational status, priority, agents, execution locations, and tags;
- code-project fixed Roadmap and Backlog document contracts;
- business-project native Milestones;
- native Tasks for both project types;
- provider-neutral external Task projection and merging, with `git-markdown` delivering Roadmap and Backlog in V1;
- single-file, stable-section Markdown parsing with item-scoped `ProofIssue` isolation;
- digest-protected, locked, validated, atomic native writes;
- read-only Git bare mirrors, five-minute refresh, manual refresh, and stale provenance;
- trusted-root discovery, two-phase registration, archive, and restore;
- portfolio overview, project list/detail, cross-project Task surface, registration flow, and explicit Archived surface;
- project-local canonical `alljobs-planning` skill artifact and installation guidance for agents on other machines;
- single-Control-Host deployment and recovery documentation;
- one real code-project pilot and one explicitly created business-project pilot.

### 4.2 Priority 2 — schema seam only in this release

- KPI and Measure identifiers, definitions, manual-source placeholder, and relation to operational work;
- no KPI page, observation write UI, connector, credential, formula engine, scheduled ingestion, or automated reconciliation.

Priority 2 implementation requires a later approved brief. Planning Core V1 must not show non-functional KPI controls.

### 4.3 Explicitly out of scope

- databases, realtime collaboration, multi-user roles, and application-level authentication;
- active-active hosts, shared-filesystem writes, SSH writes, or a cross-machine native-write API;
- editing code-repository Roadmap, Backlog, or external Tasks from AllJobs;
- recursive workspace scanning, arbitrary filesystem paths, repository code execution, hooks, installs, merges, or checkouts;
- automatic priority, Roadmap, target-date, or KPI changes by agents;
- destructive project deletion;
- legacy data migration or runtime compatibility.

## 5. Runtime architecture and exact file boundaries

```text
app/
  layout.tsx
  globals.css
  page.tsx
  projects/page.tsx
  projects/[slug]/page.tsx
  tasks/page.tsx
  register/page.tsx
  archived/page.tsx
  actions/projects.ts
  actions/native-planning.ts
  actions/refresh.ts
components/
  planning/
  ui/
lib/planning/
  domain/
  markdown/
  native/
  providers/
  registry/
  queries/
  config.ts
  errors.ts
  paths.ts
data/
  projects/
  roadmaps/
  tasks/
  log/
config/alljobs.example.json
scripts/planning-refresh.ts
skills/alljobs-planning/
  SKILL.md
  references/
tests/fixtures/planning/
```

Production mutable provider state stays outside Git:

```text
~/.alljobs/
  config.json
  mirrors/<project>.git
  state/<project>.json
  locks/<project>.lock
  logs/
```

`ALLJOBS_HOME` may override `~/.alljobs` for tests and controlled recovery. Production `data/` stays in the single production checkout; tests must always inject a temporary data root and may never target production data.

## 6. Implementation contracts

### 6.1 Domain identity

- Native IDs are stable within a project and use explicit prefixes such as `AJ-T-021`.
- External IDs are namespaced as `<provider>:<source-id>`.
- Relations store stable IDs, never array offsets, headings, or line numbers.
- `backlog` and `roadmap_item` are mutually exclusive on Task.
- Derived Phase/work mode values are computed, never duplicated into a second mutable fact.
- Every normalized external object carries provider, remote/ref where applicable, resolved revision, document path, blob hash, and freshness.

The authoritative enum and relation rules are those in the architecture baseline. TypeScript and Zod must be derived from the same exported schema modules; UI code may not redeclare them.

### 6.2 Markdown parsing

- One Roadmap, Backlog, or Task document contains stable objects under level-two headings.
- The heading provides ID and title; the first fenced `yaml alljobs` block provides metadata; remaining Markdown is human context.
- Duplicate IDs, malformed YAML, missing fields, foreign relations, and dependency cycles yield object-scoped `ProofIssue` values.
- A malformed object does not hide healthy sibling objects.
- Document-level corruption that prevents section splitting produces one document issue and no fabricated objects.
- Parsers are pure: no filesystem writes, Git commands, environment reads, or network calls.

### 6.3 Native writes

Every native mutation must:

1. validate project registration and write permission;
2. acquire one project-scoped lock;
3. reread the canonical file;
4. compare the expected SHA-256 content digest;
5. edit only the target stable section;
6. validate the complete resulting document and relations;
7. write a temporary file in the same directory, flush it, and atomically rename it;
8. append a concise activity event after the canonical write succeeds;
9. release the lock in success and failure paths;
10. return a typed result and never silently retry a stale mutation.

Allowed result codes are `VALIDATION_ERROR`, `STALE_WRITE`, `NOT_FOUND`, `READ_ONLY_SOURCE`, `ARCHIVED_PROJECT`, `LOCKED`, and `FILESYSTEM_ERROR`. UI and agent tooling must use the same codes.

### 6.4 Provider refresh

- Page requests read only local native files and local mirrors.
- A single worker path serves scheduled and manual refresh.
- Git is invoked without a shell and with hooks disabled.
- Only the registered remote and `refs/heads/*` ref are fetched.
- The worker never checks out a worktree or executes repository content.
- One exact commit supplies all files in one projection.
- A successful refresh atomically records revision, blob hashes, validation summary, and time.
- A failed refresh retains the prior successful revision, marks it stale/unavailable, and cannot poison another project.

### 6.5 Registration, archive, and restore

All consequential project-binding flows are two-phase:

```text
read-only inspect/propose → proposalDigest → explicit Human confirmation
→ complete re-inspection → digest/precondition match → apply
```

`STALE_STATE` always performs zero canonical writes. Archive is the only V1 unbind and never deletes project/native/external objects. Restore revalidates trusted containment, identity, documents, schema, relations, collisions, and digest.

### 6.6 Agent skill

`skills/alljobs-planning/SKILL.md` is the canonical distributable instruction artifact. It must teach:

- code mode: update only the repository's fixed Roadmap/Backlog documents, by stable section and normal Git workflow;
- business mode: update only the AllJobs-native project files with digest protection when running on the Control Host;
- remote business mode: produce a reviewed branch or patch handoff and never claim an unperformed write;
- Human Gate boundaries for priority, order/focus, target dates, Done When meaning, KPI definitions, and external-to-native conversion;
- validation commands, exact result codes, diff reporting, and failure recovery.

Installation on another machine is an explicit, separately authorized step. The application never writes a skill into another repository or home directory.

## 7. Information architecture and journeys

Final composition and visual language remain subject to the Mockup Gate, but production routes and responsibilities are fixed for revision 1:

| Route | Responsibility | Writable actions |
|---|---|---|
| `/` | Portfolio focus, attention, current Roadmap items, due/waiting/blocked Tasks, source freshness | Navigate only |
| `/projects` | Active registered projects, type/work-mode/status/source filters | Open registration flow |
| `/projects/[slug]` | Project summary plus Roadmap, conditional Backlog, Tasks, provenance, issues | Native Milestone/Task mutations; refresh; archive proposal |
| `/tasks` | Cross-project native and external Task queue | Native Task create/update only |
| `/register` | Candidate inspection, proposal, collision/error review, explicit confirmation | Registration apply after digest recheck |
| `/archived` | Archived projects and retained history | Restore proposal/apply |

Project type changes visible behavior:

- code detail shows Phase Roadmap, read-only Backlog, native/external Tasks, and source provenance;
- business detail shows Milestone Roadmap and native/external Tasks, and never renders Backlog creation or an empty Backlog tab;
- archived detail is read-only except for restore.

Critical journeys:

1. register a valid code project from a trusted direct-child candidate;
2. inspect its external Phase/Backlog projection and provenance;
3. create a native operational Task on that code project;
4. create a business project, Milestone, and bound Task;
5. encounter a stale-write conflict, reread, and retry intentionally;
6. see a failed Git refresh retain stale last-known external data;
7. archive a project with active-work warning and restore it after revalidation;
8. use core read and native-Task flows at desktop, intermediate, and mobile widths with keyboard only.

## 8. State matrix

The rendered mockup and final build must cover every applicable row. “Feedback/recovery” must be visible text, not color alone.

| State | Surface | Required feedback and recovery |
|---|---|---|
| Loading | every route and refreshable projection | stable skeleton matching final geometry; refresh retains existing content |
| Empty portfolio | `/` | explain that no projects are registered; link to registration |
| Empty project list/filter | `/projects` | distinguish no projects from no filter matches; clear-filter action |
| Empty Roadmap | project detail | explain required source/native next action; no invented progress |
| Empty Tasks | project detail, `/tasks` | distinguish no Tasks from filtered-out Tasks; native create only when permitted |
| Registration candidate found | `/register` | show canonical path, identity, source, document summary |
| Proposal ready | `/register` | summarize all writes and warnings; explicit confirmation |
| Collision | `/register` | identify slug/source/provider collision; no apply control |
| Stale proposal | register/archive/restore | `STALE_STATE`; reread/recreate proposal |
| Registered | project list/detail | success announcement and canonical project link |
| Archive warning | project detail | active Tasks, unresolved references, affected surfaces; explicit confirmation |
| Archived | `/archived`, archived detail | read-only history and restore action |
| Restore blocked | `/archived` | precise containment/source/schema/collision cause; no apply |
| Source not configured | code detail | identify missing binding and registration/remediation path |
| Source document missing | code detail | identify exact fixed path; link to skill-guided repository fix |
| Healthy external read | code detail | revision and freshness provenance available without dominating the main view |
| Partial external validity | code detail | healthy items remain; item-scoped issue list with file/ID/field |
| Source unavailable | project/detail/overview | retain last success if present; error time and retry |
| Stale external data | project/detail/overview | stale badge, last success, failed attempt, manual refresh |
| Native validation failure | forms | field/section errors, focus first invalid field, preserve input |
| Native write pending | forms | disable duplicate submit; retain navigation escape where safe |
| Native write success | forms | visible and screen-reader announcement; updated digest/state |
| Stale-write conflict | forms | preserve attempted input, explain newer content, reread action |
| Filesystem failure | forms | no success claim; safe retry after canonical reread |
| Read-only external object | item detail | source/provenance and no misleading edit control |
| Unsupported provider | project detail | provider identity and remediation; other projects remain healthy |
| Waiting Task | task surfaces | waiting party/event and follow-up date |
| Blocked Task | task surfaces | blocking reason and attention treatment |
| Cancelled/done history | detail/history | visually distinct, excluded from active progress, still inspectable |
| Permission/Access failure | production entry | Cloudflare Access owns authentication; application must not imitate an auth form |
| Disabled action | archived/read-only/invalid proposal | reason adjacent to control; keyboard and screen-reader semantics |

## 9. Responsive, accessibility, and interaction requirements

- Supported evidence widths: desktop `1440`, intermediate `900`, mobile `390` using real device emulation rather than Chrome's 500 px CLI minimum.
- Desktop may use persistent project context and dense planning tables; mobile must recompose hierarchy into readable sections and explicit action menus rather than horizontally shrinking tables.
- Every action is keyboard reachable; drag-and-drop, if proposed, must have a non-drag alternative and cannot be the only ordering mechanism.
- Focus moves to validation summaries, confirmation headings, or updated content as appropriate; destructive confirmation returns focus predictably on cancel.
- Dynamic results and write outcomes use restrained `aria-live` announcements.
- Text contrast is at least 4.5:1, large text and meaningful non-text boundaries at least 3:1; status never relies on color alone.
- Reduced motion disables non-essential transitions; content is never motion-gated.
- Loading layout must not cause major cumulative layout shift.
- Registration/archive/restore confirmation must name the project and effect in text; no generic “Are you sure?” dialog.

## 10. Design direction and Mockup Gate

The old “Working Ledger” and Apple HIG redesign are retired evidence, not candidate directions. The new direction must be shaped from the Planning Core's actual jobs:

- portfolio-level scanning must be calm and information-dense;
- hierarchy and source ownership must be legible before decoration;
- Phase/Milestone, Backlog, and Task must be distinguishable without turning every row into an identical card;
- read-only external objects and writable native objects need a quiet but unambiguous provenance language;
- the design must include one deliberate signature element tied to planning/navigation, not generic glass, gradient, oversized metrics, or decorative card repetition.

Before production UI begins, the Primary Agent must create a rendered mockup in `.agent/frontend-design/planning-core-v1/mockup/` covering:

- portfolio overview;
- code-project detail with Roadmap, Backlog, native/external Tasks, provenance, and partial-validity state;
- business-project detail with Milestones and Tasks and no Backlog affordance;
- registration proposal/collision/stale state;
- archive warning and archived/restore state;
- desktop, intermediate, mobile, dark/light if both are proposed, and reduced-motion behavior.

An independent Design Review must evaluate Usefulness, Clarity, Efficiency, Consistency, Brand fit, Accessibility, Responsive robustness, Performance, and Appropriate delight. Human approval applies to the rendered revision, not merely this text.

## 11. Acceptance criteria

### Functional and integrity

1. The replacement build has no import, route, parser, runtime read, or test dependency on retired v0.1 product files.
2. One real code repository is projected from fixed Roadmap/Backlog files without an AllJobs-owned duplicate.
3. One business project can create and maintain Milestones and Tasks entirely in AllJobs.
4. Native and external Tasks merge without identity collision; external objects remain read-only.
5. Malformed sections isolate their own failures and preserve healthy siblings.
6. All relation, dependency-cycle, and project-type rules fail closed.
7. Stale writes, lock conflicts, validation failures, and filesystem failures never overwrite canonical content or claim success.
8. Registration inspect performs zero writes/network/execution; stale apply returns `STALE_STATE` with zero canonical writes.
9. Archive stops active provider reads and native writes without deletion; restore revalidates every binding and relation precondition.
10. Page rendering performs zero network fetches and every external projection comes from one exact mirror revision.
11. Failed refresh preserves the last successful projection and cannot invalidate another project.
12. Planning pushed from another computer appears after refresh; unpushed work remains intentionally invisible.

### Experience and accessibility

13. All state-matrix rows that apply to a route have visible, actionable, keyboard-accessible treatment.
14. Business projects never show a Backlog create affordance; code external objects never show native edit controls.
15. The eight critical journeys pass at required viewport and input modes.
16. Automated accessibility checks report zero serious/critical violations; manual keyboard, focus, contrast, and reduced-motion checks pass.
17. Final screenshots come from the exact build independently verified and proposed for release.

### Operations and release

18. Production still binds `127.0.0.1:3456`; unauthenticated public access is intercepted by the existing Access application.
19. The existing Tunnel/domain/Access configuration is reused without credential or DNS mutation.
20. The refresh worker is single-instance, lock-safe, restartable, and cannot run candidate code or hooks.
21. A Control Host recovery rehearsal proves stop-old-before-start-new and restores native data, provider bindings, provenance, and Access boundaries.
22. The annotated legacy tag rebuilds successfully and the documented whole-release rollback does not mix schemas.

## 12. Verification and evidence

Required checks, in order:

1. unit and property-oriented parser/schema/relation tests;
2. native-store integration tests using temporary roots, injected write failures, locks, and digest conflicts;
3. provider/registration/archive/restore integration tests with local bare Git fixtures and command-spy assertions;
4. Server Action and component tests for typed results and state feedback;
5. production build, lint, typecheck, and complete test suite;
6. critical-journey browser tests against a local candidate server;
7. independent keyboard, focus, contrast, accessibility, responsive, and reduced-motion audit;
8. final desktop/intermediate/mobile screenshots from the repaired final candidate;
9. owner walkthrough and explicit release approval;
10. post-release localhost, Access redirect, authenticated page, worker, and stale-source smoke checks.

Evidence is written to `.agent/frontend-design/planning-core-v1/verification.md`; screenshots go under `verify-screens/`. The Verification Agent must identify the exact target commit and build. Any material implementation/mockup divergence reopens this brief.

## 13. Rollback and release triggers

Rollback is mandatory when any of these occurs after cutover:

- loopback binding or Access boundary is absent;
- native data is corrupted, lost, or written without digest/lock validation;
- registration/archive/restore produces an unapproved write;
- provider refresh executes candidate code/hooks or replaces last-known-good data with failure;
- core project/task pages cannot complete the verified journeys;
- the running build differs from the verified commit.

Rollback stops the replacement app and refresh worker, restores the tagged legacy commit, installs its locked dependencies, rebuilds, and restarts the app on the same loopback port. The Tunnel, DNS route, and Access policy remain running and unchanged. Replacement native data is preserved for diagnosis and is never fed to the legacy parser.

## 14. Human decisions

Completed gate:

- Brief revision 1 approved without revision on 2026-08-26.
- Retired application accepted offline and exact-manifest cleanup authorized on 2026-08-26.

Remaining gates:

1. approve one rendered mockup revision after independent Design Review;
2. name the real code-project pilot and create/approve the real business-project pilot during implementation;
3. approve the final candidate commit, cutover window, and whole-release rollback readiness.

Decision 1 was approved on 2026-08-26. The next binding Human Gate is approval of the rendered Task 1 mockup. Until that decision is explicit, no legacy-file deletion, production UI implementation, external repository change, deployment change, or production mutation is authorized.
