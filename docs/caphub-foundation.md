# Caphub P1 Foundation — Custody and Operations

Caphub P1 is a disabled-by-default Web Capture intake. P2 adds a separately
disabled analysis service that can turn one immutable Capture into a durable,
review-only `ReviewPacket` through bounded preprocessing, provider analysis,
approved-source research, assessment, optional critique, and a resumable
filesystem workflow. P3 adds a separately disabled PostgreSQL metadata Registry
and Human Review Center. None of these phases installs, builds, publishes,
deploys, or releases a capability.

This guide describes the implemented P1/P2/P3 adapters and their operational
boundary. P2 and P3 remain safe-off in production; code and fixture verification
do not authorize provider traffic, database provisioning or migration,
configuration enablement, restart, deployment, or release.

## Configuration and request boundary

The optional Control Host `caphub` block is strict:

```json
{
  "caphub": {
    "enabled": false,
    "allowedOrigins": ["https://alljobs.agentjoey.ai"],
    "maxUploadBytes": 10485760,
    "analysis": {
      "enabled": false,
      "kimiMode": "api_key",
      "sourceAllowedOrigins": []
    }
  }
}
```

- `enabled` defaults to `false` when the block is present. A missing, invalid,
  or disabled block is a safe-off state; capture routes return a bounded `503`.
- `maxUploadBytes` defaults to 10,485,760 bytes and must be from 1,048,576
  through 20,971,520 bytes, inclusive.
- `allowedOrigins` contains at most eight exact HTTPS origins. Paths, queries,
  credentials, fragments, public HTTP origins, and arbitrary filesystem roots
  are rejected.
- `analysis.enabled` independently defaults to `false`; outer Caphub and
  analysis must both be enabled before the service reads a Capture. Provider
  endpoints/models are fixed, secrets are environment-variable references,
  concurrency is one, and configured limits can only tighten compiled bounds.
- Analysis source access remains disabled when `sourceAllowedOrigins` is empty.
  Enabling analysis does not silently enable search or arbitrary URL fetch.
- The browser POST requires an exact allowed `Origin`, `multipart/form-data`,
  and a decimal `Content-Length`. The request length is rejected before body
  parsing when it exceeds the configured image limit plus the fixed 32 KiB
  multipart allowance. The parsed `File.size` is checked again before bytes are
  read.
- POST accepts only the fields `image`, `idempotency_key`, `note`, and
  `source_url`. It requires exactly one non-empty image, one idempotency key,
  at most one note, and at most one source URL. The filename is 1–255
  characters. The key is 16–128 characters matching
  `[A-Za-z0-9._:-]+`. Supported image MIME types are `image/png`,
  `image/jpeg`, and `image/webp` only. The optional source URL must use HTTPS
  and is limited to 2,048 characters; the note is limited to 4,000 characters.
- GET `/api/caphub/captures/[id]` returns validated Capture metadata only. POST
  receipts and GET responses omit the filesystem path, object key, and
  idempotency key; neither route returns the raw object bytes.
- Success and error responses set `Cache-Control: no-store` and
  `X-Content-Type-Options: nosniff`. Errors use stable, bounded messages and do
  not expose host paths, secret values, or raw internal failures.

Cloudflare Access, the Tunnel, and the loopback-only AllJobs origin remain
separate outer boundaries. This guide does not authorize changing them or
enabling Caphub in production.

## Resolved state root and tree

The application derives the Caphub root as the exact resolved
`<ALLJOBS_HOME>/state/caphub` directory. The configuration and HTTP callers
cannot supply or redirect this path. The root must already be absolute and
resolved, must end in `/state/caphub`, and must not be a symlink alias.

```text
<resolved Caphub root>/
├── objects/
│   └── sha256/
│       └── <first-two-digest-characters>/
│           └── <64-character-sha256-digest>
├── records/
│   ├── captures/
│   │   └── <capture-id>.json
│   ├── analysis-jobs/
│   │   └── <job-id>.json
│   ├── analysis-artifacts/
│   │   └── <artifact-id>.json
│   └── idempotency/
│       └── <sha256-of-idempotency-key>.json
├── events/
│   ├── YYYY-MM.jsonl
│   └── model-calls/
│       └── <job-id>.jsonl
└── locks/
    └── <sha256-of-idempotency-key>.lock
```

Every descendant path is produced by a validated path helper and anchored
under the resolved root. Capture IDs, object digests, month labels, and
idempotency keys are validated before derivation. Idempotency keys are hashed
for index and lock filenames. Callers never provide a pathname.

`locks/` is a reserved derived namespace for ephemeral idempotency locks; P1
does not materialize it. The current adapters serialize record creation by
idempotency-index path and audit creation by monthly-event path with in-memory
promise chains. This is process-local coordination for the single active
Control Host process, not a cross-process lock. Multiple concurrent Caphub
writer processes are unsupported. Operators must keep exactly one active
Control Host writer; a future multi-process deployment requires a separately
reviewed cross-process lock before enablement.

## P2 analysis workflow

`createAnalysisService(...).start(captureId)` accepts only a validated Capture
ID and returns job/ReviewPacket artifact identifiers, never raw provider
output. The fixed stage order is:

```text
preprocess -> extraction -> research -> assessment -> critic? -> review_packet
```

Jobs are atomically replaced, artifacts are immutable and content addressed,
and model-call events have deterministic identifiers. Restarts recover durable
artifacts without repeating their stages. A provider `started` event without a
terminal event, or a terminal event without its committed artifact, routes to
`HUMAN_REVIEW_REQUIRED` instead of repeating a possibly billable call.

The provider boundary allows one initial structured call and at most one
schema correction; transport retries are zero. MiniMax has no tools. Kimi API
mode is direct server-side structured output with fixed model `k3-256k`;
local-login mode is the only CLI path and runs inside the reviewed zero-tool
Seatbelt and fixed-target loopback-proxy boundary. Research uses exact approved
HTTPS origins with public-address pinning, TLS peer validation, redirect
reauthorization, content limits, and an injected search port only.

`npm run caphub:analyze -- <capture-id>` defines the strict local entrypoint.
Its parser accepts no path, URL, prompt, provider, model, or secret argument.
It then loads one fixed server-only Control Host composition: secure Capture
and workflow stores, packaged OCR/barcode readers, fixed MiniMax and Kimi
providers, and the exact-origin source gateway. The command remains safe-off
unless both `caphub.enabled` and `caphub.analysis.enabled` are true; disabled
configuration is rejected before provider secrets are read. API-key mode reads
only the configured environment-variable names, while local-login mode uses
the fixed Kimi executable/profile locations and reviewed sandbox boundary.

OCR and whole-stage deadlines propagate an abort signal into the recognizer;
the packaged Tesseract worker is terminated on abort. Research output is
accepted only when `claim_checks` contains each extracted Claim exactly once
and no foreign Claim IDs.

Every `ReviewPacket` preserves immutable sources, OCR, Entities, Claims,
Evidence, conflicts, alternatives, dimensions, model-contract versions, and
unresolved questions. Platform previews are deterministic and non-executable;
`human_review_required` is always true.

## Filesystem custody

The resolved root and every existing descendant used by an adapter must be a
real, owner-controlled directory, not a symlink, and not group- or
other-writable. Descendant directories are created with `0700` intent and new
files with `0600` intent. The adapters recheck ownership, type, permissions,
and non-symlink traversal around reads and writes; a failed check closes the
operation rather than following an unsafe path.

## P3 PostgreSQL Registry and Human Review

P3 stores versioned metadata, lineage, imports, Human decisions, decision
consumption, and audit events in PostgreSQL while retaining raw object bytes
behind the P1 content-addressed object-store port. Runtime loading is fail
closed: outer Caphub and `caphub.registry.enabled` must both be true, and the
configured server-only environment variable must contain the connection URL.
The default Registry configuration remains disabled.

The application pool sets a fixed application name, a bounded connection count,
a statement timeout, a 30-second idle timeout, and certificate-validated TLS.
Connection-string TLS overrides are rejected. The only non-TLS exception is the
sentinel-owned E2E cluster: PostgreSQL 17 runs on a private Unix socket under a
temporary owned root and is accepted only when its root, sentinel, owner PID,
socket, role, URL parameters, and object root all match the fixture contract.

Migrations are forward-only, checksum-bound, and serialized by a PostgreSQL
advisory transaction lock. The migration role and least-privileged `caphub_app`
role are separate. Immutable versions, lineage, imports, decisions, consumers,
and audit entries are protected by constraints, privileges, and append-only
triggers. Do not edit an applied migration or use the application role to run
migrations.

The Review Center reads explicit safe DTOs only. Its queue filters kind, state,
value, risk, and waiting age in PostgreSQL before the page limit, and its keyset
cursor matches the complete oldest-first / higher-risk / request-ID order.
Decisions bind an exact subject version and digest, expected lock version, actor,
typed confirmation, and idempotency intent. Reject is permanent; an approval may
be revoked only before it is consumed. Candidate approval can record one of the
five reviewed dispositions; other approval kinds carry no Candidate
disposition.

P3-C verification used only the owned temporary database and loopback final
build. Production provider selection, credentials, Secret management,
networking, backup/PITR, migration rehearsal/execution, service restart,
deployment, and traffic change remain Gate P3-D operations. Keep the Registry
disabled until that separate Human gate is explicitly approved.

### Immutable objects

The object adapter computes SHA-256 from the received bytes and derives the
final object path from that digest. It writes a unique temporary sibling with
exclusive creation, flushes and rereads the staged bytes, and finalizes with a
hard link that cannot replace an existing destination. The parent directory is
flushed before the adapter returns. If the address already exists, the adapter
accepts it only when the byte length and bytes match exactly; a different
payload at that digest address is an error. Stored object bytes are never
overwritten.

### Capture records and idempotency indexes

Capture records are strict schema-versioned JSON. Each new record is created
atomically through an exclusive temporary sibling, file flush, exclusive hard
link, and parent-directory flush. The idempotency index is created the same way
and contains only:

```json
{
  "schema_version": 1,
  "idempotency_key": "<validated original key>",
  "capture_id": "<capture-id>"
}
```

The key is preserved inside the validated index but its filename is the
key's SHA-256 digest. Existing Capture JSON and index files are not replaced.
Reads validate the complete schema and cross-check that an index points to a
Capture bound to the same key.

### Monthly audit log

Audit events are strict NDJSON in the month selected by the Capture's
`occurred_at` timestamp. The `capture.received` event ID is derived
deterministically from the Capture ID. `ensure` scans the bounded monthly file,
accepts an existing event only when its complete immutable content matches,
and otherwise appends exactly one line before flushing the file and parent
directory.

If an interrupted append leaves an incomplete final line, the next `ensure`
truncates only that partial tail, flushes the repaired file, and then appends or
confirms the deterministic event. Blank, malformed, schema-invalid, or
conflicting complete events fail closed.

## Stable retry and retention behavior

The canonical idempotency payload comprises the validated key, filename,
image MIME type, exact bytes/digest and length, note, and optional source URL.
The stable guarantees below apply after the idempotency index is durable and
while one active Control Host process owns writes.

- The same key plus the same canonical payload returns the existing receipt as
  `duplicate`. It does not create a second object, Capture, index, or audit
  event.
- Both the created and duplicate paths call the idempotent audit `ensure`.
  Therefore a retry after a durable record but failed audit append heals the
  missing deterministic event before returning the duplicate receipt.
- The same key plus any different canonical payload returns
  `IDEMPOTENCY_CONFLICT`; it never rebinds the key.
- Object storage happens before metadata, and metadata before audit. An audit
  failure can therefore leave a durable, queryable Capture. Retry the exact
  payload and key; do not invent a new key for that same attempt.

Capture JSON is finalized before its idempotency index. A failure in that
interval can preserve content-addressed bytes or an unindexed Capture without a
completed receipt. The process-local chains also cannot coordinate independent
writer processes; unsupported multi-process writes can leave unindexed
Captures/objects or duplicate evidence. These are preserved incident states,
not permission to repair indexes, merge records, or remove files by hand.

An exact retry is a stable duplicate/healing operation only when the matching
index is already durable. If index durability is unknown, remain safe-off and
validate/escalate before deciding whether a separately approved retry is safe.
The deterministic audit `ensure` provides one matching event under the same
single-process boundary; it is not a cross-process append lock.

Original bytes, Capture records, idempotency indexes, and audit events are
retained indefinitely in P1. There is no delete API, retention control, or
automatic expiration. Any later retention or deletion design requires a
separate plan, safety review, migration/rollback design, and Human approval.

## Backup as one consistency unit

Treat the entire exact resolved Caphub root as one consistency unit. An object,
Capture record, idempotency index, and audit event describe one custody chain;
backing up selected subdirectories can produce an internally inconsistent
copy.

1. Put Caphub in safe-off state and stop capture writes before the backup. A
   separately approved operational procedure may set `caphub.enabled` to
   `false`; obtain read-only operational confirmation that no Caphub writer is
   accepting requests before copying state. The default backup procedure does
   not send a live capture request.
2. Resolve and record the single canonical absolute Caphub root from the active
   Control Host configuration. Reject a root that is unresolved, a symlink, or
   does not end in `/state/caphub`.
3. Back up that exact root in one snapshot/copy operation. Preserve ownership,
   directory and file permissions, hard-link-safe byte content, timestamps
   where supported, and symlink safety. Do not follow links or broaden the
   source to a home, state, repository, or filesystem root.
4. Keep Caphub safe-off until the backup has been checked for a complete tree,
   unchanged object hashes, parseable strict JSON, valid idempotency links, and
   complete NDJSON lines.

Never use `~`, `$HOME`, `/`, a glob, an unresolved environment variable, or an
operator-guessed path as the backup target or source.

## Recovery

Recovery is an offline custody operation, not an application merge.

1. Keep Caphub disabled and confirm writes have stopped. Preserve the current
   state for incident evidence; do not modify it in place.
2. Independently resolve the exact active Control Host Caphub root and verify
   its owner, non-symlink ancestry, and `/state/caphub` suffix. Restore only the
   complete backup unit into that exact root. Do not restore into a nearby
   directory and do not combine selected files from different backup times.
3. Preserve owner custody and the `0700` directory / `0600` file intent. Reject
   symlinks, non-regular files where data files are expected, foreign owners,
   and group- or other-writable descendants.
4. Before any re-enable decision, validate every Capture and idempotency index
   against its strict schema, verify each index target/key pair, recompute each
   referenced object's SHA-256 and byte count, and validate each monthly NDJSON
   event. Inventory unindexed Captures, unreferenced objects, missing events,
   and multiple events with the same deterministic ID as incident evidence;
   preserve and escalate them without hand-editing or removal. A partial final
   audit line may be repaired only by the implemented deterministic `ensure`
   path during a separately approved exact-payload retry; do not hand-edit an
   event into existence.
5. Re-enablement, service reload/restart, live smoke testing, and production
   release remain separate Human-gated actions. This guide does not authorize
   them.

If validation fails, remain safe-off, preserve both the incident state and the
backup, and escalate with metadata-only evidence. Do not expose object bytes,
idempotency keys, absolute paths, secrets, or raw internal errors in a ticket or
UI.

## Rollback boundary

A P1 code rollback reverts the approved Caphub application commits and restores
the previously approved application build. It does not erase or rewrite the
Caphub state tree. The older application can leave that data untouched while
operators retain it as custody evidence.

Data disposal, retention changes, or migration are separate destructive data
operations and are not part of code rollback. They require a new read-only
inventory, an exact resolved target, a dedicated plan, and explicit Human
authorization. No P1 rollback step instructs an operator to remove captured
data.

## Adapter boundary and future systems

P1 depends on ports rather than a database-specific service:

- `CaptureStore` owns Capture metadata and idempotency lookup/create.
- `CaptureObjectStore` owns immutable object bytes.
- `CaptureAuditLog` ensures the deterministic receipt event.

A future PostgreSQL metadata implementation must be a separately planned and
approved `PostgresCaptureStore` implementing the existing `CaptureStore`
contract. Metadata migration, consistency checks, cutover, and rollback must
be designed and approved independently. Object bytes remain behind
`CaptureObjectStore`; introducing a metadata adapter does not move or expose
them automatically.

Obsidian is absent from P1. A future separately approved integration may
consume approved Registry exports only; it must not read the P1 custody tree as
an alternate source of truth. PostgreSQL and Obsidian are future
adapter/integration boundaries, not installed or active P1 runtime features.

## Explicit P1/P2/P3 negative capabilities

P1 intake still stops at `received`. P2 adds analysis only. P3 may import the
immutable ReviewPacket and record a Human decision, but it has no Telegram
intake, publish or install action, Builder, code execution, Shell or Git access,
capability deployment, runtime routing, Obsidian integration, or production
database enablement. A ReviewPacket or approval cannot create a BuildProposal,
Release, implementation handoff, package, deployment, or external write.
