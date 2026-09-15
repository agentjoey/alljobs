# Caphub（kebab）开发转移记录

- 状态：准备完成，等待分阶段实施授权
- 日期：2026-09-14
- 源产品：AllJobs Federated Planning Core
- 目标模块：Caphub（内部代号 `kebab`）
- 开发主机：Y-MMN
- 保存项目 checkout：`/Users/xtation/AgentWorks/GPT_Workspace/alljobs`
- 当前分支：`main`
- Git remote：保持 `origin https://github.com/agentjoey/alljobs.git` 的 fetch/push 地址不变
- 设计基线：`docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`
- 主路线图：`docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`

## 1. 转移决定

Caphub 不建立新的 Git 仓库，也不把 AllJobs remote 指向其他位置。开发继续发生在 Y-MMN 的 AllJobs 保存项目 checkout 中；AllJobs 从个人多项目 Backlog 管理产品调整为 Personal Capability Operations Control Plane，逐步承载 Workflow Engine、Caphub、Review Center、Agent Runtime 与 Observability。

“开发转移”只改变后续产品重心和实施路线，不代表本记录已执行代码迁移、Backlog 删除、Linear 数据迁移、生产切换、remote 修改、commit 或 push。

## 2. 2026-09-14 现状基线

### 2.1 Git 与工作区

- `git pull`：`Already up to date.`
- 分支：`main`，跟踪 `origin/main`。
- remote fetch/push 均为 `https://github.com/agentjoey/alljobs.git`。
- 审计开始时存在 Human-owned 工作区改动：
  - 已修改：`data/log/activity.jsonl`
  - 已修改：`docs/superpowers/specs/2026-08-29-alljobs-product-roadmap-design.md`
  - 未跟踪：`.agent/frontend-design/r6-multi-device-identity/`
  - 未跟踪：`.superpowers/brainstorm/`
  - 未跟踪：`data/projects/grandegpt.json`
  - 未跟踪：`data/projects/mathmagics.json`
  - 未跟踪：`data/projects/talentvault.json`
  - 未跟踪：`docs/ROADMAP.md`
  - 未跟踪：`kimi-debug-session_-20260827-045249.zip`
- 这些文件不属于本次文档写入范围；后续实施不得 reset、stash、覆盖、删除、移动、stage 或 commit 它们。

### 2.2 运行与技术栈

- Next.js `16.3.0` App Router、React `19.2.8`、TypeScript、Tailwind v4、shadcn/radix-nova。
- Zod `4.4.3`、YAML、原生文件系统持久化；当前 Planning Core 无数据库。
- Vitest `4.1.10`、Testing Library、Playwright `1.62.1`、axe-core。
- 单一 Control Host，应用必须绑定 `127.0.0.1:3456`；Cloudflare Tunnel / Access 是唯一外部入口。
- 当前配置、planning、assistant 与 monitoring 均在同一 Next.js 应用内；refresh worker 和 launchd 设施已存在。

### 2.3 真实验证命令

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm run verify:deploy
npm run start:prod
node scripts/shot.mjs <url> <out.png> <width> <scale> <mobile:0|1> [light|dark]
```

任何新 Route Handler 必须遵循仓库安装的 Next.js 16 文档：放在 `app/**/route.ts`，使用 Web `Request`/`Response` API；POST 默认不缓存。

## 3. Backlog 管理模块依赖审计

### 3.1 可退役的管理能力

以下构成 R1 Backlog Control 的主动管理链：

```text
ProjectDetail Backlog tab
  -> BacklogView
     -> BacklogOrderingEditor
        -> proposeBacklogOrderingAction
           -> proposeBacklogOrderingChange
              -> analyze/planBacklogOrderingChange
              -> patchBacklogFields
     -> BacklogChangeReview copy handoff
     -> BacklogProposalForm copy-only new-item handoff
```

对应范围包括 `app/actions/backlog.ts`、`lib/planning/backlog/`、四个 `components/planning/backlog-*.tsx` 文件、相关 Vitest/Playwright 测试、R1 Playwright 配置、`app/globals.css` 的 R1 专用样式、`package.json` 的 R1 专用测试命令，以及 `docs/architecture.md`、`docs/operations.md` 中描述直接 Backlog 控制的当前运维段落。

Assistant 中的 `draft_backlog` intent、`BacklogProposal` 结果和 repository-agent Backlog handoff 也是管理入口，退役时从 assistant contract/service/panel 中移除；assistant 的问答、Task 草稿、只读上下文、安全 gate、manifest stale protection 与流式协议继续保留。

### 3.2 必须保留的 Planning Core 读取能力

以下不是 R1 writer，不能随管理模块删除：

- `docs/BACKLOG.md`、`.agent/BACKLOG.md` 和外部仓库的 `docs/BACKLOG.md` 历史/事实文件；本阶段不删除、不迁移。
- `lib/planning/domain/schemas.ts` 与 `types.ts` 的 `BacklogItem`/Task relation 类型。
- `lib/planning/markdown/backlog.ts`、`section-document.ts` 和只读 parser 测试。
- `lib/planning/providers/git-markdown.ts`、`local-working-tree.ts`、`source-resolver.ts`、`refresh.ts` 的 roadmap/current planning projection。
- `lib/planning/domain/relations.ts` 的事实一致性检查。
- `lib/planning/queries/project.ts` 中对 roadmap、tasks、provenance、document health 的读取；移除控制派生字段时仍保留只读 projection，供 assistant/context 与审计使用。
- `lib/assistant/context.ts` 对 `docs/ROADMAP.md`、`docs/BACKLOG.md` 和批准路径的只读、server-derived manifest 组装。
- `lib/planning/native/store.ts`、digest、lock、activity、paths、project registry、archive/restore 与 trusted-root 保护。
- `skills/alljobs-planning/` 的 Roadmap/Task 与只读 Backlog schema 说明继续保留；主动 Backlog 写入/转换指引随 P0 移除。写出文件的 `scripts/convert-backlog.ts` 属于退役 writer，不属于 reader。

### 3.3 必须保留的共享系统

- Assistant：server-only credential、精确 Origin allowlist、bounded file reads、source gate、pre/post manifest digest、`STALE`/`INCOMPLETE` 保护、NDJSON streaming、Task handoff。
- Monitoring：provider/binding/signal schema、Railway/Fly/Neon/Supabase adapters、safe-off config、single-flight、backoff、immutable generation cache、last trustworthy timestamps、只读 refresh action。
- UI shell：AppShell、PrimaryNav、SourceStatus、StatePanel、Sheet/Button primitives、Paper Workbench tokens；Caphub 新页面仍须单独通过 T3 Brief、mockup、独立 review/verification 和 Human release gate。
- 配置与部署：`lib/planning/config.ts`、`config/alljobs.example.json`、launchd plist、Cloudflare Tunnel/Access、`scripts/verify-deployment-config.mjs`、loopback-only `start:prod`。

## 4. 迁移清单

| 顺序 | 迁移单元 | 结果 | 对应计划 |
|---|---|---|---|
| P0 | Backlog 管理退役与壳层稳定化 | 移除管理入口，保留只读 planning 证据与 shared subsystems | `2026-09-14-alljobs-backlog-retirement.md` |
| P1 | Caphub foundation + Web Capture API | 建立 schema、ports、filesystem adapter、object store、可追踪 Capture | `2026-09-14-caphub-foundation.md` |
| P2 | MiniMax/Kimi providers 与分析流水线 | 只读分析、双模式 Kimi provider、结构化产物与失败队列 | 后续独立计划 |
| P3 | Review Center 与 PostgreSQL Registry | 审批、审计、版本、去重、正式 Registry 事实来源 | 后续独立计划 |
| P4 | Obsidian 与平台导出 | Registry 单向投影、Capability Package adapters、Diff/rollback | 后续独立计划 |
| P5 | 自研能力人工移交 | BuildProposal、Kimi Code/Claude/Codex handoff、隔离验证 | 后续独立计划 |
| P6 | Runtime Router、evals 与 update watcher | 按需装配、使用反馈、黄金集、更新提案 | 后续独立计划 |

## 5. 开发边界

- 第一期所有 Candidate、Build、Implementation、Release 和 Update 均须 Human approval。
- MiniMax 必须在技术层 hard deny 文件写入、Shell、Git、依赖安装、代码实现、部署和发布。
- Kimi Research 仅允许只读 Registry/Web/Media；只有 Kimi Code 可以实现已批准代码，或由 Human 手工移交 Claude/Codex。
- 后续 `KimiProvider` 必须提供 API key 与本地 OAuth/login 两个可替换 adapter；P1 foundation 不实现任何 provider。
- PostgreSQL 是最终 Registry 事实来源；P1 只定义 `CaptureRepository` port 与本地 filesystem adapter，后续 P3 以 contract tests 迁移到 PostgreSQL。
- Object Storage 通过 port 隔离；P1 的本地 adapter 仅用于开发和测试。
- 不迁移 Linear 数据，不改 Git remote，不自动发布，不自动 merge/deploy，不把 Obsidian 当数据库。

## 6. 风险与回滚

| 风险 | 预防与回滚 |
|---|---|
| 把 Backlog reader 当 writer 一并删除 | 先加壳层/contract 失败测试，再断开 UI/action；保留 parser/provider/schema，运行 focused + full tests |
| Human dirty files 被覆盖 | 实施前后精确比较 `git status --short`；只 stage 计划列出的文件；发现重叠即停止 |
| Assistant/monitoring 被破坏 | 分别运行 R2/R5 focused tests；保留 config schema、Origin、stale、safe-off、single-flight、cache contracts |
| Filesystem foundation 被误当最终 Registry | API 返回明确 adapter metadata；P3 前不宣称 PostgreSQL Registry 完成 |
| Capture 重试产生重复对象或附件 | client idempotency key + payload digest；repository 原子 compare-and-return；object key 以 SHA-256 内容寻址 |
| 未审批内容产生真实副作用 | P1 状态最多到 `CAPTURED`/`WAITING_FOR_REVIEW`；没有 publish/build/provider/agent 工具注册 |
| 发布影响现有 Control Host | 每阶段保留前一已批准 commit/build；Human release approval 前不重启 launchd 或修改 Tunnel |

回滚以阶段 commit 为单位恢复上一已批准 build；不得通过删除 planning data、Capture evidence 或历史审批记录来“回滚”。本次文档准备不产生运行时变更，因此回滚仅需撤销这五个新增 Markdown 文件，且须由 Human 明确授权。

## 7. 完成定义

开发转移准备在以下条件同时满足时成立：

- 已批准设计按原文保存为 canonical spec。
- 主路线图把 P0–P6 拆成可独立评审、独立验收的阶段。
- P0 与 P1 各有一份基于真实文件/命令、无占位符、带 TDD 和回滚的详细计划。
- Git remote 与审计前一致，Human-owned 工作区改动保持原样。
- 未修改业务代码、未删除 Backlog、未迁移 Linear 数据、未调用模型 provider、未部署、未 commit/push。
- 下一安全动作是由 Human 选择并批准执行 P0；P1 必须等 P0 验收和独立门禁完成后才能开始。
