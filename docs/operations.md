# Operations — alljobs

日常运维与故障排查。初次部署走 [deployment.md](deployment.md)；本文档假设生产已跑起来。

## 健康检查

```bash
curl -fsS http://localhost:3456/ >/dev/null && echo "app ok"
curl -s -o /dev/null -w "%{http_code}\n" https://alljobs.agentjoey.ai/   # 期望 302（未登录，Access 拦截）
launchctl list | grep -E "agentjoey\.(alljobs|cloudflared)"              # 两个都应显示 PID（非 "-"）
cloudflared tunnel list                                                   # alljobs 应有活跃连接
```

## 日常操作

**改一条项目状态 / 加一个项目**：直接编辑 `data/projects/<slug>.md`（frontmatter schema 见
`data/README.md`），或让任意 agent 代改。本地 server 下次请求即读到新内容，无需重启、无需构建。

**补一条日志**：网页快速添加，或直接在 `data/log/<今日>.md` 追加一行
`- HH:MM <slug> @<agent> <text>`。

**重启应用**（改了 `app/`、`lib/`、`components/` 等需要重新 build 的代码后）：
```bash
cd ~/AgentWorks/GPT_Workspace/alljobs
npm run build
launchctl unload ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
launchctl load   ~/Library/LaunchAgents/com.agentjoey.alljobs.plist
```
只改 `data/` 不需要这一步。

**看日志**：
```bash
tail -f ~/Library/Logs/alljobs/stdout.log
tail -f ~/Library/Logs/alljobs/stderr.log
tail -f ~/.cloudflared/logs/alljobs.err     # tunnel 侧
```

## 故障排查

| 症状 | 先查 |
|---|---|
| `alljobs.agentjoey.ai` 打不开/超时 | `launchctl list \| grep cloudflared`（PID 是否在）；`cloudflared tunnel list`（连接数是否为 0） |
| 502 / 连接被拒 | `launchctl list \| grep alljobs`（应用本体是否在跑）；`curl localhost:3456` 本地直连是否正常 |
| 页面显示"校对"横幅 | 某个 `data/*.md` 文件解析失败——横幅本身会指明文件与字段，去修那个文件，其余页面不受影响 |
| 改了 `data/` 但页面没变 | 确认改的是生产在用的路径（`~/AgentWorks/GPT_Workspace/alljobs/data/`，不是某个 worktree 或旧 clone） |
| 未登录却直接进了应用（跳过 Access） | **立即处理**：说明 Access 策略失效或 tunnel 配置被改动，检查 Cloudflare dashboard 的 Access Application 是否还在、策略是否还是仅放行 `theagentjoey@gmail.com` |
| 想临时下线 | `launchctl unload ~/Library/LaunchAgents/com.agentjoey.cloudflared.plist`（只停外网入口，本地 3456 与数据不受影响）|

## 不要做的事

- 不要给 `next start` 去掉 `-H 127.0.0.1`（见 AGENTS.md 陷阱说明——默认 `0.0.0.0` 会让局域网内任何设备绕过 Access 直接访问）
- 不要把 `~/.cloudflared/*.json`（tunnel 凭证）或 `cert.pem` 提交进 git（`.gitignore` 已挡 `deploy/*.json`，但凭证本身在 `~/.cloudflared/`，本就不在 repo 内）
- 不要同时跑两份 `next start`/`next dev` 占用同一份 `data/` 目录做写入测试——`quickadd` 的文件追加没有加锁
