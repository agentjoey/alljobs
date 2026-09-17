# Caphub P1–P4 Neon Production activation runbook

Date: 2026-09-17

This is an operator checklist, not standing authorization. Run from the exact
accepted checkout. Record aliases, digests, counts, migration checksums, and
pass/fail states only. Never record secret values, database URLs, hostnames,
absolute state paths, object keys, prompts, raw provider responses, or Capture
bytes.

The application listener is already stopped in S1. It remains stopped through
N1–N4. No command below authorizes a provider request, target write, push,
merge, release, deletion, listener reload, or Production cutover.

## S0 — metadata-only inventory

```bash
git rev-parse HEAD
npm run verify:deploy
npm run caphub:preflight
```

Expected: loopback-only application, fixed migration IDs/checksums, no enabled
targets, redacted values only, and `readyFor: "PA_B"`. The preflight accepts no
flags and performs no writes. A `PREFLIGHT_*` error or any unsafe configuration
blocks progress.

## N1 — Neon provisioning (fresh Human authorization required)

Obtain a new authorization immediately before any Production Neon write. It
must name the accepted build and allow only the required actions: private
`caphub-objects` bucket creation, Registry database/least-privilege role setup,
pooling/network posture, credential issuance, or private environment-reference
installation.

Before a write, verify the existing `alljobs` Production branch and its Object
Storage capability in the Neon control plane. Create no public bucket. Keep
object storage private; do not expose S3 credentials or public URLs. A missing
TLS verify-full connection, approved host, egress policy, or credential boundary
is a hard stop.

For the optional non-Production BDD, authorization must separately name exact
source and recovery branch aliases plus their exact database and Object Storage
hosts. The fixture requires those host references to match the supplied URLs
before constructing a pool or S3 client; it never reads Production environment
names or accepts an alias as resource identity proof.

## N2 — object-first source preservation

Keep the listener stopped. First produce the immutable source manifest, then
copy the exact manifest and independently prove every remote object:

```bash
npm run caphub:object-transfer -- --dry-run
npm run caphub:object-transfer -- --apply --digest <SOURCE_SHA256> --confirm COPY-CAPHUB-OBJECTS
npm run caphub:object-transfer -- --dry-run
npm run caphub:activation-attest -- object-transfer --source-digest <SOURCE_SHA256> --object-count <OBJECT_COUNT> --matches-remote --confirm RECORD-CAPHUB-OBJECT-TRANSFER
npm run caphub:preflight
```

The apply result must have the exact source digest and matching object and
verified-object counts. The attestation command is local-only: it records only
the digest/count/boolean once in a private owner-only file and refuses an
overwrite. It does not contact Neon. A mismatch, existing-key disagreement,
incomplete remote listing, or source mutation stops the migration. Preserve the
local tree and all remote evidence; do not delete, move, or rewrite objects.

## N3 — Registry migration and Capture import

With remote-object attestation recorded and still no listener, provision and
migrate only through the direct migrator identity. Use the exact Capture import
digest from a dry run; Registry records must resolve only to the verified remote
object keys. Verify migration checksums, IDs, idempotency keys, Capture
digests/counts, audit/lineage records, and least application privileges. The
managed readiness report must say `managed_tls`, not disclose an endpoint.

Record the redacted Registry/import result, then run:

```bash
npm run caphub:preflight
```

Any migration checksum drift, missing record, privilege mismatch, or object
reference mismatch leaves Caphub safe-off and blocks cutover.

## N4 — recovery proof

Create a Neon recovery point/branch consistent with the Production Registry and
private bucket, restore it into an owned validation branch, and prove migration
checksums, Registry counts, Capture object hashes, and private bucket access.
This is a Production Neon operation and requires the specific authorization
covering the recovery resources. Do not use a public bucket or retain secrets
in evidence.

After the restore proof succeeds, record only its boolean completion:

```bash
npm run caphub:activation-attest -- recovery --verified --confirm RECORD-CAPHUB-RECOVERY
npm run caphub:preflight
```

The preflight cannot advance beyond `PA_D` until both immutable-object and
recovery attestations agree with the Capture-import digest. The local source
tree and recovery branch remain preserved.

## PA-D — application cutover (separate final Human Gate)

PA-D must name the accepted commit/build, migration checksums, object digest and
count, recovery proof, intended private environment-reference/config diff, and
rollback build. Only then may the operator install the private Neon environment
references, rebuild/reload `com.agentjoey.alljobs`, and enter S3. Do not restart
the refresh worker, Tunnel, Access, or domain.

## S3 / PA-C / S4

S3 permits Capture, Review, and P4 read-only previews only. PA-C remains the
separate one-request Kimi compatibility canary (`k3-256k`, synthetic input, no
tools/retry). S4 still requires a separately approved official third-party
Capability source and keeps every target write, install, publish, code-execution,
shell, Git, and deployment capability closed.

## Failure containment and rollback

Any unsafe endpoint, public bucket, credential exposure, source/remote mismatch,
Registry drift, recovery mismatch, unexpected writer, or provider uncertainty
keeps Caphub safe-off. Preserve local captures, Neon database/bucket/recovery
branch, and redacted evidence without deletion. Rollback restores the prior
approved filesystem-only build and loopback listener only after a new Human
decision; it never deletes or down-migrates Neon resources.
