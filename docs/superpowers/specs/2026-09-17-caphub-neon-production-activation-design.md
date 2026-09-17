# Caphub Neon Production Activation Design

**Date:** 2026-09-17
**Status:** Draft revision for Human review
**Supersedes for future execution:** the local PostgreSQL / local-object-storage
placement in `2026-09-17-caphub-production-activation-design.md`; that document
remains the historical local-first record.

## 1. Decision and verified facts

Caphub will use the existing dedicated Neon project `alljobs`, on its existing
`production` branch, for both Registry metadata and immutable Capture objects.

The actual Neon control plane was read on 2026-09-17. It reports that this
branch is the project's primary/default Production branch in
`aws-ap-southeast-1`; it exposes Object Storage and currently has no buckets.
This live capability takes precedence over an older skill/documentation region
note that described a narrower beta rollout. Object Storage remains a beta
service; its Production use is an explicit Human-approved risk.

No Neon project, branch, bucket, database, role, endpoint, credential, object,
or connection setting has been changed by this decision.

## 2. Product and safety boundary

The P1–P4 product boundary is unchanged: Capture, operator-started analysis,
Review Center, exact Candidate/Release decisions, and read-only neutral/adapter
previews. P4 targets, P5/P6, automatic analysis or approval, source search,
publish/install/rollback writes, code execution, shell/Git features, and any
provider call remain outside this revision.

The current Production application remains stopped in S1. It must not restart,
reload, or enter S3/S4 until the separate cutover gate is approved.

## 3. Target topology

```text
Cloudflare Access + Tunnel
          |
          v
127.0.0.1:3456  com.agentjoey.alljobs
          |
          +-- TLS verify-full, pooled app connection
          |       Neon Registry database / caphub_app
          |
          +-- TLS verify-full, direct migration and backup connection
          |       Neon Registry database / caphub_migrator
          |
          +-- private Neon Object Storage bucket / content-addressed objects
                  sha256/<prefix>/<digest>
```

The existing refresh worker, Tunnel, Access policy, public domain, and loopback
listener do not change. The bucket is private: browser clients never receive
raw S3 credentials and the app does not expose public object URLs.

## 4. Database and credential contract

The Production branch will contain database `caphub` and the two
least-privilege identities `caphub_app` and `caphub_migrator`. They do not yet
exist; creation is part of the later N1 gate.

- The app URL uses Neon pooling when enabled and only the application role.
- Migrations and provisioning validation use an unpooled/direct URL and only
  the migrator or a narrowly scoped one-time provisioning identity. Recovery
  is proven with a Neon branch containing both the Registry database and
  private bucket state; it does not depend on the retired local
  `pg_dump`/`pg_restore` procedure.
- Every TCP connection is parsed as `tls_verify_full`; a password, endpoint,
  database name, role, or TLS override that does not match the approved
  contract fails closed.
- URL values, object-storage access keys, and secret access keys are installed
  only as private LaunchAgent environment entries. Repository configuration and
  evidence contain environment-variable names, never values.
- Network access is restricted to the Control Host's approved egress address
  before any application URL is installed. The current project-wide public
  connection setting is not accepted as the final Production posture.

The implementation may use standard PostgreSQL and S3-compatible APIs only.
It must not depend on Neon Functions, Auth, AI Gateway, Data API, proprietary
extensions, or runtime branch-management APIs.

## 5. Immutable Object Storage contract

Create one private Production bucket named `caphub-objects`. Bucket visibility
is intentionally immutable after creation, so no public-read bucket is allowed.

The object key remains the existing content address:

```text
sha256/<first-two-digest-characters>/<full-sha256-digest>
```

`CaptureObjectStore` gains an S3-compatible adapter with the same port as the
local adapter. For every write it computes the SHA-256 before upload, rejects a
key/ref mismatch, writes only the content-addressed key, verifies size and
stored digest metadata, then re-reads and hashes the object before success.
An existing key is accepted only when its exact bytes and digest agree; it is
never overwritten, deleted, or repointed. Read verifies the expected byte
count and SHA-256 before returning bytes.

The existing local object tree is retained untouched through cutover and is a
read-only rollback source. No object deletion, retention pruning, or cleanup is
part of this migration.

## 6. Migration and recovery sequence

### N0 — implementation and validation branch

Implement the TLS connection parsing, managed provisioning boundary,
S3-compatible immutable adapter, and source-to-bucket migrator with TDD/BDD.
Use a non-Production Neon validation branch for a checksum-bound migration and
synthetic object fixture only. Do not copy real Capture data into validation.

### N1 — Neon provisioning gate

A fresh Human authorization is required immediately before any Production Neon
write: creating the bucket/database/roles, enabling pooling, changing the
network allowlist, issuing credentials, or installing private environment
references. The prior local PA-B authorization does not authorize these
different remote changes.

### N2 — object-first source preservation

With the app still stopped, create a read-only manifest of the complete local
Capture tree. Upload every immutable object to `caphub-objects` under its
content-addressed key, then independently list/read/hash the remote objects and
compare the complete manifest. The original tree is unchanged. This verified
private remote copy replaces the previously unavailable Time Machine source
backup prerequisite; a failed or incomplete transfer blocks all Registry
database writes.

### N3 — Registry migration and import

Apply the existing forward-only migrations with the direct migrator URL. Run
the existing Capture dry-run, import only with its exact source digest, and
compare Capture IDs, idempotency keys, object refs/digests, audit counts,
lineage, and migration checksums. Registry import must refer only to verified
remote object keys before it is accepted.

### N4 — recovery proof and cutover

Before application cutover, create a Neon recovery point/branch consistent with
the Production database and bucket state, restore it into an owned validation
branch, and prove migration checksums, Registry counts, Capture object hashes,
and private bucket access. Preserve the local source tree and the recovery
branch until a later Human-approved retention design exists.

Only after the existing PA-D gate may the app receive its private Neon
environment references, rebuild/reload, and enter S3. PA-C still controls the
single real Kimi compatibility canary; all P4 target gates remain closed.

## 7. Failure handling

- Missing TLS verification, an unsafe endpoint, a public bucket, an unapproved
  egress address, or a missing credential fails closed before a write.
- Object mismatch, existing-key byte mismatch, incomplete manifest, database
  checksum drift, or recovery mismatch leaves the app stopped and preserves
  both local and remote evidence without deletion.
- A Neon outage leaves Capture/Registry/analysis safe-off; it does not open a
  local TCP listener or fall back to an unverified object source.
- Rollback returns the app to the prior approved filesystem-only build while
  retaining the local tree, Neon database, private bucket, recovery branch, and
  audit evidence. It never migrates down or deletes remote data.

## 8. Acceptance criteria

Implementation acceptance requires:

1. focused RED→GREEN tests for strict Neon URL policy, S3 immutable semantics,
   manifest transfer, failure/retry idempotency, and no-delete behavior;
2. BDD on a non-Production Neon validation branch with synthetic records and
   objects;
3. full typecheck, lint, build, deployment invariant check, and final-build
   browser evidence where UI changes;
4. one scoped independent Review and one independent Verification after the
   final implementation commit; and
5. a runbook that records only aliases, counts, digests, migration checksums,
   resource IDs where necessary, and safe state transitions.

No Production Neon resource, provider request, application reload, target
write, push, merge, release, or deletion is authorized by this specification.
