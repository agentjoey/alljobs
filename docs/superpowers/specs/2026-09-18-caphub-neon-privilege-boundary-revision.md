# Caphub Neon privilege-boundary revision

Date: 2026-09-18

Supersedes only the PostgreSQL-role least-privilege assumption in
`2026-09-17-caphub-neon-production-activation-design.md`. All other P1–P4
scope, target safe-off state, provider gates, private Object Storage contract,
and PA-D reload/cutover gate remain unchanged.

## Decision

The Human accepts that Neon automatically makes `caphub_app` and
`caphub_migrator` inherited members of `neon_superuser`, and that the current
Neon control plane does not expose a supported way to remove that membership or
set `NOINHERIT`. These two login identities are therefore **not** a database
least-privilege boundary. They must be treated as high-privilege credentials for
the entire current Neon project.

The original claim that the application role cannot run migrations or update
append-only tables is withdrawn. No document, readiness report, or release
claim may describe those properties as enforced by PostgreSQL permissions.

## Compensating boundary

This decision keeps the narrowest practical boundary without adding a new
provider or self-hosted database:

- Caphub uses a separate `caphub` database and its own private bucket. No
  Caphub migration or import is run against `neondb`.
- Both credentials remain only in the installed mode-`600` Control Host
  LaunchAgent environment. They never enter repository configuration, logs,
  screenshots, docs, or browser state.
- Code accepts only the two exact direct/transaction-pooler database hosts and
  the exact HTTPS Object Storage host. It does not use an IP allowlist,
  wildcard host, ambient credential chain, or public bucket.
- Database-changing operator commands require their existing explicit
  confirmations and run only while `com.agentjoey.alljobs` remains stopped.
  PA-D still exclusively controls service rebuild/reload and entry into S3.
- Caphub's application-level immutable object verification, append-only
  triggers, checksum-bound migration ledger, Registry lineage, approval
  confirmations, disabled analysis, and disabled export targets remain active
  controls. They are integrity controls, not a substitute for a database-role
  privilege boundary.

## Required implementation change

`checkRegistryReadiness` and its tests must stop requiring `NOINHERIT`, no
`neon_superuser` membership, `appCanMigrate === false`, or
`appCanUpdateAppendOnly === false` when `connectionMode` is
`tls_verify_full`. They must still require:

1. exact application/migrator identities and database name;
2. PostgreSQL 18 over managed TLS with exact configured hosts;
3. `caphub_migrator` as database owner;
4. no direct application/migrator role membership;
5. complete checksum-exact migration ledger and all append-only triggers;
6. an explicit `databasePrivilegeBoundary: "neon_project_admin_accepted"`
   field in the redacted readiness result for managed TLS.

The local Unix-socket mode retains its existing strict role-privilege checks.
The new managed-TLS field is status metadata only; it cannot be selected by
browser input or alter any export/provider/target policy.

## Verification and release consequences

- Add focused RED→GREEN tests for the managed-TLS accepted-admin condition and
  retain regression tests showing local mode still rejects elevated roles.
- Re-run the exact production readiness report after the code change. It must
  expose the accepted boundary label but no URL, username, credential, host,
  object key, or Capture bytes.
- Registry import may proceed only after that report is ready and its source
  digest matches the N2 owner-only attestation.
- This revision does not authorize a service reload, provider request, target
  write, push, merge, deployment, release, or removal of any Neon resource.

## Residual risk accepted by the Human

Compromise of either Caphub database credential can affect databases in the
current Neon project beyond the intended Caphub database. The mitigation is
credential secrecy and the stopped-service/explicit-operator workflow above,
not PostgreSQL grants. Moving to a provider or role model that can enforce
least privilege remains a future architecture option and is out of this
activation.
