# Caphub P1–P4 Production activation runbook

Date: 2026-09-17

This is an operator checklist, not standing authorization. Run from the exact
accepted checkout. Replace only typed IDs/digests returned by the preceding
command. Never paste or record secret values, database URLs, absolute state
paths, object keys, prompts, raw provider responses, or Capture bytes.

## S0 — metadata-only inventory (authorized before PA-B)

```bash
git rev-parse HEAD
node --version
npm --version
/opt/homebrew/opt/postgresql@17/bin/postgres --version
npm run verify:deploy
npm run caphub:preflight
```

Expected: exact candidate SHA; Next `16.3.3`; loopback-only app; fixed migration
IDs/checksums; `enabledTargets: []`; and `readyFor: "PA_B"`. The preflight is
read-only, accepts no flags, and emits metadata only. Any unsafe configuration,
enabled target, missing invariant, or `PREFLIGHT_*` error blocks progress.

Record aliases such as `<CAPHUB_HOME>`, `<CAPHUB_SOCKET>`, and
`<BACKUP_GENERATION>` in operator notes. Do not record their absolute values.

## S1 — stop writer and preserve the source (requires PA-B)

1. Obtain PA-B authorization naming the accepted SHA and intended local-only
   changes.
2. Set Caphub safe-off through the approved installed configuration procedure
   and reload only `com.agentjoey.alljobs`.
3. Confirm the public Capture action is disabled and inspect the application
   log for no in-flight Caphub writer. Do not prove this with a live POST.
4. Create an immutable whole-tree source backup using the approved Control Host
   backup facility. Verify the source remains owner-only, canonical, non-symlink,
   and unchanged. Off-host/Time Machine coverage is required for the RPO.

If writer state or custody is uncertain, remain safe-off. Do not repair,
delete, move, or rewrite Capture files.

## PA-B — local Registry bootstrap and migration

After installing the reviewed LaunchAgent template with its fixed Control Host
placeholder resolved, run only:

```bash
npm run caphub:postgres -- --bootstrap --confirm BOOTSTRAP-CAPHUB-POSTGRES
launchctl print gui/$(id -u)/com.agentjoey.alljobs-caphub-postgres
npm run caphub:postgres -- --migrate --confirm APPLY-CAPHUB-MIGRATIONS
npm run caphub:postgres -- --check
npm run verify:deploy
```

Expected: PostgreSQL 17; database `caphub`; roles `caphub_app` and
`caphub_migrator`; no TCP listener; one private Unix socket; migrations
`001_registry`, `002_read_models`, and `003_exports` at committed checksums;
`appCanMigrate: false`; `appCanUpdateAppendOnly: false`; `ready: true`.

Place only the named environment references into the installed listener:
`CAPHUB_DATABASE_URL`, `CAPHUB_MIGRATION_DATABASE_URL`, and, when separately
needed for PA-C, `KIMI_CODE_API_KEY`. Never print, commit, screenshot, or copy
their values into evidence.

## Capture import and verified backup (still under PA-B)

Keep the application writer stopped.

```bash
npm run caphub:registry-import -- --dry-run
npm run caphub:registry-import -- --apply --digest <SOURCE_SHA256> --confirm IMPORT-CAPHUB-CAPTURES
npm run caphub:registry-import -- --dry-run
npm run caphub:backup -- --create
npm run caphub:backup -- --verify <BACKUP_GENERATION>
npm run caphub:preflight
```

Expected: apply uses the exact dry-run digest; source bytes/digest do not
change; Registry Capture count and digests match the filesystem inventory;
backup creation returns one immutable generation; isolated restore matches
Registry counts and migration checksums. Preserve the backup even if verify
fails. `caphub:preflight` does not itself perform or attest the restore drill;
the operator binds the successful verify output to PA-D evidence.

## S2 — Registry-only verification (requires PA-D before cutover)

Prepare an exact configuration diff with outer Caphub safe-off, Registry
configured, analysis off, exports off, and every target disabled/unconfigured.
PA-D must name the accepted commit/build, migration checksums, verified backup
generation, import digest/count, intended LaunchAgent/config diff, and rollback
build. After approval, rebuild/reload only `com.agentjoey.alljobs` and verify
metadata-only reads. Do not restart the refresh worker, Tunnel, Access, or
domain.

## S3 — Capture + Review + P4 preview

Under the same PA-D authorization, enable outer Caphub, Registry, and exports
master while keeping analysis disabled and every target switch false with no
root or alias. Verify through the final build:

```text
/caphub                         200; Capture ready
/reviews                       200; Registry ready
/captures/<MIGRATED_CAPTURE>   200; exact migrated metadata
/capabilities/<CANDIDATE>      disabled/no-release or read-only preview state
```

Expected: no Deployment plan, target directory, current pointer, publish,
install, rollback, provider request, or Git action. S3 is a valid terminal state.

## PA-C — one Kimi compatibility canary

Fresh authorization is required immediately before the request. Use model
`k3-256k`, the approved coding API endpoint, synthetic non-sensitive input,
strict structured output, no tools, and no retry. Record only timestamp,
provider/model, request count, latency/tokens when available, schema result,
and safe error code.

If the result fails or is uncertain, set/keep analysis disabled, remain at S3,
and stop. Do not retry, fall back, or send a real Capture.

## S4 — one third-party Capability pilot

Only after PA-C passes, the Human supplies one exact official HTTPS source URL
and approves its exact origin. The origin is runtime input and has no default.
Enable analysis and reload only the app listener. Then:

1. Human creates one new Capture under that exact origin.
2. Operator starts analysis once; no automatic retry/fallback.
3. Human reviews the exact Candidate in `/reviews` and records one disposition.
4. For `adopt`, `adapt`, or `learn`, compose one Release with the Candidate
   approval decision; `learn` also supplies `experience_card` or `reference`.
5. Human separately approves the exact Release; operator finalizes it once.
6. Verify the neutral package and Codex/Claude/Hermes read-only previews.

No target may be enabled and no Deployment plan may be created.

## Failure containment

- Registry unavailable, checksum drift, import mismatch, or backup/restore
  failure: keep Caphub safe-off; preserve filesystem, database, backup, and logs.
- Provider failure/uncertainty: do not retry; disable analysis; remain at S3.
- Review/finalization conflict: refresh exact versions; never synthesize or
  overwrite authority.
- Target/export anomaly: disable exports master and preserve evidence. No
  target cleanup is authorized.
- Any unexpected external write, TCP listener, secret exposure, or source
  mutation is a hard stop.

## Non-destructive rollback

1. Disable analysis, exports, Registry, then outer Caphub in the approved
   configuration and reload only `com.agentjoey.alljobs`.
2. Restore the previously approved application build and verify the mandatory
   `127.0.0.1:3456` listener.
3. Leave the local Registry cluster stopped or isolated as directed; do not run
   down migrations or delete its data.
4. Preserve every filesystem Capture, object, audit record, database directory,
   backup generation, and provider evidence item.
5. If database recovery is required, restore the latest verified generation
   into a separate owned cluster/root and seek a new cutover decision.

Rollback does not authorize push, merge, release, data deletion, retention
pruning, Tunnel/Access/domain changes, target writes, or Neon provisioning.
