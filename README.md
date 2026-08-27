# AllJobs — Federated Planning Core

Joey 的个人多项目规划工作台。统一可视化和管理 Project → Roadmap → Backlog / Task，同时保持代码项目的 Roadmap/Backlog 在各自 repo 内作为唯一事实源。

## Architecture & Data Model

- **Federated Read-Only Mirrors**: 代码项目的 `docs/ROADMAP.md` 与 `docs/BACKLOG.md` 留在各自代码仓库内作为唯一事实源，AllJobs 仅维护只读 Git 投影与摘要比对，绝不向外部代码仓库写入。
- **AllJobs-Native Writable Tasks**: 业务运营项目的 Milestones 与 Tasks 直接由 AllJobs Markdown 保管。
- **No Database**: 纯 Markdown 驱动，零 SQL/NoSQL 数据库。
- **Paper Workbench**: 温暖纸面基底 (`#F1EEE6` / `#FBF7E6`)、深墨排版 (`#16140E`) 与琥珀色 Provenance 状态条 (`#F3B44A`)。
- **Human Gate Boundary**: 所有项目注册、归档、恢复及原生写入均受两阶段校验、Proposal 摘要比对及显式确认防护，任何并发变更均触发 `STALE_STATE` 零写入阻断。

## Security & Deployment

- **Control Host**: 当前本地开发机作为唯一的 Control Host。
- **Loopback Enforcement**: `next start` 必须带 `-H 127.0.0.1`（见 `start:prod`），确保仅通过 Cloudflare Tunnel / Access 提供鉴权入口。

## Dev Commands

```bash
npm run dev                 # 本地 Next.js 开发服务器
npm test                    # 运行 Vitest 单元与组件测试
npm run test:e2e            # 运行 Playwright 端到端测试
npm run typecheck           # TypeScript 静态类型检查
npm run lint                # ESLint 代码规范检查
npm run build               # Next.js 生产环境构建
npm run start:prod          # 启动生产应用 (127.0.0.1:3456)
```
