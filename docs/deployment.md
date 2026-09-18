# Deployment — AllJobs Planning Core V1

Single Control Host deployment with local Next.js + background planning refresh worker + Cloudflare Tunnel & Zero Trust Access.

## 1. Single Control Host Architecture

```
Internet → Cloudflare Access (Email OTP) → Cloudflare Tunnel (cloudflared)
                                                 ↓
                                         127.0.0.1:3456
                                                 ↓
                                      Next.js 16 (App Router)
                                        ├── Read Projections (Local Markdown & Mirrors)
                                        └── Native Task Writes (Atomic sha256 lock)
                                                 ↑
                                      com.agentjoey.alljobs-refresh (launchd worker)
                                        └── Git fetch & mirror refresh (no shell / -c core.hooksPath=/dev/null)
```

## 2. Invariants & Security Boundaries

1. **Mandatory Loopback Binding (`-H 127.0.0.1`)**: Next.js binds `127.0.0.1:3456` exclusively. The service is never directly exposed to the local network.
2. **Zero Database**: Pure AllJobs-native Markdown (`data/`) + read-only Git bare mirrors (`~/.alljobs/mirrors/`).
3. **No Shell Git Boundary**: Git operations use `execFile` with `-c core.hooksPath=/dev/null`.
4. **Digest-Protected Writes**: Native writes require matching Expected Digest (`STALE_WRITE` guard).

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

### Caphub local Registry (`com.agentjoey.alljobs-caphub-postgres`)

The committed plist is a reviewed template, not an installed service. The
initial P1–P4 activation uses PostgreSQL 17 with a private Control Host Unix
socket, `listen_addresses = ''`, `0700` socket permissions, peer mapping, and
separate application/migration roles. PA-B is required before resolving the
template, creating or starting the real cluster, installing/reloading the
LaunchAgent, changing the installed config, or placing database/provider secret
references into the application environment.

Run `npm run verify:deploy` and `npm run caphub:preflight` from the exact
accepted build before requesting PA-B. Stopping the Production listener for S1
also needs an explicit safe-off maintenance action. PA-D is separately required
before rebuilding/reloading the application into S3/S4. The Caphub rollout must not
restart or modify the refresh worker, Tunnel, Access policy, domain, or the
mandatory `127.0.0.1:3456` listener. Full commands and rollback behavior are in
the [Production activation runbook](../.agent/caphub/production-activation-runbook.md).

## 4. Operational Recovery & Rollback

- **Non-destructive Update**:
  ```bash
  git checkout feature/planning-core-v1
  npm ci
  npm run build
  launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
  launchctl load ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
  ```

### Caphub automatic analysis workbench (pending production authorization)

Use the separately reviewed automation build; never build inside the currently
running `.worktrees/caphub-release`. Migration `004_capture_automation` is additive.
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

- **Emergency Rollback**:
  The retired v0.1 release is tagged at `archive/v0.1.0-retired`. In the event of an unrecoverable failure:
  ```bash
  git checkout archive/v0.1.0-retired
  npm ci
  npm run build
  launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs-refresh.plist
  launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
  launchctl load ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
  ```
