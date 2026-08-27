# AllJobs Federated Planning Core Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the retired AllJobs v0.1 product with the approved federated Roadmap / Backlog / Task planning core while preserving the existing Tunnel, hostname, Access policy, Control Host, port, and loopback-only security boundary.

**Architecture:** Keep AllJobs-native Project, business Roadmap, Task, and Activity data in validated Markdown on the single Control Host. Read code-project Roadmap and Backlog from fixed files in managed read-only bare Git mirrors. Route every consequential binding operation through digest-protected propose/apply, and every native mutation through a project lock plus digest-checked atomic replacement. Render local state only; a single worker owns all network refresh.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript 5, Tailwind 4, shadcn/ui radix-nova, Zod 4, gray-matter, YAML, Vitest 4, Testing Library, Playwright, local Git CLI, launchd, Cloudflare Tunnel and Access.

**Spec:** [`.agent/frontend-design/planning-core-v1/brief.md`](../../../.agent/frontend-design/planning-core-v1/brief.md), backed by [`docs/superpowers/specs/2026-08-26-alljobs-federated-planning-core-design.md`](../specs/2026-08-26-alljobs-federated-planning-core-design.md)

## Global Constraints

- Brief revision 1 was approved on 2026-08-26. The Human Owner also accepted the retired application remaining offline and authorized exact-manifest legacy cleanup before Task 1. Current authorization covers Task 0, Task 0A cleanup, and Task 1's non-production rendered mockup; stop before replacement-runtime work in Task 2 until the rendered Mockup Gate is approved.
- The task is T3. The rendered Mockup Gate, independent Design Review, independent final Verification, owner walkthrough, and release approval cannot be self-waived.
- Implementation uses an isolated branch/worktree with its own real `node_modules`. By explicit Human Owner decision, the retired service remains offline and the old product is absent from the current tree; only the immutable rollback tag retains it.
- Do not change or recreate the existing Cloudflare Tunnel, `alljobs.agentjoey.ai` DNS route, Access application/policy, or credentials.
- Preserve `next start -p 3456 -H 127.0.0.1`. No preview server may bind `0.0.0.0` or attach to the production Tunnel.
- Before editing Next.js code, read `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `forms.md`, and `01-app/03-api-reference/06-cli/next.md` from the implementation worktree.
- Use `apply_patch` for intentional file edits. Do not bulk-delete by an unresolved glob; compare the exact retirement manifest with `git ls-files` first.
- Tests inject temporary `ALLJOBS_HOME` and data roots. They must reject the production checkout and `~/.alljobs` as test targets.
- No parser, compatibility branch, test, route, or runtime import from the retired v0.1 product may survive.
- No page render or Server Action performs an inline network fetch. Manual refresh enqueues or invokes the same bounded worker path.
- External planning objects are never editable in AllJobs and never copied into AllJobs-native Markdown.
- Every task ends with its focused checks and a small commit. A failing check is fixed or explicitly waived by the Human Owner; it is never described as passing.

---

## Task 0: Human Gate, legacy anchor, and isolated worktree

**Files:**

- Modify: `.agent/frontend-design/planning-core-v1/brief.md`
- Create: `.agent/frontend-design/planning-core-v1/handoff.md`

- [x] **Obtain explicit approval of Brief revision 1**

Record the Human Owner decision, date, approved revision, and allowed next action in the brief. If the owner changes scope, mark the brief `Reopened`, revise it, and obtain approval again.

- [x] **Confirm the current production baseline and decide service disposition**

Run in the current production checkout:

```bash
git status --short --branch
npm test
npm run build
curl -fsS http://127.0.0.1:3456/ >/dev/null
```

Expected: clean tracked state, legacy tests/build pass, and the current local origin responds. If the production checkout is dirty, stop and resolve ownership of the changes before continuing.

Execution note, 2026-08-26: source baseline passed (`75/75` tests and official webpack production build), but `127.0.0.1:3456` refused connections and no AllJobs LaunchAgent was loaded. The Human Owner explicitly accepted the retired service remaining offline during the rebuild.

- [x] **Create a recoverable legacy tag**

```bash
legacy_sha="$(git rev-parse HEAD)"
git tag -a archive/v0.1.0-retired "$legacy_sha" -m "Retired AllJobs v0.1 before Planning Core greenfield rebuild"
git show --no-patch --decorate archive/v0.1.0-retired
```

Expected: the annotated tag resolves to the exact verified legacy commit. Do not move this tag later.

- [x] **Create an isolated implementation worktree**

```bash
git worktree add ../alljobs-planning-core-v1 -b feature/planning-core-v1 main
cd ../alljobs-planning-core-v1
npm ci
git status --short --branch
```

Expected: branch `feature/planning-core-v1`, clean worktree, and a real local `node_modules` directory.

- [x] **Write the handoff record**

Record the approved brief revision, legacy tag/SHA, production checkout path, implementation worktree path, branch, current commit, commands run, and the next safe action in `.agent/frontend-design/planning-core-v1/handoff.md`.

- [x] **Commit the gate record**

```bash
git add .agent/frontend-design/planning-core-v1/brief.md .agent/frontend-design/planning-core-v1/handoff.md
git commit -m "docs: approve planning core implementation brief"
```

## Task 0A: Retire the exact legacy-product manifest

**Files:**

- Create: `docs/retired-v0.1-manifest.md`
- Delete: exactly the 147 tracked paths enumerated by that manifest
- Modify: `.agent/CURRENT.md`
- Modify: `.agent/BACKLOG.md`
- Modify: `.agent/frontend-design/planning-core-v1/handoff.md`

- [x] **Verify the source commit, rollback tag, count, and manifest digest**

The sorted `git ls-files` result must contain 147 paths and hash to `3083dc0ec67c9e9678f8a0e24e843a676455209661cc13a8199c7f8c4c1056cd`. The immutable rollback tag must resolve to `d69b70c630234e0480e952ef892aea638202a058`.

- [x] **Delete only the reviewed manifest**

Use Git-aware deletion with the exact manifest roots. Do not delete Planning Core records, deployment/Tunnel assets, repository configuration, package locks, Pact state, generic screenshot tooling, or Git history.

- [x] **Prove absence and preservation**

Verify all 147 paths are absent from the feature tree, every preserved path in the manifest remains present, `git diff --check` passes, and no untracked legacy copy remains.

- [x] **Commit the recoverable cleanup**

Commit the manifest, decision records, and exact deletions together. Do not create a replacement `app/`, `data/`, product document, route, or UI in this commit.

## Task 1: T3 rendered mockup and design approval

**Files:**

- Create: `.agent/frontend-design/planning-core-v1/mockup/index.html`
- Create: `.agent/frontend-design/planning-core-v1/mockup/styles.css`
- Create: `.agent/frontend-design/planning-core-v1/mockup/app.js`
- Create: `.agent/frontend-design/planning-core-v1/mockup-review.md`
- Create: `.agent/frontend-design/planning-core-v1/mockup-screens/*.png`
- Modify: `.agent/frontend-design/planning-core-v1/brief.md`

- [x] **Shape the experience with the required design skill**
- [x] **Build the standalone mockup before production UI**
- [x] **Verify responsive and reduced-motion mockup behavior**
- [x] **Run independent Design Review**
- [x] **Stop for Human Mockup Gate**
- [x] **Commit approved mockup evidence**

```bash
git add .agent/frontend-design/planning-core-v1
git commit -m "design: approve planning core T3 mockup"
```

## Task 2: Create the clean application foundation after Mockup approval

**Files:**

- Verify: `docs/retired-v0.1-manifest.md`
- Recreate: `app/layout.tsx`
- Recreate: `app/page.tsx`
- Recreate: `app/globals.css`
- Recreate: `PRODUCT.md`
- Recreate: `DESIGN.md`
- Recreate: `README.md`
- Recreate: `docs/architecture.md`
- Recreate: `docs/operations.md`
- Modify: `AGENTS.md`
- Modify: `.agent/CURRENT.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.mts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `tests/smoke/app-shell.test.tsx`

- [x] **Verify the completed retirement manifest before creating new runtime files**
- [x] **Write a failing foundation smoke test**
- [x] **Create only the approved minimal shell**
- [x] **Install only the approved foundation dependencies**
- [x] **Rewrite active docs and agent context**
- [x] **Make the smoke test pass and prove legacy absence**
- [x] **Commit the greenfield foundation**

## Task 3: Define one canonical domain and relation validator

**Files:**

- Create: `lib/planning/domain/schemas.ts`
- Create: `lib/planning/domain/types.ts`
- Create: `lib/planning/domain/relations.ts`
- Create: `lib/planning/errors.ts`
- Create: `lib/planning/domain/schemas.test.ts`
- Create: `lib/planning/domain/relations.test.ts`

- [x] **Write failing schema tests for every enum and cross-field rule**
- [x] **Implement schemas and inferred types**
- [x] **Implement normalized validation output**
- [x] **Run focused and full static checks**
- [x] **Commit domain contracts**

## Task 4: Build pure stable-section Markdown parsers

**Files:**

- Create: `lib/planning/markdown/section-document.ts`
- Create: `lib/planning/markdown/roadmap.ts`
- Create: `lib/planning/markdown/backlog.ts`
- Create: `lib/planning/markdown/tasks.ts`
- Create: `lib/planning/markdown/render.ts`
- Create: `lib/planning/markdown/*.test.ts`
- Create: `tests/fixtures/planning/code-valid/docs/ROADMAP.md`
- Create: `tests/fixtures/planning/code-valid/docs/BACKLOG.md`
- Create: `tests/fixtures/planning/code-partial/docs/ROADMAP.md`
- Create: `tests/fixtures/planning/code-partial/docs/BACKLOG.md`
- Create: `tests/fixtures/planning/native/roadmap.md`
- Create: `tests/fixtures/planning/native/tasks.md`

- [x] **Write failing parser tests**
- [x] **Implement section splitting and fenced-block parsing**
- [x] **Implement targeted rendering**
- [x] **Run parser and domain suites**
- [x] **Commit parsers and fixtures**

## Task 5: Implement digest-protected atomic native storage

**Files:**

- Create: `lib/planning/native/digest.ts`
- Create: `lib/planning/native/lock.ts`
- Create: `lib/planning/native/store.ts`
- Create: `lib/planning/native/activity.ts`
- Create: `lib/planning/native/store.test.ts`
- Create: `lib/planning/paths.ts`
- Create: `data/projects/.gitkeep`
- Create: `data/roadmaps/.gitkeep`
- Create: `data/tasks/.gitkeep`
- Create: `data/log/.gitkeep`

- [x] **Write failing integration tests in temporary directories**
- [x] **Implement canonical path resolution and production-root guard**
- [x] **Implement locks, digests, and atomic replacement**
- [x] **Make the store tests pass**
- [x] **Commit native storage**

## Task 6: Add Control Host config, safe Git mirrors, and the refresh worker

**Files:**

- Create: `config/alljobs.example.json`
- Create: `lib/planning/config.ts`
- Create: `lib/planning/providers/contracts.ts`
- Create: `lib/planning/providers/git-runner.ts`
- Create: `lib/planning/providers/git-markdown.ts`
- Create: `lib/planning/providers/refresh.ts`
- Create: `lib/planning/providers/*.test.ts`
- Create: `scripts/planning-refresh.ts`

- [x] **Write failing config and Git-runner tests**
- [x] **Implement a no-shell Git command boundary**
- [x] **Write failing projection/refresh tests with local bare repositories**
- [x] **Implement `git-markdown` and refresh state**
- [x] **Implement one worker entry point**
- [x] **Run provider checks**
- [x] **Commit provider infrastructure**

```bash
git add config lib/planning/providers lib/planning/config.ts scripts/planning-refresh.ts package.json package-lock.json
git commit -m "feat: add safe git planning refresh"
```

## Task 7: Implement registration, archive, and restore state machines

**Files:**

- Create: `lib/planning/registry/inspect.ts`
- Create: `lib/planning/registry/proposal.ts`
- Create: `lib/planning/registry/apply.ts`
- Create: `lib/planning/registry/archive.ts`
- Create: `lib/planning/registry/restore.ts`
- Create: `lib/planning/registry/*.test.ts`
- Create: `lib/planning/native/project-file.ts`

- [x] **Write failing read-only inspect tests**
- [x] **Define canonical proposal hashing**
- [x] **Write failing apply/idempotency/collision tests**
- [x] **Implement registration apply**
- [x] **Write failing archive/restore tests**
- [x] **Implement archive and restore**
- [x] **Run registry suites**
- [x] **Commit lifecycle state machines**

```bash
git add lib/planning/registry lib/planning/native/project-file.ts
git commit -m "feat: add human-gated project lifecycle"
```

## Task 8: Build projections, derived attention, and typed Server Actions

**Files:**

- Create: `lib/planning/queries/project.ts`
- Create: `lib/planning/queries/portfolio.ts`
- Create: `lib/planning/queries/tasks.ts`
- Create: `lib/planning/queries/attention.ts`
- Create: `lib/planning/queries/*.test.ts`
- Create: `app/actions/action-result.ts`
- Create: `app/actions/projects.ts`
- Create: `app/actions/native-planning.ts`
- Create: `app/actions/refresh.ts`
- Create: `app/actions/*.test.ts`

- [x] **Write failing projection tests**
- [x] **Implement read models without secondary persistence**
- [x] **Write failing Server Action tests**
- [x] **Implement minimal Server Actions**
- [x] **Run query/action suites**
- [x] **Commit application service layer**

```bash
git add lib/planning/queries app/actions
git commit -m "feat: compose planning projections and actions"
```

## Task 9: Create and validate the `alljobs-planning` agent skill

**Required skill while implementing:** `skill-creator`

**Files:**

- Create: `skills/alljobs-planning/SKILL.md`
- Create: `skills/alljobs-planning/references/code-project.md`
- Create: `skills/alljobs-planning/references/business-project.md`
- Create: `skills/alljobs-planning/references/contracts.md`
- Create: `skills/alljobs-planning/examples/ROADMAP.md`
- Create: `skills/alljobs-planning/examples/BACKLOG.md`
- Create: `skills/alljobs-planning/examples/TASKS.md`
- Create: `scripts/validate-planning-skill.mjs`
- Create: `scripts/validate-planning-skill.test.ts`
- Modify: `README.md`
- Modify: `package.json`

- [x] **Use `skill-creator` and write failing contract tests first**
- [x] **Author the concise skill and scoped references**
- [x] **Add validation command**
- [x] **Document multi-machine installation without performing it**
- [x] **Run skill and parser checks**
- [x] **Commit the skill artifact**

## Task 10: Implement the approved shell, overview, and project list

**Required skills:** `impeccable`, `shadcn`

**Files:**

- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `app/page.tsx`
- Create: `app/loading.tsx`
- Create: `app/projects/page.tsx`
- Create: `app/projects/loading.tsx`
- Create: `components/planning/app-shell.tsx`
- Create: `components/planning/primary-nav.tsx`
- Create: `components/planning/portfolio-overview.tsx`
- Create: `components/planning/project-list.tsx`
- Create: `components/planning/state-panel.tsx`
- Create: `components/planning/source-status.tsx`
- Create: `components/planning/*.test.tsx`
- Add via reviewed shadcn CLI: `components/ui/*` needed by the approved mockup

- [x] **Inspect the configured component registry before adding components**
- [x] **Write failing UI tests for overview and project list**
- [x] **Implement server-first routes and approved responsive composition**
- [x] **Verify focused UI behavior**
- [x] **Compare against approved mockup**
- [x] **Commit the first production surfaces**

```bash
git add app components
git commit -m "feat: add planning overview and project list"
```

## Task 11: Implement project detail, Tasks, registration, archive, and restore UI

**Required skills:** `impeccable`, `shadcn`

**Files:**

- Create: `app/projects/[slug]/page.tsx`
- Create: `app/projects/[slug]/loading.tsx`
- Create: `app/tasks/page.tsx`
- Create: `app/tasks/loading.tsx`
- Create: `app/register/page.tsx`
- Create: `app/archived/page.tsx`
- Create: `components/planning/project-detail.tsx`
- Create: `components/planning/roadmap-view.tsx`
- Create: `components/planning/backlog-view.tsx`
- Create: `components/planning/task-list.tsx`
- Create: `components/planning/native-task-form.tsx`
- Create: `components/planning/business-roadmap-form.tsx`
- Create: `components/planning/registration-flow.tsx`
- Create: `components/planning/archive-flow.tsx`
- Create: `components/planning/restore-flow.tsx`
- Create: `components/planning/provenance-panel.tsx`
- Create: matching `*.test.tsx` files

- [x] **Write failing project-variant tests**
- [x] **Implement project detail and cross-project Tasks**
- [x] **Write failing consequential-flow tests**
- [x] **Implement registration/archive/restore UI as two-phase flows**
- [x] **Run focused UI and action tests**
- [x] **Capture comparison screenshots and commit**

```bash
git add app components
git commit -m "feat: add planning management journeys"
```

## Task 12: Complete state matrix, accessibility, and critical-journey E2E

**Files:**

- Create: `tests/e2e/planning-core.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `.agent/frontend-design/planning-core-v1/verification.md`
- Create: `.agent/frontend-design/planning-core-v1/review-packet.md`
- Create: `.agent/frontend-design/planning-core-v1/verify-screens/*.png`
- Modify: affected `app/**`, `components/planning/**`, and `app/globals.css`

- [x] **Create deterministic E2E fixtures in a temporary runtime root**
- [x] **Write the eight critical journeys before claiming UI completion**
- [x] **Add automated accessibility assertions**
- [x] **Run the full local candidate**
- [x] **Perform manual state-matrix and responsive audit**
- [x] **Use `$impeccable polish` and capture final-build evidence**
- [x] **Prepare independent review packet**
- [x] **Commit the verified candidate changes**

```bash
git add tests app components .agent/frontend-design/planning-core-v1
git commit -m "test: verify planning core critical journeys"
```

## Task 13: Finish worker deployment, operations, and recovery

**Files:**

- Create: `deploy/com.agentjoey.alljobs-refresh.plist`
- Modify: `deploy/com.agentjoey.alljobs.plist`
- Verify unchanged or minimally clarify: `deploy/cloudflared-config.example.yml`
- Verify unchanged or minimally clarify: `deploy/com.agentjoey.cloudflared.plist`
- Rewrite: `docs/deployment.md`
- Modify: `docs/operations.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`
- Create: `scripts/verify-deployment-config.mjs`
- Create: `scripts/verify-deployment-config.test.ts`

- [x] **Write failing deployment-invariant tests**
- [x] **Implement the refresh LaunchAgent**
- [x] **Rewrite deployment and operations docs**
- [x] **Run deployment verification**
- [x] **Commit deployment readiness**

```bash
git add deploy docs README.md scripts/verify-deployment-config.mjs scripts/verify-deployment-config.test.ts
git commit -m "docs: define planning core deployment and recovery"
```

## Task 14: Pilots, independent verification, owner approval, and cutover

**Files:**

- Modify: `.agent/frontend-design/planning-core-v1/verification.md`
- Modify: `.agent/frontend-design/planning-core-v1/handoff.md`
- Modify: `.agent/CURRENT.md`
- Modify: `AGENTS.md`
- Modify: `README.md`, `PRODUCT.md`, `DESIGN.md`, `docs/architecture.md`, `docs/deployment.md`, `docs/operations.md` only if pilot evidence exposes a real mismatch

- [ ] **Run the code-project pilot without mutating its repository**

The Human Owner names the pilot. Inspect/propose first. Verify its fixed documents through normal Git history, register only after explicit approval, refresh the mirror, and demonstrate exact revision/provenance, partial-failure isolation, and native operational Task coexistence. Initializing or repairing the pilot documents is a separate Human-gated branch in that repository.

- [ ] **Run the business-project pilot**

The Human Owner explicitly creates/approves the pilot Project. Demonstrate Milestone and native Task create/update, digest conflict recovery, activity log, business no-Backlog behavior, archive warning, archive, and restore.

- [ ] **Freeze the candidate and run the complete suite again**

```bash
git status --short --branch
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
node scripts/verify-deployment-config.mjs
npm run planning:skill:validate
```

Expected: clean tracked state before/after checks and all commands pass. Record the exact commit SHA and evidence.

- [ ] **Obtain independent Design Review and Verification**

Use fresh contexts and preferably different agents/harnesses. Review receives the brief/mockup/target diff/evidence; Verification independently runs the release-blocking checks and critical journeys. All findings are fixed, proved not applicable, or explicitly decided by the Human Owner. Any fix creates a new candidate commit and invalidates earlier final screenshots/check evidence for affected areas.

- [ ] **Perform owner walkthrough and release decision**

The owner personally checks the eight critical journeys, mobile/desktop presentation, code/business differences, source ownership, registration/archive consequences, and rollback readiness. Record explicit approval bound to the final brief revision and commit.

- [ ] **Cut over without changing Tunnel/domain/Access**

On the Control Host:

1. back up current replacement native `data/` and `~/.alljobs/config.json`/state metadata;
2. stop the legacy app LaunchAgent;
3. merge the accepted branch to `main` through the repository's approved integration path;
4. run `npm ci`, the complete release checks, and `npm run build` in the production checkout;
5. install/load the refresh LaunchAgent and reload the application LaunchAgent;
6. leave cloudflared, DNS, Access, and credentials unchanged.

- [ ] **Run production smoke checks**

```bash
curl -fsS http://127.0.0.1:3456/ >/dev/null
curl -sS -o /dev/null -w "%{http_code}\n" https://alljobs.agentjoey.ai/
launchctl list | rg "com\.agentjoey\.(alljobs|alljobs-refresh|cloudflared)"
```

Expected: localhost responds; unauthenticated public request is intercepted by Access rather than exposing application content; all three services are present. Then complete one authenticated read, one bounded refresh, and one disposable native Task write/read/update with owner approval.

- [ ] **Rollback immediately on a Brief §13 trigger**

Stop replacement app and worker, preserve replacement native data for diagnosis, switch the clean production checkout to `archive/v0.1.0-retired`, run `npm ci && npm run build`, and restart only the legacy app. Do not feed replacement `data/` to the legacy runtime. Keep Tunnel/domain/Access unchanged.

- [ ] **Finalize durable records**

Update `.agent/CURRENT.md` with released version, final commit, checks, live architecture, known limits, rollback tag, and next safe action. Update `AGENTS.md` commands/counts from actual final evidence. Commit the record; do not write estimated test counts.

```bash
git add .agent/CURRENT.md .agent/frontend-design/planning-core-v1 AGENTS.md README.md PRODUCT.md DESIGN.md docs
git commit -m "chore: record planning core v1 release"
```

## Deferred Priority 2 Plan

KPI/Measure implementation is not hidden inside this plan. After Planning Core V1 has real operational usage, create a separate T3/T2 brief (depending on surfaces and data sensitivity) for manual observations first. Any connector, formula, scheduled ingestion, credential, reconciliation, or automated decision requires its own architecture and Human Gate.
