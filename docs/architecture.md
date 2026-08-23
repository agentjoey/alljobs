# Architecture — alljobs

## 一句话

alljobs 是一个 **filesystem-backed、agent-native 的个人工作台**：Next.js App Router 在服务端读取 `data/` 下的 Markdown，解析并派生项目/日志/任务/统计视图；Markdown 文件本身是持久层和 single source of truth。没有数据库，没有独立 API 服务，也没有应用内账号系统。

## 数据模型

```text
data/projects/<slug>.md      项目卡：status / priority / agents / links + Now / Next / Notes
data/log/<YYYY-MM-DD>.md     每日日志：- HH:MM <slug> @<agent> [kind?] <text>
data/tasks/<slug>.md         任务：- [ ] / [/] / [x]
```

详细契约、容错规则与派生规则见 `data/README.md`。

核心原则：**文件即真相**。agent 或人直接修改 Markdown 就完成写入；git 提供历史；Obsidian 或普通编辑器都可以直接操作同一份数据。

## 读取数据流

```text
data/projects/*.md ──┐
data/log/*.md      ───┼─→ lib/data/read.ts ─→ derive / stats / task readers ─→ App Router views
data/tasks/*.md    ───┘
                         │
                         └─ ProofIssue[]：坏文件/坏行被隔离并展示，不拖垮其余页面
```

`lib/data/read.ts` 仍是主要容错边界：项目 frontmatter、日志行或关联数据出错时，问题进入 `ProofIssue[]`；可用数据继续渲染。`ProofBanner` 把错误暴露给用户，禁止静默吞掉。

v2 在此基础上增加：

- tasks reader：把 Markdown task marker 解析成 todo / doing / done
- stats 派生：30 日日志、agent/project 分布、streak、task counts、session count 等
- 日志可选 `[session]` kind；未知 kind 产生 issue，但日志文本不丢失

## 写入数据流

alljobs 仍刻意保持极小写入面。

### 快速添加日志

```text
QuickAddSheet
  → app/actions/quickadd.ts
  → lib/data/append.ts
  → data/log/<今日>.md 追加一行
  → re-render / revalidate
```

输入经过 zod/项目存在性校验；文件系统路径不是 client 可控参数。React 19 form reset 的显示值/真实提交值脱节问题在 v1 已有回归测试与修复历史。

### 移动任务

```text
/board
  → app/actions/movetask.ts
  → 校验 slug / project / line / newStatus
  → 改写 data/tasks/<slug>.md 对应 marker
  → revalidate /board
```

v2 Verification 曾发现 slug 校验不足可能导致路径逃逸，现已加入格式与项目存在性校验。Board 同时提供拖拽与键盘可操作路径，不把 HTML5 drag-and-drop 当成唯一入口。

## 路由

| 路由 | 职责 |
|---|---|
| `/` | 今天：注意力清单 + 今日时间线 + 快速添加 |
| `/projects` | 项目索引：源列表 + 项目列表 + 空详情态 |
| `/projects/[slug]` | 项目详情：状态、链接、Now/Next/Notes、活动与任务 |
| `/log` | 全站日志时间线与过滤 |
| `/board` | 项目 task 看板，todo / doing / done 三列，支持状态写回 |
| `/stats` | 活跃/阻塞、30 日活动、agent/project 分布、streak、任务/session 统计 |

主要页面按请求从文件重新读取数据；因此本地常驻 server 下修改 `data/` 后即可在下一次渲染看到结果，不需要数据库同步任务。

## UI 组件

当前 canonical UI 位于 `components/workbench/`，视觉基线来自 `.agent/frontend-design/redesign-v2/`：

- `AppShell` / `Sidebar` / `Toolbar`：全站 shell、源列表与操作区
- `SplitView` / `ContentArea`：桌面三栏与单主内容布局；移动端折叠
- `ListRow` / `DetailCard` / `SegmentedControl` / `Badge` / `AgentPill` / `StatusDot`：工作台原语
- `QuickAddSheet`：快速记录表单
- `ProofBanner`：解析/数据问题显式呈现

v1 的 `components/ledger/` 与「工作底账 The Working Ledger」视觉是历史 baseline，不再是 main 当前实现。旧设计材料保留作证据，不应与 runtime architecture 混为一谈。

## 当前视觉系统

**main：Apple HIG v2 浅色三栏工作台。** 信息架构借鉴 Finder / Notes：左侧源列表，中间对象列表，右侧详情；非 split 页面使用统一 AppShell。移动端通过 drawer/单栏栈保证主要路由可达。

`redesign/apple-hig-v2` 已于 2026-08-23 合入 `main`。旧 `restyle/apple-hig`、`redesign/apple-motion`、`feature/dashboard` 均为历史探索。

## 部署与安全边界

部署拓扑仍是：

```text
next start -H 127.0.0.1 -p 3456
  → launchd 常驻
  → cloudflared tunnel
  → Cloudflare Zero Trust Access
  → alljobs.agentjoey.ai
```

应用本身不实现登录/权限体系。安全边界是“服务仅监听 loopback + tunnel 为远程入口 + Cloudflare Access 控制访问”。详见 `docs/deployment.md` 与 `docs/operations.md`。

repo 合并某个 UI baseline 不等于生产进程已经重新 build/restart 到同一 SHA；production baseline 必须单独验证并留证据，见 `AJ-BL-003`。

## 测试与验证

当前 v2 最近一次记录（`.agent/frontend-design/redesign-v2/verification.md`，2026-08-23）：

- `npm run lint`：0 error（1 个既有 warning）
- `npm test`：75/75
- `npm run build`：成功，6 个路由均可构建
- 针对性实测：board 键盘状态移动、真实 task 文件写回/还原、移动端主导航可达

v1 曾有 102 tests，但 v2 删除旧 ledger 组件后没有把所有组件级覆盖等价迁移到 `components/workbench/*`。因此“75 < 102”本身不是失败，真正的技术债是关键 UI 行为覆盖不足；该项由 `AJ-BL-004` 跟踪。
