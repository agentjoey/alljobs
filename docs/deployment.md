# Deployment — AllJobs Control Host (Planning Core V1 + Caphub)

Single Control Host deployment: local Next.js, the planning refresh worker, the
Caphub analysis/retention worker, Neon-managed Caphub data, and Cloudflare
Tunnel & Zero Trust Access. Current flags and versions are recorded only in the
"Current state" section of `.agent/CURRENT.md`.

## 1. Single Control Host Architecture

```
Internet → Cloudflare Access (Email OTP) → Cloudflare Tunnel (cloudflared)
                                                 ↓
                                         127.0.0.1:3456
                                                 ↓
                              com.agentjoey.alljobs — Next.js 16 (next start)
                                ├── Planning Core: native Markdown + read-only Git mirrors
                                └── Caphub routes ──TLS──> Neon PostgreSQL (caphub Registry)
                                                  ──S3───> Neon Object Storage (caphub-objects)
     com.agentjoey.alljobs-refresh — Git fetch & mirror refresh
     com.agentjoey.alljobs-caphub  — Caphub worker (tsx from source, no listener)
        ├── durable analysis queue → MiniMax (MiniMax-M3) + DeepSeek (deepseek-flash)
        └── hourly 30-day raw-image retention → exact-key S3 delete
     Obsidian Vault (optional export target) — written only by the confirmation-gated
        `caphub:publish` CLI; never by the app or worker
```

## 2. Invariants & Security Boundaries

1. **Mandatory Loopback Binding (`-H 127.0.0.1`)**: Next.js binds `127.0.0.1:3456` exclusively. The service is never directly exposed to the local network.
2. **Planning Core has no database**: native Markdown (`data/`) + read-only Git bare mirrors (`~/.alljobs/mirrors/`). Caphub is the only module with a database (Neon PostgreSQL) and object storage.
3. **No Shell Git Boundary**: Git operations use `execFile` with `-c core.hooksPath=/dev/null`.
4. **Digest-Protected Writes**: Native writes require matching Expected Digest (`STALE_WRITE` guard).
5. **Secrets only in installed LaunchAgents**: Registry, object-storage and provider credentials live only in the mode-`600` installed plists' `EnvironmentVariables`; `config.json` holds environment-variable names, never values.
6. **Production working directory**: `com.agentjoey.alljobs` and `com.agentjoey.alljobs-caphub` run from `.worktrees/caphub-release`; `com.agentjoey.alljobs-refresh` runs from the main checkout. It is a release artifact, not a workspace — see §4.

## 3. Services Management (launchd)

### Application Service (`com.agentjoey.alljobs`)
- Plist: `deploy/com.agentjoey.alljobs.plist`
- Command: `npm run start:prod` (`next start -p 3456 -H 127.0.0.1`)
- Logs: `~/Library/Logs/alljobs/{stdout,stderr}.log`
- MiniMax Token Plan: maintain `MINIMAX_API_KEY=sk-cp-...` only in the installed
  `~/Library/LaunchAgents/com.agentjoey.alljobs.plist` `EnvironmentVariables` dictionary;
  set that file to mode `600`, then reload the service. Never add the key to repository JSON,
  `.env` committed files, browser configuration, or logs.

#### R2 Management Assistant

- R2 is disabled unless the installed Control Host `config.json` contains an
  explicit assistant block with `"enabled": true`. The fixed provider contract
  is `minimax` / OpenAI-compatible `https://api.minimax.io/v1` /
  `MiniMax-M3`; no browser value can override it.
- Keep a Project's optional context narrow and exact. For a registered code
  Project, the owner edits that Project record's `assistant.context_paths` with
  repository-relative individual files only, for example:
  ```json
  { "assistant": { "context_paths": ["docs/ARCHITECTURE.md"] } }
  ```
  Do not add globs, directories, `.env`, credentials, build output, or symlinks.
  The owner can still exclude an allowlisted optional file for an individual run.
- The application listener reads `MINIMAX_API_KEY` only from launchd's process
  environment. The key is never part of `config.json`, Project records, browser
  JavaScript, assistant responses, screenshots, or activity logs. The committed
  plist contains a commented placeholder only.
- A disabled or invalid assistant configuration blocks the server Route Handler
  before it can create a provider request. Provider failures are displayed as
  bounded operational states; AllJobs does not auto-retry a provider-accepted
  request.
- The MiniMax-M3 adapter uses the official streaming controls: Standard sends
  `thinking: { type: "disabled" }`, Deep sends `thinking: { type: "adaptive" }`,
  and both send `reasoning_split: true`. It keeps raw stream text server-side
  until one complete JSON object passes the existing intent-specific Zod
  validation; only a fully closed, explicitly incomplete `direct_answer`
  preview may reach the browser before that terminal result.

### Refresh Worker Service (`com.agentjoey.alljobs-refresh`)
- Plist: `deploy/com.agentjoey.alljobs-refresh.plist`
- Command: `npm run planning:refresh`
- Logs: `~/Library/Logs/alljobs/refresh-{stdout,stderr}.log`

### Cloudflare Tunnel (`com.agentjoey.cloudflared`)
- Ingress: `alljobs.agentjoey.ai` → `http://localhost:3456`
- Catch-all: `http_status:404`

### Caphub worker (`com.agentjoey.alljobs-caphub`)
- Template: `deploy/com.agentjoey.alljobs-caphub.plist` (committed `Disabled=true`, `RunAtLoad=false`; the installed copy is enabled).
- Command: `node --conditions=react-server --import tsx scripts/caphub-worker.ts --daemon`, working directory `.worktrees/caphub-release`.
- Logs: `~/.alljobs/logs/caphub-worker{,-error}.log`.
- Runs analysis only when `caphub.enabled`, `analysis.enabled` and `analysis.autoStart` are all true; runs the retention sweep hourly only when `caphub.enabled`, `caphub.registry.enabled` and `caphub.retention.enabled` are true (otherwise it logs `CAPHUB_RETENTION_TICK_UNAVAILABLE`). It opens no listener and does not need the migrator credential.
- `npm run verify:deploy` checks the committed templates only. It does not inspect the installed plists; compare their key structure separately without printing values.

### Caphub data services (Neon)
- Registry: Neon PostgreSQL `caphub` database over `tls_verify_full`; migrations `001`–`004` applied. The accepted privilege boundary is `neon_project_admin_accepted` (see `docs/superpowers/specs/2026-09-18-caphub-neon-privilege-boundary-revision.md`).
- Objects: private bucket `caphub-objects`, path-style S3, content-addressed keys.
- The local PostgreSQL 17 template `deploy/com.agentjoey.alljobs-caphub-postgres.plist` belongs to the superseded local-Registry plan (scheme A). It is not installed and is not part of the current deployment.

## 4. Operational Recovery & Rollback

- **Release rule for `.worktrees/caphub-release`**: it is the production working directory for both the app build and the worker source. Develop, inspect and test in a separate worktree. Only an authorized release may move this worktree to the exact reviewed commit, run `npm ci` and `npm run build`, and then reload the services. Because the worker runs source directly, any change there reaches the worker on its next restart (`KeepAlive=true`), even without an app rebuild.
- **Non-destructive Update** (authorized release only):
  ```bash
  cd .worktrees/caphub-release
  git checkout --detach <reviewed-commit>
  npm ci
  npm run build
  launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
  launchctl load ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
  launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs-caphub.plist
  launchctl load ~/Library/LaunchAgents/com.agentjoey.alljobs-caphub.plist
  ```
  Record the new code SHA and `.next/BUILD_ID` in `.agent/CURRENT.md`.

### Caphub automatic analysis workbench (released 2026-09-19 — rollout record and rollback)

The rollout below was completed on 2026-09-19 (code `766f850`). It is kept as the
reference procedure and rollback path. Migration `004_capture_automation` is additive.
Before mutation run `npm run caphub:preflight -- --automation` and
`npm run caphub:automation-backfill` in the private host environment. Neither
command invokes providers or removes objects. Apply migrations using the existing
migrator procedure, then run backfill `--apply` with intake disabled. Same-name,
different-content groups need exact Human selections in a resolutions JSON file;
pass `--resolutions /absolute/private/file.json`. Do not automatically enqueue
historical Captures.

Install `deploy/com.agentjoey.alljobs-caphub.plist` only after the release batch is
approved. Substitute the reviewed worktree, Node directory and private AllJobs
home. Its initial Disabled=true/RunAtLoad=false state must remain until activation.
Create the installed plist with mode 0600 and logs directory mode 0700. Copy only
the existing Registry app URL, configured provider keys and object-storage
environment values from the already-private app configuration using a restricted
local script; never print them, place them in a command argument, or commit them.
The worker does not require the migrator credential and opens no listener.

Rollout order: migration/backfill → reviewed app with autoStart=false → disabled
worker installation → read-only route/performance smoke → authorized
`caphub.analysis.autoStart=true` and worker enable/bootstrap → one named browser
canary → duplicate canary proving unchanged model-call count. Existing app stays
on `127.0.0.1:3456`; refresh worker, Tunnel and Access are unchanged. Enable
`caphub.retention.enabled=true` only with the separately enumerated dry-run targets
and deletion authorization. Both flags default false.

Rollback: set autoStart=false and retention.enabled=false, stop only the Caphub
worker, reload the previously approved app build if required. Preserve migration
004, queue rows and evidence. Do not drop tables or replay interrupted providers.
Source-object deletion cannot be undone from Registry metadata; derived results
and receipts remain readable. Push/merge and production reload require explicit
authorization naming this release, not an old V4 canary approval.

### R2-only disable / rollback

To stop R2 without changing planning data, remove the assistant key from the
installed application LaunchAgent (or set `assistant.enabled` to `false` in the
Control Host configuration), then reload **only** `com.agentjoey.alljobs`.
Confirm the Project Detail entry is disabled and `127.0.0.1:3456` still answers
normally. Do not restart the refresh worker, Cloudflare Tunnel, Access policy, or
domain. To roll back application behavior, restore the previously approved
application commit/build and reload only that same listener; repository Roadmap,
Backlog, and native Task files are not R2 rollback targets.

- **Emergency Rollback (Planning Core only, last resort)**:
  The retired v0.1 release is tagged at `archive/v0.1.0-retired`. It predates Caphub entirely: it has no Caphub routes, worker, Registry or retention. Before using it, stop the Caphub worker and set Caphub safe-off; never treat it as a Caphub rollback. For Caphub, roll back to the previously approved Caphub build using the automatic-analysis rollback above. In the event of an unrecoverable Planning Core failure, run from the checkout that `com.agentjoey.alljobs` uses:
  ```bash
  launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs-caphub.plist
  git checkout archive/v0.1.0-retired
  npm ci
  npm run build
  launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs-refresh.plist
  launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
  launchctl load ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
  ```
