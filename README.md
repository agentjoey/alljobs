# alljobs

Joey 的个人工作台：对所有并行项目的进度做日常追踪与管理。数据层是 repo 内 Markdown——任何 agent 改一个文件即完成写入，git 即历史。

**Live:** https://alljobs.agentjoey.ai（Cloudflare Access 邮件验证码登录）  
**当前状态 / 下一步：** [.agent/CURRENT.md](.agent/CURRENT.md)（每次 session 先读这个）  
**Canonical backlog：** [.agent/BACKLOG.md](.agent/BACKLOG.md)

## 当前产品基线

`main` 已合入 v2 Apple HIG 三栏工作台。当前主要视图：

- `/` — 今天、注意力清单、今日日志、快速添加
- `/projects`、`/projects/[slug]` — 项目列表与详情
- `/log` — 全局日志
- `/board` — Markdown task 看板
- `/stats` — 活动、agent/project、streak、task/session 统计

repo 已完成 v2 工程实现，但当前重点是 **Operational Adoption**：把 seed/mock 项目数据换成真实状态，并让高频 agent 工作稳定落账。不要在真实使用前继续无证据扩功能。

## 数据层

`data/` 是 single source of truth：

- `data/projects/<slug>.md` — 项目卡
- `data/log/<YYYY-MM-DD>.md` — 每日日志，支持可选 `[session]`
- `data/tasks/<slug>.md` — Markdown task list（`[ ]` / `[/]` / `[x]`）

格式、容错与派生规则见 [data/README.md](data/README.md)。页面读取文件实时派生；写入面目前只有快速添加日志与 task 状态移动，没有数据库或独立 API 服务。

## 常用命令

```bash
npm run dev          # 开发服务器（默认 3000）
npm run build        # 生产构建
npm run start:prod   # 生产运行，端口 3456（含 -H 127.0.0.1）
npm test             # vitest（v2 当前基线 75 例）
npm run lint         # eslint
```

## 文档

| 文档 | 内容 |
|---|---|
| [.agent/CURRENT.md](.agent/CURRENT.md) | 当前 baseline、验证状态、下一步（最高频更新） |
| [.agent/BACKLOG.md](.agent/BACKLOG.md) | canonical backlog：稳定 ID、优先级、Done when |
| [data/README.md](data/README.md) | projects / log / tasks 文件契约与派生规则 |
| [docs/architecture.md](docs/architecture.md) | 当前 v2 数据流、路由、组件与部署边界 |
| [docs/deployment.md](docs/deployment.md) | 从零搭建部署（launchd + Cloudflare Tunnel + Access） |
| [docs/operations.md](docs/operations.md) | 日常运维、健康检查、故障排查 |
| [PRODUCT.md](PRODUCT.md) | 产品定位与范围 |

Obsidian 长期知识库（PRD、设计资产、架构决策）在 vault `10_Projects/Active/P034-AllJobs/`，规范见 `10_Projects/_AGENT-ORCHESTRATION-SPEC.md`。

## 设计与验证记录

`.agent/frontend-design/` 保存设计工作流与验证证据：

- `alljobs-workbench-v1/` — v1「工作底账」原始实现与 Verification
- `redesign-v2/` — 当前 Apple HIG 三栏工作台的 spec、实现截图与 2026-08-23 Verification

旧的 `restyle/apple-hig`、`redesign/apple-motion`、`feature/dashboard` 是历史探索，不再代表当前产品 baseline。
