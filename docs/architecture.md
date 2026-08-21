# Architecture — alljobs

## 一句话

Next.js（App Router）读取 `data/` 下的 Markdown 文件、在服务端解析+派生，渲染成四条路由；
唯一的写入路径是快速添加表单，通过一个 server action 追加一行到当日日志文件。没有数据库，
没有 API，`data/` 目录本身就是持久层。

## 数据流

```
data/projects/*.md  ──┐
                       ├─→ lib/data/read.ts  ──→ lib/data/derive.ts  ──→ 页面组件（server component）
data/log/*.md       ──┘   (gray-matter 解析      (lastEntry / stale /
                            + zod 校验，           dueSoon / blockedDays /
                            容错：坏文件/坏行       14 日活动 / 注意清单
                            收集进 ProofIssue[]，   排序)
                            不抛错、不拖垮页面)

快速添加提交
  → app/actions/quickadd.ts（server action，zod 校验）
  → lib/data/append.ts（追加一行到 data/log/<今日>.md）
  → 页面重渲染（React 19 form action 的隐式流程，见 AGENTS.md「Key Implementation Details」）
```

`read.ts` 是唯一的容错边界：单个项目文件 frontmatter 损坏、或单条日志行不合行文法，都会被收进
`ProofIssue[]` 而不是抛异常——其余数据照常渲染，页面顶部的「校对」横幅（`ProofBanner`）指明
文件与字段。这是 v1 brief 的硬性验收标准之一（人为写坏一个文件，其余页面必须正常）。

## 路由

| 路由 | 文件 | 职责 |
|---|---|---|
| `/` | `app/(overview)/page.tsx` + `overview-view.tsx` | 注意清单 + 今日日志/快速添加 + 活跃项目分组（P0→P2） |
| `/projects` | `app/projects/(list)/page.tsx` + `projects-view.tsx` | 全量项目 + 状态/类型/agent 过滤（URL searchParams 驱动，默认「全部」） |
| `/projects/[slug]` | `app/projects/[slug]/page.tsx` + `detail-view.tsx` | 单项目详情、Now/Next/Notes、活动流；slug 不存在 → `not-found-view.tsx` |
| `/log` | `app/log/page.tsx` + `log-view.tsx` | 全站日志时间线，按日分组倒序，项目/agent 过滤 |

每条路由是 server component（每次请求重新读文件——本地常驻 server 下改 `data/` 刷新即见），
`page.tsx` 只负责数据获取与 loading 边界，视图逻辑在同目录的 `*-view.tsx`。`loading.tsx` 是骨架屏
（`components/ledger/skeleton.tsx`），不是转圈动画。

## 组件

`components/ledger/`：所有页面共用的原语——

- `masthead.tsx` / `footer.tsx`：顶栏（导航 tabs、日期、活跃/卡住/今日计数）与页脚
- `primitives/`：`stamp`（状态胶囊）、`agent-mark`（agent 色标+文字双编码）、`tally`（14 日活动强度）、
  `project-row`、`entry-row`、`today-sheet`（快速添加，唯一 client component，其余皆 server component）、
  `proof-banner`、`section-head`、`sheet`
- `contract.tsx`：方向契约（THESIS…FINISH 六块）以隐藏注释形式注入 `app/layout.tsx` body 首子节点，
  build 后可 `grep` 验证设计契约在产物中存活（impeccable 工作流约定）

## 视觉系统（两套，未合并）

- **main 分支**：「工作底账 The Working Ledger」——账页纸质感，红栏线结构、平印墨戳、mono 数据声部。
  token 全在 `app/globals.css`。已通过独立 Verification，是当前生产版本。
- **`restyle/apple-hig` 分支**：用 `apple-design` skill 依据 Apple HIG 重做的设计系统——Liquid Glass
  顶栏（全站唯一用玻璃）、分组列表卡片、系统语义色、明暗双模式。独立评审 Good，Critical/High 已修，
  **未合并**（视觉方向终审见 `.agent/BACKLOG.md`）。
  两套设计系统互斥于 `app/globals.css` 一份文件，合并即替换，不共存。

## 部署拓扑

见 [deployment.md](deployment.md)（初次搭建）与 [operations.md](operations.md)（日常运维）。
简述：本机 `next start -H 127.0.0.1 -p 3456`（launchd 常驻）→ cloudflared tunnel → Cloudflare
Zero Trust Access（邮件验证码）→ `alljobs.agentjoey.ai`。应用本身不含任何鉴权代码，安全边界完全
由「tunnel 是唯一入口」+「Access 只放行一个邮箱」两条构成。

## 测试

`vitest`，102 例。多数用 `renderToStaticMarkup` 断言渲染出的 HTML 片段（而非组件测试库的交互模拟），
外加 `lib/data/*.test.ts` 覆盖解析容错、派生逻辑边界（跨月、空日、坏 frontmatter）。
`components/ledger/primitives/today-sheet.dom.test.tsx` 是唯一用 jsdom + 真实 DOM 生命周期的用例，
覆盖 React 19 表单隐式 reset 的时序 bug 回归。
