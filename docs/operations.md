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
