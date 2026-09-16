# Caphub P3 Review Registry Threat Model

**Status:** P3-C focused independent Review and Verification PASS
**Date:** 2026-09-16
**Scope:** disabled-by-default PostgreSQL Registry, immutable lineage, ReviewPacket import, Human review decisions, and read-only Review/Capture/Capability views
**Out of scope:** production database selection or credentials, backup/PITR execution, production migration, Release or Build creation, implementation handoff, publication, installation, Git mutation, deployment, and traffic changes

## Protected assets

- Database credentials and connection metadata.
- Immutable Capture, analysis, Candidate, Evidence, ReviewPacket, lineage, decision, consumption, and audit records.
- Exact subject digest/version and decision authority state.
- Filesystem object bytes retained behind the existing object-store port.
- Human identity and typed confirmation at the mutation boundary.
- Control Host paths, object keys, prompts, reasoning, raw provider responses, and production configuration.

## Trust boundaries

1. Capture bytes, OCR, source material, model output, imported packets, query parameters, and browser form data are untrusted.
2. Strict schemas, canonical digests, parameterized SQL, migrations, PostgreSQL constraints/triggers, row locks, and serializable transactions are trusted enforcement code.
3. The application role may use reviewed Registry functions and tables but cannot run migrations or disable append-only controls.
4. The migration role is fixture-only in P3-C. Production role creation, migration, backup, and PITR remain Gate P3-D operations.
5. Server Components project explicit DTOs. Browser code receives no connection string, secret, host path, object key, prompt, reasoning, or raw database row.
6. Human review may append a decision for one exact subject version. It has no capability to build, release, publish, install, mutate Git, execute code, or deploy.

## Threat and control matrix

| Threat | Control | P3-C evidence |
|---|---|---|
| SQL injection or malformed identifier | strict ID/query schemas and parameterized SQL | hostile-string PostgreSQL tests; focused read-query tests |
| Migration drift or concurrent migration | frozen SHA-256 manifest, advisory transaction lock, applied-checksum comparison | real PostgreSQL migration tests |
| App role bypasses migration/append-only rules | separate least-privilege application role; trigger and privilege enforcement | role-negative and append-only PostgreSQL tests |
| Mutable Registry history | immutable version rows, append-only lineage/decision/audit tables, trigger rejection | direct update/delete negative tests |
| Duplicate or stale Human decision | exact subject digest, expected lock version, row lock, serializable transaction, stable idempotency intent | stale, concurrent-winner, and idempotency tests plus browser BDD |
| Rejected request later approved | terminal Reject state and database/application rejection | decision transaction tests and final-build E2E |
| Approval revoked after consumption | consumption linkage and unconsumed-only revocation | application-role revoke/consume tests and approved-consumed UI state |
| Parallel review requests create two winners | atomic supersession and one terminal winner | PostgreSQL concurrency tests and scoped review fix |
| Approval creates later-phase authority | no Release/Build/deploy ports in P3; negative schema and record-count assertions | integrated browser-to-DB BDD confirms zero later-phase records |
| Browser leaks secrets or custody details | explicit safe DTOs and bounded error codes | component/query tests and rendered state inspection |
| Client filtering hides records beyond first page | all filters execute in SQL before the limit; cursor is server-owned and linked | query contract test and scoped independent re-review |
| Hostile evidence executes in the UI | React text rendering and no raw HTML | final-build hostile evidence assertion |
| Production database contacted during verification | sentinel-owned temporary PostgreSQL 17.11 cluster over a private Unix socket | fixture ownership checks; loopback-only browser server |

## Decision invariants

- Every decision is bound to one request, subject ID, subject version, full digest, actor, action, and idempotency intent.
- Candidate approval alone may record `adopt`, `adapt`, `build`, `learn`, or `watch`; other review kinds do not send a Candidate disposition.
- Reject is permanent. Revocation is a new append-only decision and is allowed only while the original approval is unconsumed.
- A concurrent terminal winner is returned as the stable receipt. A stale same-request mutation preserves entered rationale and requires refresh.
- A decision can resume the reviewed analysis record but cannot create a BuildProposal, Release, Deployment, package, handoff, or external side effect.

## Residual boundaries

- P3-C proves the implementation against an owned temporary PostgreSQL 17.11 cluster. It does not select or validate a production provider, secret store, network policy, backup, PITR, migration window, or rollback runbook.
- Object bytes remain in the P1 local content-addressed store. P3 moves reviewed metadata and workflow state behind PostgreSQL adapters; it does not migrate or expose object bytes.
- Existing dependency advisories remain a production-enablement gate and were not expanded into an unplanned framework upgrade.
- Runtime enablement requires both outer Caphub and Registry flags plus a server-only connection-string environment variable. Defaults remain safe-off.
- Gate P3-D is a hard stop. No production credential, migration, configuration enablement, service restart, deploy, traffic switch, push, merge, tag, or release is authorized by this record.
