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

## R5 Application Monitoring Operations

R5 is a read-only, disabled-by-default monitoring workspace at `/monitoring`.
Page rendering reads only the local validated cache projection; it never calls
a provider. Collection happens only through the scheduled refresh worker or an
explicit same-origin manual refresh.

### Enabling (default is off)

Monitoring activates only when `~/.alljobs/config.json` contains an explicit
`monitoring` block with `enabled: true`, plus `refreshIntervalSeconds`
(60–86400), `concurrency` (1–4), `credentials`, and `probeAllowedHosts`. A
missing or invalid block is a deliberate safe-off state: routes render the
disabled notice and the worker skips collection. Every monitored Project
declares its own explicit `monitoring.bindings` in its registry entry; no
binding is ever inferred from provider names, domains, or Git remotes.

### Credential environment-name mapping

The config maps each binding's `credential_ref` to `{ provider, tokenEnv }` —
the NAME of an environment variable, never a value. Token values exist only in
the server process environment (for the LaunchAgent, its `EnvironmentVariables`).
Never print, paste, log, or screenshot a token value; documentation and tickets
refer to environment-variable names only. A missing or empty variable fails
closed as a normalized `authentication_failed` collector state before any
provider request is made. Probe targets are equally indirect: a binding's
`probe.host_ref` must resolve to an exact HTTPS origin in `probeAllowedHosts`,
and the probe rejects loopback/private/link-local addresses, redirects across
origins, and anything but GET/HEAD with expected status codes.

### One-shot fixture-safe validation

`npm run monitoring:refresh` (alias for `scripts/monitoring-refresh.ts --once`)
runs exactly one bounded collection cycle and prints a metadata-only summary
(cycle id, per-binding status) — never tokens, response bodies, or headers. To
validate configuration without touching providers, point `ALLJOBS_HOME` and
`ALLJOBS_DATA_ROOT` at a fixture home whose credential environment variables
are intentionally unset; the cycle then exercises the full pipeline and fails
closed per binding with zero network egress. The automated end-to-end suite
(`npx playwright test --config playwright.r5.config.ts`) does exactly this
against a production build on `127.0.0.1:3461`.

### Cache layout

All monitoring state lives under `<ALLJOBS_HOME>/state/monitoring` (never
configurable to an arbitrary path):

- `current/generations/<cycle-id>/<project>/<binding>.json` — immutable
  schema-validated snapshots, written via temporary sibling files and atomic
  renames;
- `current/index.json` — the atomic visibility pointer, written last; a torn
  or corrupt new cycle can never erase the prior readable generation;
- `events/YYYY-MM.jsonl` — normalized material transition events only
  (attention, signal state, deployment identity, permission state, quota band);
- `rollups/hourly/YYYY-MM.jsonl` and `rollups/daily/YYYY.jsonl` — bounded
  numeric rollups; hourly retained 90 days, daily and events 13 months.

Only normalized metadata is ever persisted: no credentials, raw provider
responses, request bodies, headers, logs, or source content.

### Operator errors and backoff

Provider `Retry-After` is honored, per-provider exponential backoff and
per-binding minimum intervals apply to scheduled and manual refresh alike, and
collection is globally single-flight. The manual-refresh control can only
report `queued`, `collecting`, or `backing off`; it can never bypass these
limits, and the previous atomic snapshot keeps being served throughout. A
failed binding is isolated: its last trustworthy values carry forward with
their original observation timestamps, the cycle publishes as
`partially_complete`, and stale-but-retained evidence is labeled with its age
rather than hidden or estimated.

### R5 rollback

Set `monitoring.enabled: false` in the Control Host config. This disables the
monitoring routes' data and all collection while leaving Planning Core, the
existing planning refresh path, Tunnel, domain, and Access untouched. The
cached state under `state/monitoring` is preserved for inspection; removing it
is a separate, explicitly confirmed operation.

### Pending Human gates

The following remain Human-owned and are NOT performed by the implementation:
selecting the pilot binding, creating/scoping production credentials, live
provider validation, the Human Owner walkthrough of the final build, and any
push, deploy, launchd change, or release.
