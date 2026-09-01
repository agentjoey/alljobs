# Operations & Maintenance — AllJobs Planning Core V1

## Daily Verification & Health Checks

```bash
# 1. Check local listener
curl -fsS http://127.0.0.1:3456/ >/dev/null && echo "App healthy"

# 2. Check LaunchAgents status
launchctl list | rg "com\.agentjoey\.(alljobs|alljobs-refresh|cloudflared)"

# 3. Check refresh worker logs
tail -n 20 ~/Library/Logs/alljobs/refresh-stdout.log

# 4. Trigger one-off manual refresh
npm run planning:refresh -- --once
```

## Backup & Restoration

- Native data files live under `./data/` (Markdown and JSON). Back up directory using standard Time Machine / filesystem backups.
- Mirrors live under `~/.alljobs/mirrors/` and can be reconstructed at any time by refreshing from remotes.

## R1 Backlog Control Operations

R1 reads a registered project's validated local working tree first. A modified local `docs/BACKLOG.md` is expected: its complete-file digest protects the owner’s existing work. Remote commit and cached projections are deliberately read-only fallback states; a malformed, unsafe, or missing local document must be repaired in its repository and never masked with remote data.

Before an owner confirms a direct change, AllJobs presents the project source facts, full Backlog digest, and an exact field-only diff. The only permitted direct edits are `priority` and `rank` on existing items; rank initialization and reordering are scoped to one `Phase → Priority` lane. A stale result, lock contention, source error, or preservation failure makes no write. Re-inspect the source, then create a fresh proposal instead of retrying an old one.

R1 never performs Git mutations or project-code execution: no commit, push, merge, fetch, backup, agent launch, or refresh-worker action. New Backlog Items remain copy-only repository-agent proposals.

### Disable / rollback

If R1 must be disabled, deploy the previously approved read-only AllJobs application build using the established release procedure. Do not modify a repository Backlog to "roll back" the feature, and do not restart or alter the Tunnel, Cloudflare Access, refresh worker, domain, or the mandatory `127.0.0.1:3456` listener as part of this recovery. An owner-confirmed `priority` or `rank` edit is repository-owned and must be retained or reverted only by explicit Human Owner direction.

## R2 Management Assistant Operations

### Before an owner uses it

- Confirm the installed `com.agentjoey.alljobs` LaunchAgent owns a non-empty
  `MINIMAX_API_KEY` in its `EnvironmentVariables`; never print or paste its
  value into a shell, ticket, log, Project file, or screenshot.
- Confirm `~/.alljobs/config.json` has explicit `assistant.enabled: true` and
  only the fixed MiniMax Token Plan endpoint/model. A missing, invalid, or
  disabled block is a deliberate safe-off state.
- For optional architecture/product evidence, place only exact
  repository-relative paths under the registered Project's
  `assistant.context_paths`. The context receipt is the owner-facing record of
  what will be included for that run; source-code inspection remains a separate
  per-run Human Gate.

### Expected safe states

- `NOT_CONFIGURED` / disabled: no provider request is made; correct the
  Control Host configuration or leave R2 off.
- authentication, Token Plan, rate, timeout, or provider errors: read the
  metadata-only application log, correct the external condition, then let the
  owner start a new request. Never auto-retry a request that may have reached
  MiniMax.
- malformed terminal model JSON: treat it as `INVALID_OUTPUT`; raw stream text
  remains server-side and must never be copied into the activity record or UI.
- stale or incomplete output: it may remain readable, but Task and Backlog
  actions must remain unavailable. Re-open/refresh the Project and start a new
  bounded run.
- denied source gate: continue with the document-only answer and its unknowns;
  do not widen an allowlist as a workaround.

### Privacy, logs, and smoke checks

Activity records are metadata only: project, model, mode, timing, token usage,
manifest digest, result state, and source-gate state. They must not contain
questions, answers, reasoning, source excerpts, or credentials. If such content
is observed, disable R2 immediately and treat it as a release-blocking privacy
incident.

For a post-release local smoke, use a controlled Project and a non-sensitive
question. Verify the context receipt, a cited document-only response, and the
absence of sensitive content in `~/Library/Logs/alljobs/{stdout,stderr}.log` and
the native activity log. Do not use a personal Project or source-code gate for a
smoke. A live Token Plan probe requires Human Owner authorization and reports
metadata only.

`npm run assistant:smoke -- standard` and `npm run assistant:smoke -- deep`
are metadata-only compatibility probes. They exercise the fixed MiniMax-M3
streaming request and confirm strict terminal JSON parsing, but never print a
key, prompt, reasoning, source content, or model response body.

### R2 rollback

First disable the assistant as described in `docs/deployment.md`; this changes
no Project, Roadmap, Backlog, Task, Git mirror, Tunnel, or Access state. If the
application behavior itself must be reverted, restore the last approved build
and reload only `com.agentjoey.alljobs`. Escalate immediately for any key/content
leak, ungated source read, enabled stale action, failure to disable, or loss of
loopback binding.
