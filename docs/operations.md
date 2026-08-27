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
