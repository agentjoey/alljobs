# Caphub P1–P4 Production activation threat model

Date: 2026-09-17

Scope: the local-first activation diff from base
`50abeae8719f297a44955b076f9a9d7299f5abbe` through the PA-A candidate. This
record does not authorize PA-B, PA-C, PA-D, any P4 target, or P5/P6.

## Assets and trust boundaries

- Filesystem Capture bytes remain immutable below the derived Caphub state
  root. The browser and report surfaces receive metadata, never bytes or object
  keys.
- PostgreSQL owns Registry metadata only. The application and migrator use
  distinct login roles over one private Unix socket; the application role
  cannot migrate or update/delete append-only rows.
- MiniMax M3 and Kimi `k3-256k` receive bounded server-created requests. Secrets,
  prompts, raw responses, Capture bytes, and database URLs are not evidence
  fields or browser data.
- Candidate approval and Release approval are distinct exact-version
  authorities. Finalization consumes only the matching Release decision.
- P4 neutral manifests and Codex/Claude/Hermes adapters are previews. Every
  export target remains disabled and unconfigured; no target root, plan,
  publish, install, rollback write, Git action, or deployment is permitted.

## Threats and enforced controls

| Threat | Control | Required evidence |
|---|---|---|
| Database exposed on TCP | PostgreSQL 17 fixed config uses `listen_addresses = ''`, private `0700` socket, peer map, fixed roles | readiness report plus deployment invariant check |
| Privilege collapse | bootstrap creates separate non-inheriting roles; migrations require `caphub_migrator`; app append-only tables are trigger and grant protected | real temporary PostgreSQL BDD |
| Migration drift | forward-only manifest with exact committed SHA-256 checksums | readiness ledger equality |
| Capture loss or mutation | dry-run manifest binds every source path digest; apply requires exact source digest and preserves source bytes | before/after source digest plus Registry parity |
| Idempotency race | transaction advisory lock serializes keys without adding UPDATE on append-only idempotency evidence | least-privileged Capture BDD |
| Registry-native analysis import conflict | importer binds the exact current Registry version and digest | import behavior tests and pilot |
| Provider double charge or hidden fallback | one explicit call per stage, no automatic retry, no provider fallback | fixture counts; PA-C one-call canary record |
| Untrusted source fetch | exact Human-selected HTTPS origin, redirect/DNS policy, bounded fetch, Human review | source policy tests and S4 evidence |
| Approval confused with publication | Candidate and Release decisions are separate; target-disabled preview has no Deployment | lifecycle E2E and zero Deployment rows |
| Backup gives false confidence | immutable database/state generation plus isolated restore and count/checksum comparison | generation ID and restore PASS |
| Preflight leaks sensitive state | strict output whitelist; unsafe strings/extra fields are discarded or rejected; errors collapse to safe codes | preflight tests |
| Rollback destroys evidence | rollback disables features and restores code/config; database, objects, Captures, audit, backups, and provider evidence are retained | runbook review |

## Residual risk and closed gates

- Kimi direct-HTTP structured output is not proven. PA-C permits one
  synthetic, non-sensitive `k3-256k` compatibility call without retry. Failure
  leaves the system at S3 with analysis disabled.
- A same-disk backup does not satisfy the operational RPO until its generation
  is covered off-host or by Time Machine.
- Local PostgreSQL is a single-host operational dependency. Re-evaluate Neon
  before P6, or earlier when RPO/PITR, multi-host access, growth, or operating
  burden crosses the approved triggers.
- PA-B is required before any real cluster, LaunchAgent, configuration, secret,
  migration, import, or backup action. PA-B alone does not authorize stopping
  or reloading the Production application: S1 needs an explicit safe-off
  maintenance action, and PA-D is required before rebuild/reload/cutover into
  S3/S4. PA-C is required before each real provider call.
- P4-A/P4-B/P4-C, all target roots, publish/install/rollback, P5/P6, push, PR,
  merge, tag, and release publication remain closed.
