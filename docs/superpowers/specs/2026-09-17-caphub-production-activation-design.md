# Caphub P1–P4 Production Activation Design

**Date:** 2026-09-17

**Status:** Approved direction — local-first Production pilot, implementation pending

**Production baseline:** `50abeae8719f297a44955b076f9a9d7299f5abbe`

**Related phases:** P1 Capture, P2 analysis, P3 Review/Registry, P4 package/export preview

## 1. Goal

Activate the already accepted P1–P4 Caphub implementation on the single AllJobs
Control Host so the Human Owner can capture evidence about a third-party
capability, run bounded model analysis, review the resulting Candidate, approve
or reject exact versions, compose and approve a neutral Release candidate, and
inspect deterministic package and Codex/Claude/Hermes adapter previews.

The pilot is successful when one new third-party capability completes this
flow on the Production build with exact commit, migration, database, audit,
review, screenshot, backup, and rollback evidence.

## 2. Approved product boundary

The Production pilot includes:

1. P1 screenshot Capture through `/caphub`, with immutable local object bytes.
2. P2 operator-started analysis using MiniMax M3 for extraction/critic and the
   Kimi Coding API model `k3-256k` for research/assessment.
3. P3 PostgreSQL Registry, Review Center, exact-version decisions, lineage, and
   append-only audit history.
4. P4 neutral Capability Package rendering and read-only Codex, Claude Code,
   and Hermes adapter previews.
5. P4 Release approval finalization without writing any real export target.

The Production pilot excludes:

- P5 self-built capability planning, implementation handoff, agent execution,
  code generation, Git changes, merge, or deployment;
- P6 Runtime Router, automatic selection, evals, update watcher, or scheduled
  model work;
- automatic analysis after Capture, automatic approval, automatic Release
  composition, automatic publication, or automatic retries;
- a real Obsidian Vault, package repository, Codex skill root, Claude skill
  root, Hermes skill root, install, publish, rollback, or pointer switch;
- source search, unrestricted browsing, arbitrary URLs, tools, shell, code
  execution, Git operations, or deployment capability;
- moving Capture object bytes to PostgreSQL or Neon.

P4 `exports.enabled` may be true only to expose deterministic neutral package
and adapter previews. Every P4 target switch remains false and has no root or
alias during this pilot. Therefore Gates P4-A, P4-B, and P4-C remain closed.

## 3. Database decision

### 3.1 Initial Production database

The pilot uses a dedicated local PostgreSQL 17 cluster on the Control Host.
The cluster:

- runs from the Homebrew PostgreSQL 17 binaries already present on the host;
- stores data below the resolved `ALLJOBS_HOME`, never in the repository;
- accepts Unix-socket connections only and has `listen_addresses = ''`;
- exposes no LAN or public TCP listener;
- uses a private, canonical, owner-controlled socket directory;
- uses separate `caphub_migrator` and `caphub_app` database roles;
- grants the application role only the privileges created by the checksum-bound
  migrations;
- keeps Capture object bytes in the resolved `ALLJOBS_HOME/state/caphub/objects` directory.

The fixed Production identities are:

| Item | Value |
|---|---|
| database | `caphub` |
| application role | `caphub_app` |
| migration role | `caphub_migrator` |
| socket directory | resolved `ALLJOBS_HOME/run/caphub-postgres` |
| socket port | `54329` |
| application URL env | `CAPHUB_DATABASE_URL` |
| migration URL env | `CAPHUB_MIGRATION_DATABASE_URL` |

The URLs are server-only environment values. Local URLs carry no password and
must resolve to the exact derived Unix socket, database, port, and role. The
runtime rejects alternate paths, TCP hosts, credentials, TLS overrides, query
parameters, databases, roles, or ports.

This design narrows the P3 statement that Production connections require TLS:
TLS remains mandatory for every TCP/managed-provider connection, while the
approved local mode has no TCP transport and therefore uses owner-controlled
Unix peer authentication instead. The separate database roles prevent the
application from accidentally exercising migration authority; they are not a
defense against compromise of the single macOS account that owns both the app
and local cluster. A multi-user or multi-host deployment must use independently
managed credentials and `tls_verify_full` instead.

### 3.2 Neon-ready boundary

The application remains vendor-neutral and depends only on standard
PostgreSQL, forward-only SQL migrations, `CAPHUB_DATABASE_URL`, and the existing
Registry ports. It does not use Neon-specific APIs, extensions, branching, or
storage.

Database placement is reviewed again before P6. Move to Neon earlier if any of
these triggers occurs:

1. the accepted Recovery Point Objective becomes shorter than 24 hours;
2. point-in-time recovery becomes mandatory;
3. another Control Host or service needs Registry access;
4. local backup/restore operations become an ongoing burden; or
5. always-on P6 jobs materially increase availability or concurrency needs.

If no trigger occurs and Caphub remains a personal single-host system, local
PostgreSQL may remain the long-term database.

A future Neon migration uses a short write freeze, an unpooled/direct migration
connection, `pg_dump`/`pg_restore`, checksum-ledger verification, Registry and
lineage count/digest comparison, application URL cutover, and a read-only local
rollback copy. It must migrate or consistently preserve the separate local
object tree; moving the database alone is not whole-system disaster recovery.

## 4. Production topology

```text
Cloudflare Access + Tunnel
          |
          v
127.0.0.1:3456  com.agentjoey.alljobs
          |
          +-- local immutable Capture objects
          |     resolved ALLJOBS_HOME/state/caphub/objects
          |
          +-- Unix socket only
                resolved ALLJOBS_HOME/run/caphub-postgres/.s.PGSQL.54329
                         |
                         v
              com.agentjoey.alljobs-caphub-postgres
                         |
                         v
              resolved ALLJOBS_HOME/postgres/caphub
```

The existing refresh worker, Tunnel, domain, Access policy, and mandatory
`127.0.0.1:3456` application binding do not change. Database failure makes
Registry/Review/analysis paths unavailable but must not expose a TCP service or
break unrelated Planning Core reads.

## 5. Security prerequisite

The baseline uses `next@16.3.0`. Production activation must first upgrade both
`next` and `eslint-config-next` to exactly `16.3.3`, because the official
advisory lists versions below `16.3.3` as affected by a Critical unauthenticated
RCE in the image optimization path:

- [Next.js GHSA-2xp9-vwfh-vxw4](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)

The upgrade is a release prerequisite, not permission for unrelated dependency
updates. The final Production build must prove the resolved versions and retain
the loopback-only listener invariant.

## 6. Configuration and rollout state machine

Production activation is staged. A later state may begin only after the prior
state's checks pass.

| State | Capture | Registry | Analysis | Exports master | Real targets | Meaning |
|---|---:|---:|---:|---:|---:|---|
| S0 | on | off | off | off | off | current Capture-only Production trial |
| S1 | off | off | off | off | off | maintenance, backup, database bootstrap |
| S2 | off | on | off | off | off | migrated Registry validation, no new writes |
| S3 | on | on | off | on | off | Capture, Review Center, and read-only P4 preview ready |
| S4 | on | on | on | on | off | operator-started third-party analysis pilot |
| Rollback | on or off | off | off | off | off | previous build or filesystem Capture fallback |

`caphub.enabled` is the Capture master switch. S1 is implemented by stopping the
application listener or temporarily setting that master switch false; the
operator must prove no writer remains before migration. PA-B does not by itself
authorize that Production service action: an exact safe-off maintenance action
must also be approved. S2 is operator-only while the application remains
stopped; browser-route validation begins after PA-D when entering S3. Registry,
analysis, and exports retain their own strict switches.

The intended S4 configuration is equivalent to:

```json
{
  "caphub": {
    "enabled": true,
    "analysis": {
      "enabled": true,
      "kimiMode": "api_key",
      "kimiApiBaseUrl": "https://api.kimi.com/coding/v1",
      "kimiApiModel": "k3-256k",
      "sourceAllowedOrigins": []
    },
    "registry": {
      "enabled": true,
      "connectionMode": "local_socket",
      "databaseUrlEnv": "CAPHUB_DATABASE_URL",
      "migrationDatabaseUrlEnv": "CAPHUB_MIGRATION_DATABASE_URL",
      "maxConnections": 4,
      "statementTimeoutMs": 5000
    },
    "exports": {
      "enabled": true,
      "obsidian": { "enabled": false },
      "packageRepository": { "enabled": false },
      "targets": {
        "codex": { "enabled": false },
        "claude": { "enabled": false },
        "hermes": { "enabled": false }
      }
    }
  }
}
```

This is the S3 safe configuration. The first pilot must name one exact official
HTTPS origin and supply a Capture source URL under that origin; the separately
approved S4 transition adds only that exact origin before analysis is enabled.

## 7. Source and provider boundary

### 7.1 Evidence source

The implementation has no live source-search adapter. The first pilot therefore
requires the Human Owner to enter one exact official HTTPS source URL with the
Capture. The corresponding exact origin must be present in
`sourceAllowedOrigins`. The gateway pins DNS, rechecks the connected peer,
bounds redirects, content types, compressed/decompressed bytes, fetch count,
and time.

An empty allowlist remains fail-closed. A source URL outside the allowlist must
not be fetched. Search, community discovery, and dynamic allowlist expansion
are out of scope.

### 7.2 Provider calls

Analysis is operator-started for one Capture ID. It is never started by the
browser POST, a scheduler, page load, or retry loop. Concurrency remains one,
provider budgets remain bounded, and provider adapters register no tools.

MiniMax M3's image/strict-output probe passed. The Kimi Coding endpoint,
credential, and `k3-256k` model identifier were accepted, but the approved
direct-HTTP structured-output contract has not yet produced a schema-valid
object. Therefore S4 is blocked until one separately authorized Production-
equivalent compatibility canary passes with:

- the fixed endpoint and model above;
- no tools and `maxRetries: 0`;
- one synthetic/non-sensitive request;
- metadata-only evidence;
- host-side schema validation; and
- no second request after an uncertain or failed result.

Failure leaves S3 active and analysis disabled. It must not trigger a fallback
provider, local-login substitution, relaxed schema, or automatic retry.

Both `MINIMAX_API_KEY` and `KIMI_CODE_API_KEY` remain server-only LaunchAgent
environment values. Secret values never enter Git, `config.json`, command
output, screenshots, logs, audit metadata, HTML, or browser storage.

## 8. Existing Capture migration

The current Capture-only trial has filesystem metadata and immutable objects.
Enabling Registry changes the active metadata adapter; without migration those
Captures would disappear from the UI. A dedicated importer must therefore:

1. run while Capture writes are stopped;
2. enumerate only strict regular files under the resolved Caphub root;
3. validate every Capture, idempotency link, deterministic audit event, object
   digest, byte count, ownership, mode, and non-symlink path;
4. produce a dry-run manifest with counts and canonical digests only;
5. insert Capture records and their existing `capture.received` audit events
   through the PostgreSQL stores;
6. treat an exact existing row/event as idempotent and any mismatch as a hard
   conflict;
7. leave every source file and object byte unchanged; and
8. compare filesystem and PostgreSQL IDs/digests before Registry cutover.

The migration does not rewrite source URLs or add missing notes. The two
existing Captures without usable official source URLs remain preserved and may
remain unanalyzed. The first end-to-end pilot uses a new Capture.

## 9. Operator bridge

The accepted domain services exist, but Production composition is incomplete.
The activation adds fixed server-side operator commands; none accepts a raw
database URL, root path, provider URL, model, or export path.

### 9.1 Analyze and import

`caphub:analyze CAPTURE_ID` runs the existing analysis service. When Registry
is enabled and the job completes, the same command invokes the existing
ReviewPacket importer and returns only IDs and status. If Registry import fails
after analysis, a retry must import the completed immutable artifacts without
repeating provider calls.

### 9.2 Compose Release candidate

A fixed command consumes an exact approved Candidate decision and invokes
`ReleaseService.createCandidate`. Only `adopt`, `adapt`, or `learn` may produce
a P4 Release in this pilot. `build` remains P5, `watch` remains non-release, and
reject remains terminal. The operation creates a separate Release review
request; it does not finalize or publish the Release.

### 9.3 Finalize Release approval

A fixed command consumes an exact approved Release decision and invokes
`ReleaseService.finalizeApproval`. Finalization makes the deterministic neutral
package and adapter previews visible. It does not create a Deployment plan,
enable a target, touch a target root, publish, install, or change a pointer.

All three operations are idempotent, exact-version/digest bound, append-only,
and fail closed on stale, revoked, rejected, conflicting, or already-consumed
authority.

## 10. Backup, restore, and rollback

### 10.1 Pilot objectives

- RPO: 24 hours.
- RTO: 4 hours for the local single-host pilot.
- Backup generation: one PostgreSQL custom-format dump plus the complete Caphub
  state tree and a checksum manifest.
- Restore proof: restore one generation into an owned temporary PostgreSQL 17
  cluster and temporary state root, then verify migrations, counts, digests,
  references, and object hashes.

The database dump is taken before the immutable object-tree copy. Because an
object is durable before its PostgreSQL reference is created and objects are
never replaced or deleted, the later object copy contains every object
referenced by the earlier transactional database snapshot. It may contain
additional unreferenced objects, which are preserved and reported rather than
deleted.

Backups initially accumulate; automatic pruning is not part of activation.
Deletion or retention automation requires a separately reviewed exact target.
An off-host or Time Machine copy must include the backup generation directory;
a same-disk generation alone does not satisfy the RPO.

### 10.2 Code and data rollback

Code rollback restores the previously approved build, disables Registry,
analysis, and exports, reloads only the AllJobs listener, and leaves the local
database and object tree untouched. The filesystem Capture adapter remains the
fallback for the pre-cutover Captures.

Database rollback does not run down migrations. If the database itself is
invalid, keep Caphub safe-off, preserve it as evidence, restore the latest
verified backup into a separate owned cluster/root, and cut over only after a
new explicit decision. No rollback step deletes PostgreSQL data, object bytes,
Capture files, audit files, backups, or provider evidence.

## 11. Testing and evidence

Implementation uses TDD for each behavior and BDD for real PostgreSQL,
filesystem, CLI, route, browser, provider, and service boundaries.

Task checks stay focused. There is one final phase gate, not a repeated full
review after every task:

1. focused RED→GREEN tests per task;
2. one Production-like BDD suite covering Capture → analysis fixture → import
   → Candidate decision → Release decision → adapter preview with real
   temporary PostgreSQL and owned temporary files;
3. one final `npm test`, typecheck, lint, Production build, deployment invariant
   check, and focused Caphub E2E run bound to the final candidate commit;
4. one scoped independent Review of only the activation diff and trust
   boundaries;
5. one independent Verification of the exact final commit/build;
6. final screenshots from that build at 1440px and true CSS 390px; and
7. Production smoke evidence after the authorized cutover.

The Review and Verification scope excludes re-reviewing accepted P1–P4 internals
unless this diff changes them or a regression points to them.

## 12. Production gates

### Gate PA-A — implementation acceptance

Required before Production mutation:

- Next.js security floor met;
- focused and final checks pass;
- local PostgreSQL, importer, operator bridge, backup/restore, and rollout tests
  pass;
- one scoped independent Review and one independent Verification pass; and
- exact commit/build and migration checksums are recorded.

### Gate PA-B — local database and secret provisioning

Fresh Human authorization is required immediately before creating or starting
the real local cluster, installing/reloading its LaunchAgent, changing the real
Control Host configuration, or placing `CAPHUB_DATABASE_URL`,
`CAPHUB_MIGRATION_DATABASE_URL`, or `KIMI_CODE_API_KEY` into the installed
application environment. Secret values must never be shown.

### Gate PA-C — live provider canary

Fresh Human authorization is required for the single real Kimi compatibility
canary and the first real Capture analysis. A failed or uncertain call is not
retried. Failure leaves Production at S3.

### Gate PA-D — Production cutover

Fresh Human authorization is required immediately before the final application
rebuild/reload and configuration transition to S3/S4. The approved action
must name the exact commit, build, migration checksums, backup generation, and
rollback build.

### Gates that remain closed

P4-A/P4-B/P4-C, every P5/P6 gate, push, PR, merge, tag, release publication,
real target configuration, publish, install, rollback write, data deletion,
retention pruning, traffic change, Tunnel/Access/domain change, and Neon
provisioning remain separate hard stops.

## 13. Acceptance criteria

The activation is complete only when:

1. Production runs an exact reviewed build with Next.js `16.3.3` and retains
   `127.0.0.1:3456` as its only application listener.
2. PostgreSQL 17 accepts only the exact private Unix socket; no database TCP
   listener exists.
3. migrations `001_registry`, `002_read_models`, and `003_exports` match their
   committed checksums and the application role cannot mutate append-only data
   or run migrations.
4. existing filesystem Captures and their deterministic audit records match the
   PostgreSQL inventory without source mutation.
5. a verified backup generation and isolated restore drill pass.
6. `/caphub`, `/reviews`, migrated `/captures/CAPTURE_ID`, and the selected
   `/capabilities/CANDIDATE_ID` return expected safe states through the final build.
7. one newly captured third-party capability with an approved official source
   completes analysis, import, Candidate review, Release review/finalization,
   and neutral/adapter preview.
8. provider metadata proves MiniMax M3 and Kimi `k3-256k`; no tool, secret,
   prompt body, raw response, or Capture bytes leak into logs or browser data.
9. all P4 targets remain disabled with no configured roots, no Deployment plan,
   no publish/install/rollback, and no external filesystem mutation.
10. final evidence records exact commit/build, test commands/results, migration
    checksums, backup/restore result, screenshots, scoped Review, independent
    Verification, Production smoke, Linear status, and remaining gates.
