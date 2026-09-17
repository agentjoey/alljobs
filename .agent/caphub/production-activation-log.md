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
