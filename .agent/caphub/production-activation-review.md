# Caphub P1–P4 Production Activation — Scoped Independent Review

Date: 2026-09-17

Production base: `50abeae8719f297a44955b076f9a9d7299f5abbe`

Reviewed code candidate: `5b434f4049eba40dab71c3d96f1cacf364115e7a`

Verdict: **PASS**

## Scope

The independent review covered only the activation diff and its changed trust
boundaries: local socket/TCP exclusion, database role separation, migration
checksums and grants, source-preserving Capture import, provider no-tool and
no-retry boundaries, analysis/Release authority, backup/restore consistency,
target-disabled previews, and non-destructive rollback. Accepted Planning Core
and P1–P4 internals were not globally re-reviewed.

## Findings and closure

The first pass found three actionable issues:

1. the importer used the application runtime gate and therefore could not run
   while outer Caphub was intentionally safe-off;
2. bootstrap left its temporary `pg_ctl` postmaster running without an explicit
   successful handoff to launchd; and
3. backup accepted `tls_verify_full` configuration without passing a complete
   verify-full libpq contract to `pg_dump`.

Commit `5b434f4049eba40dab71c3d96f1cacf364115e7a` closes all three. The operator
importer now requires Registry enablement but is independent of the outer
application switch, bootstrap stops its temporary postmaster and returns
`serviceRunning: false` before the runbook loads launchd, and backup explicitly
fails closed outside the approved `local_socket` mode. The same fix also makes
S1 listener-stop authorization separate and explicit, keeps S2 operator-only,
and defers the running S3/S4 application transition to PA-D.

The fix-only re-review found no additional blocker, high, or medium issue.
It reused the focused evidence rather than repeating the full phase suite:

- CLI boundaries: 2 files / 6 tests PASS;
- temporary PostgreSQL behavior: 3 files / 9 tests PASS;
- typecheck, scoped lint, and deployment invariants: PASS; and
- `git diff --check`: PASS.

## Residual gated work

This PASS does not attest a real Production cluster, launchd PID, provider
response, real backup generation/off-host coverage, or target write. Those
remain PA-B, PA-C, PA-D, or P4 gate evidence. Managed/Neon backup remains
unsupported until a separate verify-full backup contract is reviewed.
