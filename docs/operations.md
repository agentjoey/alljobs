# Planning Core V1 — Operations Manual

## Control Host Environment

- **Single Control Host**: Joey 的 macOS 开发机为唯一的 Control Host。
- **Loopback Enforcement**:
  - `start:prod` 命令定义为 `next start -p 3456 -H 127.0.0.1`；
  - 必须绑定 `127.0.0.1` 回环地址，防止局域网直接未经鉴权访问。

## Cloudflare Tunnel & Access

- **Public Endpoint**: `https://alljobs.agentjoey.ai`
- **Ingress Rule**: 路由到 `http://127.0.0.1:3456`
- **Authentication**: Cloudflare Access 邮箱验证码登录防护。

## Refresh Daemon

- **Background Sync**: 通过 launchd 定时执行 `npm run planning:refresh`。
- **Stale Protection**: 当网络不可用或 fetch 失败时，保留 last success 缓存，并在前端琥珀色状态条中标注 `STALE`。

## Rollback Strategy

- 旧版 release 已打 tag `archive/v0.1.0-retired`。
- 如需整版回滚，可通过 git checkout tag 进行还原。
