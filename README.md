# alljobs

Joey 的个人工作台：对所有并行项目的进度做日常追踪与管理。数据层是 repo 内 Markdown——任何 agent 改一个文件即完成写入，git 即历史。

**Live:** https://alljobs.agentjoey.ai（Cloudflare Access 邮件验证码登录）
**当前状态 / 下一步：** [.agent/CURRENT.md](.agent/CURRENT.md)（每次 session 先读这个）

## 数据层

`data/` 是单一真相源：`data/projects/<slug>.md`（项目卡）+ `data/log/<YYYY-MM-DD>.md`（每日日志）。格式与派生规则见 [data/README.md](data/README.md)。

## 常用命令

```bash
npm run dev          # 开发服务器（默认 3000）
npm run build        # 生产构建
npm run start:prod   # 生产运行，端口 3456（本项目约定，含 -H 127.0.0.1）
npm test             # vitest（102 例）
npm run lint          # eslint
```

## 文档

| 文档 | 内容 |
|---|---|
| [.agent/CURRENT.md](.agent/CURRENT.md) | 当前版本、Sprint 状态、Open Bugs、下一步候选（最高频更新） |
| [.agent/BACKLOG.md](.agent/BACKLOG.md) | 未排期需求，按优先级 |
| [docs/architecture.md](docs/architecture.md) | 数据流、路由、组件、两套视觉系统现状 |
| [docs/deployment.md](docs/deployment.md) | 从零搭建部署（launchd + Cloudflare Tunnel + Access） |
| [docs/operations.md](docs/operations.md) | 日常运维、健康检查、故障排查 |
| [PRODUCT.md](PRODUCT.md) | 产品定位与范围（impeccable 设计工作流维护） |

Obsidian 长期知识库（PRD、设计资产、架构决策）在 vault
`10_Projects/Active/P034-AllJobs/`，规范见 `10_Projects/_AGENT-ORCHESTRATION-SPEC.md`。

## 记录

`.agent/frontend-design/` 保存 T3 设计工作流的完整过程记录（Brief、mockup、独立评审、Verification）：
`alljobs-workbench-v1/` 是 v1 的原始实现，`alljobs-restyle-apple/` 是 Apple HIG 改版评估
（分支 `restyle/apple-hig`，未合并——见 CURRENT.md 的待决策事项）。
