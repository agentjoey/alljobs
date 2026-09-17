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
