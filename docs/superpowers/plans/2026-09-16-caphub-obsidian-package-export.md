# Caphub P4 Obsidian Projection and Capability Package Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a disabled-by-default, deterministic path from exact approved Registry records to a neutral Capability Package, Obsidian projection, Codex/Claude/Hermes previews, and separately approved fixture publish/rollback without touching any real Vault or Agent directory.

**Architecture:** Preserve PostgreSQL Registry as the only authority. Separate immutable snapshot, pure render, bounded plan/diff, and gated apply. Release approval and Deployment approval are distinct exact-version decisions. Obsidian pages preserve one marked human block byte-for-byte; target publication writes immutable version directories and changes only an atomic pointer.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, PostgreSQL 17, Node.js filesystem/crypto, YAML, Vitest/Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-caphub-obsidian-package-export-design.md`

## Global Constraints

- Work only in an isolated worktree and a `codex/` branch. Never modify, stash, reset, restore, stage, or delete Human-owned files in the main checkout.
- Run the repository `AGENTS.md` startup before implementation: pull the selected clean base and read `.agent/CURRENT.md`.
- The retired `FRONTEND-DESIGN-WORKFLOW.md` is not part of P4. Reuse the existing Paper Workbench; do not create a new frontend design gate.
- Use TDD for every feature or defect. Use BDD for behavior that crosses PostgreSQL, service, filesystem, or browser boundaries.
- Keep implementation reviews and tests scoped: direct tests per task, one final full phase gate, one scoped independent Review, and one scoped independent Verification. Fixes receive only affected reruns and targeted re-review.
- Do not edit the checksum-bound bodies of `001_registry.sql` or `002_read_models.sql`; all database evolution is forward-only in `003_exports.sql`.
- Automated writes are allowed only under freshly created sentinel-owned temporary roots. Never configure or write a real Obsidian Vault, `$CODEX_HOME`, `.claude/skills`, `~/.hermes/skills`, production package repository, or production database.
- Do not call a model/provider, install a capability, execute generated commands, invoke Git from application code, push, open/merge a PR, merge to `main`, tag, release, deploy, restart services, or switch traffic.
- Do not expose absolute roots, secrets, SQL details, or raw internal errors through browser DTOs, logs, ReviewPackets, manifests, or screenshots.
- Stop at Gate P4-A, P4-B, or P4-C for any real root, dry run, adapter approval, publish, or rollback. Standing authorization does not replace these gates.
- Keep P5 and P6 out of scope. `build` dispositions stop at BuildProposal; no Kimi Builder, ImplementationAsset, runtime routing, usage learning, or update watcher is added.
- Make one narrow local commit after each completed task. Stage exact files only and verify the commit boundary before continuing.

---

## Task 0: Establish the isolated implementation baseline

**Files:**

- Read: `AGENTS.md`
- Read: `.agent/CURRENT.md`
- Read: `docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`
- Read: `docs/superpowers/specs/2026-09-16-caphub-obsidian-package-export-design.md`
- Read: `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`
- Read: `docs/superpowers/plans/2026-09-16-caphub-obsidian-package-export.md`
- Read: `.agent/caphub/p3-threat-model.md`
- Read: `.agent/caphub/p3-verification.md`
- Create: `.agent/caphub/p4-implementation-log.md`

- [ ] Create a clean isolated worktree from the P4 planning branch/head and bind the repository seat required by `.pact/PROJECT.md`; do not reuse the production-serving worktree.
- [ ] Record the base SHA, branch, worktree, Node/npm/PostgreSQL versions, and a clean `git status` in `p4-implementation-log.md`.
- [ ] Confirm `git diff --check` and the repository's focused baseline tests for Registry/config pass. Do not rerun the entire suite merely to start P4 if the same exact base already has recorded full-suite evidence.
- [ ] Search for uncommitted or generated changes before editing. If the isolated tree is not clean, stop rather than deleting or absorbing unknown files.
- [ ] Record the plan boundary: no real paths, provider calls, production config, migration, publish, or deployment.
- [ ] Commit only the implementation log: `chore(caphub): start p4 export implementation`

## Task 1: Define canonical package, projection, and deployment contracts

**Files:**

- Create: `lib/caphub/packages/schemas.ts`
- Create: `lib/caphub/packages/types.ts`
- Create: `lib/caphub/packages/digest.ts`
- Create: `lib/caphub/packages/schemas.test.ts`
- Create: `lib/caphub/packages/digest.test.ts`
- Modify: `lib/caphub/registry/schemas.ts`
- Modify: `lib/caphub/registry/schemas.test.ts`
- Modify: `lib/caphub/registry/types.ts`

- [ ] Write failing schema tests for `CapabilityPackageV1`, `PackageFileV1`, projection manifest entries, `DeploymentPlanV1`, SemVer, slugs, IDs, strict unknown-key rejection, exact timestamp format, normalized relative POSIX paths, text-only media types, and digest shape.
- [ ] Add tests that reject absolute paths, `..`, backslashes, control characters, empty segments, reserved/dot-only segments, executables, binary media types, secrets/absolute paths in protected fields, mismatched byte counts, and incorrect file/content digests.
- [ ] Write canonicalization tests proving stable recursively sorted object keys, semantic array order, set-field sorting where specified, UTF-8 handling, LF-normalized generated content, exclusion of the object's own `digest`, and a changed digest for every meaningful field.
- [ ] Run `npm test -- lib/caphub/packages/schemas.test.ts lib/caphub/packages/digest.test.ts lib/caphub/registry/schemas.test.ts`. Expected: FAIL because the contracts and new Registry kinds do not exist.
- [ ] Implement strict Zod schemas, inferred types, canonical JSON serialization, and SHA-256 helpers. Do not use locale-dependent sorting or JSON serialization of class instances.
- [ ] Extend Registry schemas with `deployment_plan`, `dpl_`, Review kind `deployment`, Review subject kind `deployment_plan`, the exact confirmation phrases, and lineage `release -> deployment_plan -> deployment`.
- [ ] Preserve all existing P3 record/review kinds and valid lineage relationships. Add no compatibility coercions.
- [ ] Run the same focused tests. Expected: PASS.
- [ ] Commit exact files: `feat(caphub): define p4 export contracts`

## Task 2: Add forward-only PostgreSQL export migration and stores

**Files:**

- Create: `lib/caphub/registry/migrations/003_exports.sql`
- Modify: `lib/caphub/registry/migration-manifest.ts`
- Modify: `lib/caphub/registry/migrate.test.ts`
- Modify: `lib/caphub/registry/contracts.ts`
- Modify: `lib/caphub/registry/postgres/caphub-stores.ts`
- Modify: `lib/caphub/registry/postgres/caphub-stores.test.ts`
- Create: `lib/caphub/registry/postgres/exports.ts`
- Create: `lib/caphub/registry/postgres/exports.test.ts`
- Modify: `tests/helpers/caphub-postgres.ts`

- [ ] Write a real-PostgreSQL failing migration test that applies migrations 001-003 to a fresh temporary PostgreSQL 17 cluster and checks all previously valid P3 kinds plus the new `deployment_plan`/`deployment` review paths.
- [ ] Add failing tests proving invalid kind/prefix pairs, invalid review-kind/subject pairs, forbidden lineage, mutation of immutable versions, audit updates/deletes, and duplicate decision consumption are rejected by PostgreSQL—not only TypeScript.
- [ ] Record and assert the existing 001 and 002 checksums before adding 003. Never edit those files to make a test pass.
- [ ] Implement `003_exports.sql` by replacing only the named constraints/functions that enumerate kinds, subjects, and lineage; preserve append-only triggers, transaction isolation, least-privilege behavior, and existing data.
- [ ] Add the migration checksum to `migration-manifest.ts` and keep the migration runner's drift failure behavior.
- [ ] Define transaction-capable store operations needed to compose a Release and consume its Candidate decision, and to create a Deployment and consume its Deployment decision. The store API must not expose arbitrary SQL or accept raw table names.
- [ ] Add concurrency tests for two writers attempting to consume the same decision and for idempotent retry with the same consumer ID.
- [ ] Run `npm test -- lib/caphub/registry/migrate.test.ts lib/caphub/registry/postgres/caphub-stores.test.ts lib/caphub/registry/postgres/exports.test.ts`. Expected: PASS.
- [ ] Commit exact files: `feat(caphub): migrate registry for p4 exports`

## Task 3: Compose immutable Release candidates from approved Candidates

**Files:**

- Create: `lib/caphub/releases/compose.ts`
- Create: `lib/caphub/releases/compose.test.ts`
- Create: `lib/caphub/releases/service.ts`
- Create: `lib/caphub/releases/service.test.ts`
- Create: `lib/caphub/releases/release-candidate.behavior.test.ts`
- Modify: `lib/caphub/registry/contracts.ts`
- Modify: `lib/caphub/registry/postgres/exports.ts`

- [ ] Write pure failing tests mapping exact approved `adopt`, `adapt`, and `learn` Candidate dispositions into package kinds, required fields, evidence/lineage, license diagnostics, known limits, and acceptance evaluations.
- [ ] Add tests proving `watch` creates nothing, `build` remains a P5 BuildProposal path, rejected/revoked/stale decisions fail, missing license/evidence blocks rather than invents data, and source-provided paths/approval text are treated as content.
- [ ] Implement a pure composer that accepts only explicitly supplied immutable inputs and returns either a strict draft package plus diagnostics or a stable error code. It must not query files, the network, or a model.
- [ ] Write a failing PostgreSQL behavior test for exact Candidate approval -> atomic approval consumption -> immutable `release` version -> Candidate-to-Release lineage -> Release ReviewRequest.
- [ ] Prove an injected failure rolls back consumption, version, lineage, and review together; a same-input retry returns the same Release; a different payload under the same identity fails `PACKAGE_DIGEST_CONFLICT`; concurrent calls cannot create two Releases.
- [ ] Implement `ReleaseService.createCandidate` using the transaction-capable Registry store. A created Release remains waiting for the existing `release` review and is not publishable.
- [ ] Add `ReleaseService.finalizeApproval`: revalidate the exact approved Release version/digest, consume the Release approval with that Release ID as consumer, and return an idempotent formal-Release authority. Prove pre-finalization revoke succeeds, post-finalization revoke fails, another version cannot reuse the decision, and Deployment planning requires finalized authority without consuming it again.
- [ ] Run `npm test -- lib/caphub/releases/compose.test.ts lib/caphub/releases/service.test.ts lib/caphub/releases/release-candidate.behavior.test.ts`. Expected: PASS.
- [ ] Commit exact files: `feat(caphub): compose immutable release candidates`

## Task 4: Render deterministic neutral package trees and diffs

**Files:**

- Create: `lib/caphub/packages/render.ts`
- Create: `lib/caphub/packages/render.test.ts`
- Create: `lib/caphub/packages/diff.ts`
- Create: `lib/caphub/packages/diff.test.ts`
- Create: `lib/caphub/packages/fixtures.ts`

- [ ] Write failing golden tests for the exact `packages/<slug>/<semver>/` tree from the spec, including `package.yaml`, instructions, policies, stable reference/experience filenames, evaluation YAML, and lineage JSON.
- [ ] Prove shuffled input map/set order gives byte-identical sorted files and manifest digest, while a semantic change changes the affected file and manifest digest.
- [ ] Add rejection tests for YAML aliases/tags, duplicate keys, ambiguous scalars, unsafe Markdown frontmatter injection, unsafe filenames, binary/executable resources, oversized individual/generated aggregate content, and duplicate output paths.
- [ ] Implement a pure text-only renderer. Use explicit YAML scalar styles and deterministic key order; do not serialize JavaScript objects with runtime-dependent formatting.
- [ ] Write diff tests for create/update/delete preview entries, bounded line/file/byte limits, stable headers, unchanged omission, and redaction of absolute roots. A delete may appear in the neutral Git preview but must not become an automatic target deletion.
- [ ] Implement the pure manifest and unified-diff generator without invoking Git or reading the filesystem.
- [ ] Run `npm test -- lib/caphub/packages/render.test.ts lib/caphub/packages/diff.test.ts`. Expected: PASS.
- [ ] Commit exact files: `feat(caphub): render neutral capability packages`

## Task 5: Render and parse byte-safe Obsidian documents

**Files:**

- Create: `lib/caphub/projection/markers.ts`
- Create: `lib/caphub/projection/markers.test.ts`
- Create: `lib/caphub/projection/render.ts`
- Create: `lib/caphub/projection/render.test.ts`
- Create: `lib/caphub/projection/fixtures.ts`

- [ ] Write failing parser tests for one exact managed region and one exact human region, required ordering, unique YAML properties, valid Registry identity, and byte offsets for the human block.
- [ ] Add failure cases for missing/duplicate/nested/unbalanced/reordered markers, marker text inside source content, malformed frontmatter, duplicate YAML keys, conflicting record identity, BOM surprises, mixed unsafe line endings, and files not owned by Caphub.
- [ ] Implement a parser that returns structured ownership metadata plus the exact original human-region byte slice. It must never repair an ambiguous file.
- [ ] Write renderer tests for the four required human headings, deterministic managed Markdown, stable Obsidian properties, escaped untrusted content, and byte-for-byte human preservation across updates.
- [ ] Prove that deleting and rebuilding a newly managed document yields the same managed digest and that changing only human content does not change the managed digest.
- [ ] Implement a pure document renderer with separate `managed_digest`, full preimage digest, and proposed postimage digest.
- [ ] Run `npm test -- lib/caphub/projection/markers.test.ts lib/caphub/projection/render.test.ts`. Expected: PASS.
- [ ] Commit exact files: `feat(caphub): render safe obsidian projections`

## Task 6: Plan Obsidian projection changes and fixture-safe apply

**Files:**

- Create: `lib/caphub/projection/paths.ts`
- Create: `lib/caphub/projection/paths.test.ts`
- Create: `lib/caphub/projection/planner.ts`
- Create: `lib/caphub/projection/planner.test.ts`
- Create: `lib/caphub/projection/filesystem.ts`
- Create: `lib/caphub/projection/filesystem.test.ts`
- Create: `lib/caphub/projection/project.behavior.test.ts`

- [ ] Write failing path tests that reject relative/broad/home/workspace roots, symlink roots, traversal, separator tricks, unsafe slugs, foreign/missing sentinel files, and descendant symlink escapes.
- [ ] Implement a target-root validator requiring a real absolute directory plus a Caphub sentinel bound to the exact target alias. Tests may create the sentinel only inside a fresh temporary directory.
- [ ] Write planner tests for `create`, `update`, `unchanged`, `conflict`, and `orphan`; stable sort order; duplicate path collision; managed/postimage/preimage digests; no ordinary delete action; and bounded preview content.
- [ ] Implement a read-only planner that produces a strict projection manifest and diff. It may read only descendants named by its computed safe relative paths.
- [ ] Write fixture apply tests proving exact preimage revalidation, exclusive same-target lock, same-directory exclusive temp files, flush/atomic rename, permission preservation where safe, no partial file after injected failure, and refusal to overwrite a changed/foreign file.
- [ ] Prove the apply adapter never receives a browser-supplied root, never follows a symlink, never deletes an orphan, and preserves the human region byte-for-byte.
- [ ] Add a cross-boundary behavior test for Registry snapshot -> render -> plan -> temp-Vault apply -> empty-root rebuild with equal managed digest.
- [ ] Run `npm test -- lib/caphub/projection`. Expected: PASS.
- [ ] Commit exact files: `feat(caphub): plan and apply fixture projections`

## Task 7: Add pure Codex, Claude Code, and Hermes preview adapters

**Files:**

- Create: `lib/caphub/adapters/contracts.ts`
- Create: `lib/caphub/adapters/common.ts`
- Create: `lib/caphub/adapters/common.test.ts`
- Create: `lib/caphub/adapters/codex.ts`
- Create: `lib/caphub/adapters/codex.test.ts`
- Create: `lib/caphub/adapters/claude.ts`
- Create: `lib/caphub/adapters/claude.test.ts`
- Create: `lib/caphub/adapters/hermes.ts`
- Create: `lib/caphub/adapters/hermes.test.ts`

- [ ] Encode the supported external format assumptions in fixture tests based on the official references linked from the spec. Do not copy vendor prose or accept undocumented fields merely because a model suggests them.
- [ ] Write a shared failing contract suite: same package+adapter version produces identical bytes/digests; output is sorted and text-only; descriptions/triggers are bounded; provenance/license/known limits survive; unsupported kind/permission/dependency fails closed; absolute roots never appear.
- [ ] Implement a lean common `SKILL.md` renderer with referenced supporting text only. Do not generate scripts, installers, commands to run, executable modes, or implicit tool grants.
- [ ] Write and implement Codex preview output under logical `$CODEX_HOME/skills/<slug>/`, Claude Code output under logical `.claude/skills/<slug>/`, and Hermes output under logical `~/.hermes/skills/<category>/<slug>/`.
- [ ] Ensure each result records adapter name/version/source digest, compatibility diagnostics, input package digest, and output manifest digest. Unsupported features return `ADAPTER_UNSUPPORTED` with no partial output.
- [ ] Run `npm test -- lib/caphub/adapters`. Expected: PASS.
- [ ] Commit exact files: `feat(caphub): add capability preview adapters`

## Task 8: Create exact Deployment plans and fixture publish/rollback

**Files:**

- Create: `lib/caphub/deployments/plan.ts`
- Create: `lib/caphub/deployments/plan.test.ts`
- Create: `lib/caphub/deployments/publisher.ts`
- Create: `lib/caphub/deployments/publisher.test.ts`
- Create: `lib/caphub/deployments/recovery.ts`
- Create: `lib/caphub/deployments/recovery.test.ts`
- Create: `lib/caphub/deployments/deployment.behavior.test.ts`
- Modify: `lib/caphub/registry/postgres/exports.ts`
- Modify: `lib/caphub/registry/postgres/exports.test.ts`

- [ ] Write failing plan tests binding action, target, target alias, exact Release version/digest, adapter name/version/digest, preview manifest/diff digests, target preimage digest, and expected current pointer.
- [ ] Prove a plan cannot be created for an unapproved/revoked/stale Release, unsupported adapter output, license block, conflict, broad root, or missing target sentinel.
- [ ] Implement pure plan composition plus Registry persistence and a `deployment` ReviewRequest. Creating a plan does not apply it.
- [ ] Write publisher tests for immutable `versions/<release>/<version>/<manifest>/`, per-file digest verification, operation record, atomic `current.json`, idempotent same-plan retry, different-plan collision, stale pointer/preimage, symlink insertion after planning, and approval consumption exactly once.
- [ ] Add injected failures before version finalization, after version finalization, before decision consumption, after Registry Deployment creation, and before/after pointer replacement. Every case must either have no visible active change or enter `PUBLISH_RECOVERY_REQUIRED` with a deterministic reconciliation result.
- [ ] Implement publish in a fresh sentinel-owned temp root only. The production code accepts a validated server-resolved target, never a raw path in `DeploymentPlanV1`.
- [ ] Write rollback behavior tests requiring a new exact plan and approval, retaining both immutable version directories and all Deployment history, and switching only the pointer.
- [ ] Add the full BDD chain: exact Candidate approval -> Release candidate -> exact Release approval -> deterministic target preview -> Deployment plan -> exact Deployment approval -> fixture publish -> new rollback plan/approval -> fixture rollback.
- [ ] Run `npm test -- lib/caphub/deployments lib/caphub/releases/release-candidate.behavior.test.ts`. Expected: PASS.
- [ ] Commit exact files: `feat(caphub): gate fixture publish and rollback`

## Task 9: Add strict disabled-by-default export configuration and safe CLI entrypoints

**Files:**

- Modify: `lib/planning/config.ts`
- Modify: `lib/planning/config.test.ts`
- Modify: `config/alljobs.example.json`
- Create: `lib/caphub/exports/runtime.ts`
- Create: `lib/caphub/exports/runtime.test.ts`
- Create: `scripts/caphub-project.ts`
- Create: `scripts/caphub-export.ts`
- Create: `scripts/caphub-publish.ts`
- Create: `scripts/caphub-export.test.ts`
- Modify: `package.json`

- [ ] Write failing config tests for `exports.enabled`, `obsidian.enabled`, `packageRepository.enabled`, and each target `enabled`, all defaulting to false under strict unknown-key rejection.
- [ ] Add tests requiring explicit absolute roots only when a gated target is enabled; reject `/`, home, repository/workspace root, variables, `~`, glob characters, relative paths, symlinks, duplicate aliases, and roots shared between targets.
- [ ] Implement config schemas. Keep every root absent from `config/alljobs.example.json`; the example contains false switches only.
- [ ] Write runtime tests proving the master Caphub, Registry, exports, and target switches all gate operations and disabled paths fail `P4_EXPORT_DISABLED` before a database/filesystem side effect.
- [ ] Implement server-only runtime construction and ensure no resolved root is included in public objects or serialized errors.
- [ ] Add a read-only projection/export CLI whose default and required first mode is `--dry-run`; output only relative paths, counts, digests, and bounded diffs.
- [ ] Add a publish CLI requiring an exact Deployment Plan ID, exact confirmation argument, and all enabled server-side gates. It must not accept an arbitrary root argument. Automated tests use only injected temp configuration and never call a real target.
- [ ] Add scripts such as `caphub:project`, `caphub:export`, and `caphub:publish` with clear disabled defaults. Do not run publish outside its temp-root tests.
- [ ] Run `npm test -- lib/planning/config.test.ts lib/caphub/exports/runtime.test.ts scripts/caphub-export.test.ts`. Expected: PASS.
- [ ] Commit exact files: `feat(caphub): add disabled export runtime`

## Task 10: Extend Registry queries and read-only P4 UI states

**Files:**

- Modify: `lib/caphub/registry/queries.ts`
- Modify: `lib/caphub/registry/queries.test.ts`
- Modify: `lib/caphub/registry/queries.postgres.test.ts`
- Modify: `app/capabilities/[id]/page.tsx`
- Modify: `app/reviews/page.tsx`
- Modify: `components/caphub/reviews/review-center.tsx`
- Modify: `components/caphub/reviews/review-center.test.tsx`
- Modify: `components/caphub/reviews/registry-detail.tsx`
- Modify: `components/caphub/reviews/registry-detail.test.tsx`
- Create: `components/caphub/exports/capability-export.tsx`
- Create: `components/caphub/exports/capability-export.test.tsx`
- Create: `components/caphub/exports/manifest-diff.tsx`
- Create: `components/caphub/exports/manifest-diff.test.tsx`
- Modify: `components/caphub/reviews/test-fixtures.ts`

- [ ] Write failing query/DTO tests for Release state, package manifest, bounded neutral diff, Obsidian conflict summary, adapter diagnostics, Deployment plan/decision/consumption, active/prior pointer, and rollback history.
- [ ] Add explicit leakage tests: no absolute roots, database URLs, environment names, SQL messages, full internal stack, hidden filesystem content, or unbounded diffs enter client DTOs.
- [ ] Extend queue filtering with `deployment` and keep invalid URL filters fail-closed/ignored consistently with P3.
- [ ] Implement server-side queries that fetch exact immutable versions and return discriminated safe DTOs for disabled, unavailable, not-found, no-release, waiting, approved, rejected/revoked/superseded, unsupported, conflict/stale, planned, deployed, and rollback states.
- [ ] Write component tests for every focused P4 state in the spec, semantic headings, keyboard access, narrow viewport wrapping, long untrusted strings, confirmation text, and no action when approval/apply is unavailable.
- [ ] Implement the UI by reusing existing Paper Workbench tokens/components. Do not add a design system, global CSS rewrite, animation package, or frontend workflow artifacts.
- [ ] Keep apply/publish out of browser actions. The UI may display review controls already governed by the exact Review API; it must not expose a “publish now” shortcut.
- [ ] Run `npm test -- lib/caphub/registry/queries.test.ts lib/caphub/registry/queries.postgres.test.ts components/caphub/reviews components/caphub/exports`. Expected: PASS.
- [ ] Commit exact files: `feat(caphub): surface p4 export reviews`

## Task 11: Add focused final-build browser behavior and screenshots

**Files:**

- Create: `tests/e2e/caphub-package-export-fixtures.ts`
- Create: `tests/e2e/caphub-package-export.spec.ts`
- Create: `playwright.caphub-package-export.config.ts`
- Modify: `package.json`
- Create: `.agent/caphub/p4-screenshots/README.md`

- [ ] Build fixture records that exercise only the P4 state matrix: no Release, Release waiting/approved/rejected/revoked, unsupported adapter, projection conflict, Deployment waiting/approved/deployed, rollback, disabled, and unavailable.
- [ ] Add focused Playwright tests for Review Center navigation/filtering, Capability detail package/adapter/projection sections, exact confirmation flow against the test server, keyboard focus, accessible names, no horizontal overflow, and no absolute-root leakage.
- [ ] Configure the P4 browser suite independently so it does not replay unrelated Planning Core, P1, or P3 browser suites.
- [ ] Add a `test:e2e:caphub-package-export` script.
- [ ] Run the focused suite against a production build using a fixture PostgreSQL cluster and fixture roots. Expected: PASS.
- [ ] Capture the approved representative final-build states at 1440px and true 390px device metrics using `scripts/shot.mjs`; do not use raw headless Chrome `--window-size=390`.
- [ ] Record screenshot filenames, route/query, viewport, build SHA, Registry fixture digest, and visual assertions in `p4-screenshots/README.md`.
- [ ] Commit exact files: `test(caphub): verify p4 export journeys`

## Task 12: Close P4 implementation for independent Codex acceptance

**Files:**

- Create: `.agent/caphub/p4-threat-model.md`
- Create: `.agent/caphub/p4-verification.md`
- Create: `.agent/caphub/p4-review.md`
- Modify: `.agent/caphub/p4-implementation-log.md`
- Modify: `.agent/CURRENT.md`
- Modify: `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`
- Modify: relevant operations/architecture documentation only if behavior changed

- [ ] Update the threat model with exact trust boundaries, path/symlink/preimage defenses, approval consumption, recovery states, browser redaction, and remaining P4-A/P4-B/P4-C gates.
- [ ] Run the single final phase gate from a clean tree: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:deploy`, and `npm run test:e2e:caphub-package-export`. Record exact counts, warnings, versions, duration, and SHA.
- [ ] Treat every new error, test failure, build warning attributable to P4, unsafe dependency finding, and unresolved migration/security issue as blocking. Do not waive a failing test because an independent reviewer is pending.
- [ ] Request one independent Review scoped to the P4 diff/spec, emphasizing authorization, Registry exact-version semantics, path safety, transaction/recovery, deterministic output, and scope exclusions. Record findings once in `p4-review.md`.
- [ ] Fix all blocker/high/medium findings. Rerun only directly affected tests and targeted review checks; repeat the final full gate only if the fix changes cross-cutting behavior, migration, shared config, or build output.
- [ ] Request one independent Verification scoped to the spec acceptance criteria and recorded evidence. It must verify final commit identity, clean status, test/build evidence, final-build screenshots, no real target writes, and unresolved Human gates.
- [ ] Update `.agent/CURRENT.md`, roadmap, and the existing P4 Linear issue in one factual batch. Do not create duplicate Linear issues and do not post per-test heartbeats.
- [ ] Commit the bounded closeout: `docs(caphub): record p4 implementation evidence`
- [ ] Verify `git status --short --branch`, `git log -1 --stat`, and the complete diff from the planning base. Do not push, merge, deploy, configure real roots, or mark P4-A/P4-B/P4-C approved.
- [ ] Produce a Handoff Record for Codex acceptance with branch/worktree, base/final SHAs, commits, exact tests, Review/Verification findings, screenshots, Linear state, real-write audit, remaining gates, and the next safe action.

## Codex acceptance boundary after KimiCode handoff

Codex acceptance is independent of KimiCode's own review. Codex will:

1. inspect the complete planning-base-to-final diff and commit boundaries;
2. verify the exact Registry, approval, path, transaction, and recovery contracts against this spec;
3. rerun risk-proportionate focused tests and, if evidence or shared behavior is uncertain, the final phase gate;
4. inspect final-build browser states and screenshots;
5. confirm no real Vault/Agent root, production database, provider, push, merge, deploy, or release was touched;
6. require correction of every blocking acceptance finding before recommending any Human gate;
7. stop for P4-A/P4-B/P4-C before any real dry run, target enablement, publish, or rollback.

Passing implementation acceptance does not authorize production configuration or publication.
