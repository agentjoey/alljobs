# Caphub P1–P4 Production Activation Implementation Log

## Start — 2026-09-17

- Branch: `codex/caphub-production-activation`
- Worktree: `.worktrees/caphub-production-activation`
- Production base: `50abeae8719f297a44955b076f9a9d7299f5abbe`
- Planning head: `dd82baca5e5186acb8d6cd844d84dc27b76aa65d`
- Spec commit: `fc068aefb537d4f0bad0e71fa511d42184cbd374`
- Node.js: `v24.14.0`
- npm: `11.9.0`
- PostgreSQL binaries: `17.11` (Homebrew `postgresql@17`)
- Starting tree: clean; branch two local planning commits ahead of `origin/main`

## Scope boundary

Implementation may change only the approved local-first P1–P4 activation
surface. It must stop before PA-B/PA-C/PA-D and must not mutate the real local
database, installed LaunchAgents, Production configuration or secrets; call a
real provider; restart/reload Production; push, merge, tag, deploy, or release;
configure a real P4 target; publish/install/rollback; or enter P5/P6.

Task checks remain focused. One full phase gate, one scoped independent Review,
and one independent Verification occur only after the implementation tasks.

## Task 0 — security floor

- Resolved versions: `next@16.3.3`, `eslint-config-next@16.3.3`.
- Focused route/deployment regression: 4 files / 50 tests PASS.
- Typecheck: PASS.
- Next.js 16.3.3 Turbopack Production build: PASS.
- Deployment invariants: PASS; `start:prod` remains loopback-only on
  `127.0.0.1:3456`.
- `npm install` reported 6 remaining dependency-tree advisories (4 moderate,
  2 high). No broad `npm audit fix` or unrelated dependency upgrade was run;
  these findings remain unclassified and are not claimed fixed by Task 0.
- No Production or external runtime state changed.

## Task 1 — bounded Registry connections

- Configuration now separates application and migration URL environment
  references and selects either `local_socket` or `tls_verify_full`.
- Local mode accepts only the canonical, current-user-owned private directory
  at `ALLJOBS_HOME/run/caphub-postgres`, database `caphub`, port `54329`, and
  the role appropriate to the call site. Passwords, TCP hosts, alternate
  paths, TLS/query overrides, symlinks, and unsafe modes fail closed.
- Managed mode accepts only the fixed Registry database/role on a non-loopback
  DNS host with a server-only password and enforces certificate verification.
- Runtime pools receive parsed fields rather than an unvalidated connection
  string. The existing sentinel-owned E2E socket seam remains isolated.
- TDD evidence: configuration assertions first failed 2/40, then passed 40/40;
  connection-policy test first failed because the module did not exist, then
  passed 19/19; runtime assertions first failed 2/5, then passed 5/5.
- Final focused gate: 3 files / 64 tests PASS; typecheck PASS; scoped lint has
  zero errors and one pre-existing `no-explicit-any` warning in
  `lib/planning/config.ts:306`.
- No Production or external runtime state changed.

## Task 2 — local PostgreSQL operations and readiness

- Added a fixed `caphub:postgres` boundary with read-only `--check` plus exact
  confirmation strings for bootstrap and migration. Raw URL, path, root, and
  SQL arguments are rejected.
- Bootstrap derives only the approved data/socket paths, requires private
  owned canonical empty targets, invokes fixed PostgreSQL 17 binaries with
  argument arrays, retains partial state for inspection, disables TCP, and
  creates the fixed database and non-privileged app/migrator roles.
- Added peer-auth/default-reject PostgreSQL templates and a loopback-independent
  LaunchAgent template whose logs stay below `~/Library/Logs/alljobs/`.
- Readiness verifies PostgreSQL 17, Unix-socket transport, role/database
  identity and separation, exact migration checksums, required application
  grants, absence of app migration/append-only update authority, and all
  append-only triggers. Migrations reject any caller other than
  `caphub_migrator` on database `caphub`.
- TDD evidence: missing operations/CLI/templates produced the expected RED;
  an initial GREEN attempt exposed PostgreSQL 17's restriction on examining
  `unix_socket_directories`, so readiness was corrected to combine the
  validated pool host with `inet_server_addr() IS NULL` without privileged
  settings access.
- Final focused gate: 4 files / 22 tests PASS against sentinel-owned temporary
  PostgreSQL 17 clusters; typecheck PASS; scoped lint PASS; deployment
  invariants PASS; LaunchAgent plist lint PASS.
- No Production database, LaunchAgent, configuration, secret, or service was
  created, installed, started, or changed.

## Task 3 — immutable filesystem Capture import

- Added a bounded, secure, read-only inventory of filesystem Capture records,
  idempotency indices, monthly audit events, and immutable objects. It rejects
  missing, extra, duplicate, conflicting, malformed, partial, tampered,
  symlinked, foreign-owned, or broadly writable source material.
- The plan binds every source file byte to one SHA-256 digest while exposing a
  metadata-only manifest. Apply replans and requires that exact digest before
  it performs any Registry preflight or write.
- PostgreSQL conflicts are checked across both Capture ID and idempotency key
  before writes. Exact existing rows and audit events are idempotent; differing
  immutable content aborts.
- Added a fixed CLI that defaults to dry-run. Apply accepts only the exact
  manifest digest and confirmation `IMPORT-CAPHUB-CAPTURES`; raw roots, URLs,
  SQL, or connection arguments are not accepted.
- TDD/BDD evidence: missing importer/CLI produced the expected RED; unit and
  command tests passed 7/7; the final focused gate passed 4 files / 15 tests,
  including real temporary PostgreSQL first import, exact rerun, and digest
  conflict without added rows. Typecheck and scoped lint PASS.
- No real filesystem Capture, Production Registry, or service state was read,
  mutated, or migrated.

## Task 4 — non-destructive backup and restore verification

- Added immutable backup generations below the resolved Control Host home.
  Creation writes a PostgreSQL custom-format dump first, copies the complete
  secure Caphub state tree, binds both to SHA-256 manifests, and publishes the
  generation only after all evidence is complete.
- Existing generation IDs are never overwritten. Failed pending generations
  are not published; the command exposes no delete or pruning operation and
  refuses symlinks, unsafe ownership/modes, unsupported files, and hash/count
  mismatches.
- Verification checks dump and state hashes, restores into a newly created
  sentinel-owned temporary PostgreSQL 17 cluster, compares Registry counts and
  migration checksums, then revalidates ownership/PID before stopping and
  removing only that temporary restore root.
- The fixed CLI exposes only `--create` and `--verify GENERATION_ID`; it accepts
  no root, output path, database URL, delete, or prune argument.
- TDD/BDD evidence: missing module/CLI produced the expected RED; final focused
  gate passed 3 files / 6 tests, including a real `pg_dump -Fc` and isolated
  `pg_restore` drill. Typecheck and scoped lint PASS.
- No Production backup, database dump, restore cluster, or state mutation was
  created or performed.

## Task 5 — Production analysis/import and Release composition

- Added one fixed Production analysis workflow that reuses a single Registry
  runtime, runs the accepted P2 analysis service, and imports a completed
  ReviewPacket into the Review queue. Terminal failure/human-review results do
  not import; retry remains idempotent through the existing analysis and import
  contracts.
- `caphub:analyze` now returns metadata-only Capture, job, artifact, and review
  identifiers after the combined operation. Its argument boundary remains one
  validated Capture ID with no prompt, provider, credential, URL, or path
  input.
- Added the Registry-backed P4 Release runtime and `caphub:release` command.
  It exposes only Candidate-to-Release composition and Release approval
  finalization; publish, install, rollback, Deployment, target, root, raw URL,
  and SQL inputs remain unavailable.
- Corrected the plan's CLI spelling to the already-implemented P4 `learnKind`
  contract: `experience_card | reference`.
- TDD/BDD evidence: the four new module/command suites first failed because the
  modules did not exist. Final focused gate passed 7 files / 20 tests, including
  real temporary PostgreSQL ReviewPacket import and Release lifecycle tests.
  Typecheck and scoped lint PASS.
- No real provider, Production Registry, filesystem Capture, Release, target,
  Deployment, Production configuration, secret, or service state was used or
  changed.

## Task 6 — isolated P1–P4 production pilot

- Added one sentinel-owned, single-worker Playwright scenario covering an exact
  filesystem Capture dry-run/apply, browser Capture, fixture-only analysis,
  ReviewPacket import, Candidate approval, Release composition and approval,
  exact finalization retry, read-only neutral manifest/adapter previews, and
  verified backup/isolated restore.
- The fixture uses a private temporary Control Host home, a Unix-socket-only
  PostgreSQL 17 cluster, fixed MiniMax/Kimi (`k3-256k`) adapters, and a loopback
  HTTPS proxy. It creates no export target root and asserts zero Deployment or
  DeploymentPlan records.
- The cross-boundary scenario exposed and fixed two Production-only integration
  defects:
  1. application-role Capture creation tried to lock the append-only
     `capture_idempotency` table, which correctly has no UPDATE grant; it now
     serializes the idempotency key with a transaction-scoped advisory lock;
  2. ReviewPacket import assumed a filesystem-origin version-1 analysis job;
     it now binds exact existing current Registry versions while preserving the
     original version-1 import path and post-commit retry repair.
- RED/GREEN evidence: the new scenario first failed because the harness was
  absent; the least-privileged Capture BDD then reproduced the 503, and the
  Registry-native import path reproduced `IMPORT_DIGEST_CONFLICT`. Final
  focused evidence: app-role/import tests 2 files / 5 tests PASS; typecheck and
  scoped lint PASS; Next.js 16.3.3 webpack Production build PASS; production
  pilot E2E 1/1 PASS.
- Final-build screenshots were inspected at 1440 CSS pixels for Review and a
  true 390 CSS-pixel viewport for Capability detail. No absolute path,
  credential, database URL, raw object key, Capture bytes, prompt, provider
  response, or publish control is visible.
- Turbopack build attempts were blocked by the execution container denying its
  temporary CSS worker port (`EPERM`). The final verified artifact uses the
  repository-supported Next.js webpack Production builder; this is recorded as
  an environment limitation, not a passing Turbopack result.
- No Production database, config, LaunchAgent, service, provider, source URL,
  target, Git remote, or deployment state was used or changed.

## Task 7 — metadata-only preflight and operator evidence

- Added `caphub:preflight`, a read-only/no-argument command whose report is
  constructed from a strict field whitelist: commit/version, booleans, counts,
  digests, fixed role/database/migration IDs, backup generation ID, and safe
  stage enums only. Extra dependency fields are discarded; unsafe public
  strings and enabled pilot targets fail closed.
- RED evidence: the focused suite failed because the preflight module was
  absent. GREEN evidence: preflight plus deployment verifier tests 2 files / 5
  tests PASS; scoped ESLint PASS; typecheck PASS; deployment invariants PASS.
- Read-only Control Host execution reports build `d1f2986`, Next.js `16.3.3`,
  loopback-only application, 2 filesystem Captures at one source digest,
  Registry unavailable/unmigrated, no backup generation, both provider secret
  references present, exports master false, zero enabled targets, and
  `readyFor: PA_B`. No values, paths, URLs, bytes, prompts, responses, or target
  roots were emitted.
- Added the S0–S4/rollback runbook and activation threat model, and synchronized
  architecture, operations, deployment, Caphub custody, roadmap, and current
  status documents. The official source URL and exact origin remain runtime
  Human inputs with no default.
- The first direct `tsx` CLI attempt was blocked by the execution sandbox's IPC
  socket policy (`EPERM`); the same read-only command passed outside that
  sandbox. This did not change Production state.
- PA-B/PA-C/PA-D and P4-A/P4-B/P4-C remain closed. No real database,
  LaunchAgent, configuration, secret, provider, service, target, push, merge,
  deployment, or release action occurred.

## Task 8 — final implementation gate and acceptance

- The single full phase gate passed with exact incremental provenance: full
  tests at `a82aa07` (167 files / 1430 tests in 26.65 s); webpack Production
  build and pilot E2E at `7a3f7e928dc91f823d1c4de73c3e8cf6e0f8c9bf`;
  and final screenshot evidence at
  `5820732cc8048a1952b91759684e42dbd4267eeb`. The intervening commits only
  bound test concurrency, selected the supported webpack build command, and
  refreshed committed evidence.
- Typecheck PASS; lint 0 errors / 79 existing warnings; Next.js 16.3.3 webpack
  Production build PASS; deployment invariants PASS; pilot E2E 1/1 in 3.6 s.
  Build ID is `FK3UGN3cYhfExekMHoAp3`. Node.js is `v24.14.0`, npm is `11.9.0`,
  and PostgreSQL is `17.11`.
- Migration checksums are `001_registry`
  `d48b33929743342b2fcfe11726a45653e06c0cc39a84949dcbf1ae9ec80e5fa8`,
  `002_read_models`
  `fa8fefdef331966fdcb67db911ace73eca2d2f54702028acaa6735de1e8716c7`,
  and `003_exports`
  `e9df0d799318069fa4d1e09438043a16666df695e6ccdf28ad0474a2121922e4`.
- Final-build screenshots remain bound to the unchanged browser bundle:
  `reviews-1440.png` is 1440×1515 at
  `80188420640ddd123ad7aad1277c71b680e6a21c1d6d7e496ccc25166423202c`;
  `capability-390.png` is 390×2189 at
  `b1bd2e6349e9b5ad74945d6a3c633a916c8d96eb5d04bce3bf99851168c2a86d`.
- Scoped independent Review found three issues: safe-off import was blocked by
  the outer application gate, bootstrap did not stop before launchd handoff,
  and managed backup lacked a complete verify-full `pg_dump` contract.
  `5b434f4049eba40dab71c3d96f1cacf364115e7a` fixed all three. Fix-only
  evidence passed 2 CLI files / 6 tests, 3 temporary-PostgreSQL files / 9
  tests, typecheck, scoped lint, deployment invariants, and diff check.
- Fix-only independent Review PASS and independent Verification PASS. The
  verifier reused the full build/E2E evidence because review fixes changed no
  Next route, React component, browser runtime, dependency, or rendered asset.
- Metadata-only preflight reports 2 filesystem Captures at source digest
  `e00ec5b4aeef4b8a1e876b5145c42e062ac983627ac9fdb56379c830ee0f0725`,
  Registry unavailable/unmigrated, no Production backup generation, exports
  master false, zero enabled targets, and `readyFor: PA_B`.
- Linear could not be updated because the workspace free-plan issue limit was
  reached. No duplicate issue was created and no Linear completion is claimed.
- PA-A is complete. Production smoke is intentionally unrun. PA-B plus a
  separately explicit S1 listener-stop action is the next hard stop; PA-C,
  PA-D, P4 targets, P5/P6, push, merge, deploy, and release remain closed.

## Neon activation revision — Tasks 1–6

- Human-approved design replaces the unavailable local Time Machine/off-host
  backup prerequisite with a private immutable Neon object copy and a recovery
  branch proof. The existing `alljobs` Production branch's Object Storage
  capability was verified in the control plane; before the N1 partial execution
  recorded below, no Neon write had occurred.
- Implementation commits: `ceb8b51` strict Registry configuration/host policy;
  `9633bd9` private path-style immutable S3 adapter; `af126df` manifest-bound
  object transfer; `260b583` runtime composition; `62f3384` managed readiness,
  redacted attestations, and N1–N4 runbook.
- The Task 6 BDD suite receives only explicitly named non-Production source and
  recovery branch references. Without all temporary references it skips before
  constructing a pool or S3 client: `1 skipped`, no network request. It never
  reads Production environment names or manages branches/buckets.
- Final local implementation gate: 13 focused files / 108 tests PASS;
  typecheck PASS; full lint 0 errors / 79 existing warnings; webpack Production
  build PASS (Build ID `QO-gOxPfjA0_Ls8KP3HjH`); deployment invariants PASS.
  No visible route changed in this revision, so no new browser screenshot was
  required; existing final-build P1–P4 screenshots remain the UI evidence.
- Remaining hard gates: N1/PA-B-N for any Production Neon provisioning or
  private environment installation; N2 object transfer; N3 Registry import;
  N4 recovery proof; PA-D application rebuild/reload; PA-C one real Kimi
  canary. No provider call, service restart, deployment, push, merge, or
  release occurred.
- Fix-only review closure: S3 credentials are now gated by an exact configured
  endpoint-host allowlist; SDK-shaped `412 PreconditionFailed` races re-read the
  immutable object; the non-Production BDD binds each supplied URL/endpoint to
  a separate exact resource-host reference before constructing a client; and
  the preflight PostgreSQL version whitelist is fully anchored. Focused
  regression: 5 files / 65 tests PASS; typecheck PASS; scoped lint 0 errors
  (one pre-existing warning in `lib/planning/config.ts`).
- Scoped independent Review: PASS after `ced4425`; it confirmed exact S3 host
  binding before client construction, SDK-shaped 412 recovery, exact
  non-Production fixture host binding before Pool/S3 construction, and the
  fully anchored version allowlist. Independent fix-only Verification: PASS;
  it reran the preflight regression (6/6), confirmed a clean worktree and
  `git diff --check`, and performed no Neon/service action.

## N1 partial execution — 2026-09-18

- Under explicit Human authorization, Production now has the private
  `caphub-objects` bucket, the `caphub_migrator` and `caphub_app` roles, and
  transaction pooling enabled on the approved endpoint. No secret value is
  retained in this record.
- The Human explicitly declined IP allowlisting for this single-Control-Host
  deployment. No network-source restriction is claimed as activation evidence.
- The separately authorized `ALTER ROLE ... NOLOGIN` attempt was refused by the
  Neon SQL execution identity; no role containment change succeeded.
- Under the subsequent explicit deletion authorization, both target roles were
  deleted after the dependency check and recreated as `no_login`. Independent
  role inventory confirms `caphub_migrator` and `caphub_app` use
  `authentication_method: no_login`; no replacement secret was issued or
  retained.
- Under the later explicit N1 configuration authorization, `caphub` was created
  with `caphub_migrator` as owner and both target roles were restored as login
  roles. Their final passwords were rotated and only the application pooled URL
  and direct migrator URL were installed in the existing mode-`600` private
  LaunchAgent environment. No credential value is retained here.
- No migration, object transfer, Registry import, recovery proof, provider
  request, service restart, deployment, push, merge, or release occurred.
