# alljobs

Joey 的个人工作台：对所有并行项目的进度做日常追踪与管理。数据层是 repo 内 Markdown——任何 agent 改一个文件即完成写入，git 即历史。

## 数据层

`data/` 是单一真相源：`data/projects/<slug>.md`（项目卡）+ `data/log/<YYYY-MM-DD>.md`（每日日志）。格式与派生规则见 [data/README.md](data/README.md)。

## 常用命令

```bash
npm run dev          # 开发服务器（默认 3000）
npm run build        # 生产构建
npm run start:prod   # 生产运行，端口 3456（本项目约定）
npm test             # vitest
```

## 部署

本地常驻 server + cloudflared tunnel → `alljobs.agentjoey.ai`，登录由 Cloudflare Access 邮件验证码承担。一步步照做见 [docs/deploy.md](docs/deploy.md)；launchd 与 tunnel 配置模板在 `deploy/`。

## 记录

`.agent/` 保存本产品的设计/实施记录（`frontend-design/alljobs-workbench-v1/`：brief、mockup、verification、handoff），供后续 agent 会话恢复上下文。
