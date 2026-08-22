# alljobs v2 — Design System

> 分支：`redesign/apple-hig-v2` · seed `755ffb78` · 方向：Apple HIG 浅色系三栏工作台。

---

## 1. 视觉方向

- **世界观**：Apple 原生生产力工具（Finder / 备忘录 / 提醒事项）的三栏语法，而非网页 dashboard。
- **模式**：Operate — 信息密度优先，动效只服务状态理解。
- **色系**：浅色系 only；无暗色模式。
- **字体**：SF 系统字体栈（安装字体优先，回退到系统 sans / mono）。

---

## 2. 颜色 Token

所有 token 定义于 `app/globals.css :root` 并通过 `@theme inline` 暴露给 Tailwind。

| Token | 值 | 用途 |
|---|---|---|
| `--bg` | `#F5F5F7` | app 底色、侧栏 |
| `--surface` | `#FFFFFF` | 内容卡片、列表 |
| `--surface-secondary` | `#F2F2F7` | 分组底纹、分段控件底 |
| `--hairline` | `rgba(60,60,67,0.12)` | 分隔线、边框 |
| `--label-primary` | `#1D1D1F` | 主标题、正文 |
| `--label-secondary` | `#6E6E73` | 副标题、meta（对比度 ≥4.5:1） |
| `--label-tertiary` | `#8E8E93` | 时间戳、占位 |
| `--accent` | `#007AFF` | 选中、按钮、焦点环 |
| `--accent-text` | `#0066CC` | 行内链接（对比度 ≥4.5:1） |
| `--accent-hover` | `#0051D5` | 按钮悬停 |
| `--red` / `--red-text` | `#FF3B30` / `#D70015` | blocked、错误 |
| `--orange` / `--orange-text` | `#FF9500` / `#C93400` | paused、due |
| `--green` / `--green-text` | `#34C759` / `#248A3D` | active、成功 |
| `--gray` | `#8E8E93` | done、中性 |
| `--agent-claude` | `#BF5AF2` | agent 色标 |
| `--agent-codex` | `#5E5CE6` | agent 色标 |
| `--agent-kimi` | `#0A84FF` | agent 色标 |
| `--agent-joey` | `#FF375F` | agent 色标 |

语义色全部用实色 token；半透明只用于 hover / focus tint，不作为语义色主体。

---

## 3. 字体与排版

- **Sans**：`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- **Mono**：`ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace`
- **正文**：15px / 1.5
- **侧栏 / 列表项**：13px / 1.3
- **页面标题**：17px semibold
- **详情标题**：22px semibold
- **徽标 / 小标签**：11px medium

---

## 4. 布局与组件

### 4.1 三栏骨架

- **桌面**：`[240px sidebar] [360px list] [1fr detail]`（`SplitView`）
- **平板/手机**：单栏堆叠；侧栏隐藏；项目列表与详情通过路由切换。
- **非 split 页面**（今天 / 日志 / 统计 / 看板）：`AppShell` 提供 sidebar + toolbar + content area。

### 4.2 核心组件

| 组件 | 职责 |
|---|---|
| `Sidebar` | 源列表：智能列表（今天、注意力、看板、统计、日志）+ 项目按状态分组 |
| `Toolbar` | 页面标题 +「新建日志」+ 页面级过滤/操作 |
| `ListRow` | 中栏通用行：title / subtitle / meta / leading / trailing / href |
| `DetailCard` | 右栏分组卡片，带小写大写标题 |
| `SegmentedControl` | 分段过滤控件；允许 flex-wrap |
| `Badge` | 计数 / 状态小徽章 |
| `AgentPill` | agent 色标胶囊 |
| `StatusDot` | 彩色状态圆点 + 可选标签 |
| `EmptyState` | 空数据占位 |
| `ProofBanner` | 坏文件指认横幅 |
| `QuickAddSheet` | 全局快速添加日志 slide-over |
| `EntryRow` | 日志行（时间 + slug 链接 + 会话徽标 + 正文 + agent + 相对时间） |

### 4.3 圆角与间距

- 卡片 / 列表：10px
- 控件：8px
- 按钮：rounded-full（pill）
- 分隔：1px hairline
- Section gap：24px；inner padding：16px / 12px

---

## 5. 动效

- **ease**：`cubic-bezier(0.32, 0.72, 0, 1)`
- **微交互**：150ms
- **落账**：新条目 `animate-settle`
- **prefers-reduced-motion**：全局禁用 animation / transition

---

## 6. 响应式

- `md`（768px+）：显示侧栏
- `lg`（1024px+）：项目页显示三栏
- 移动端：项目列表与详情互斥显示；看板退化为垂直分组列表（不可拖拽）

---

## 7. 可访问性

- 键盘可达：侧栏链接、分段控件按钮、快速添加表单。
- 状态不只靠颜色：blocked/due 加图标与文字。
- 正文对比度 ≥4.5:1；大字号/控件 ≥3:1。
- `prefers-reduced-motion` 降级。

---

## 8. 数据层扩展（v2）

- 日志条目支持 `kind: "session"`，语法：`[session]` 标记。
- 任务实体：`data/tasks/<slug>.md`，task list 语法 `- [ ] / [/] / [x]`。
- 统计派生：`lib/data/stats.ts` 提供 30 日趋势、agent/项目分布、连续记录、任务计数。
- 看板拖拽通过 `moveTask` server action 改写文件 marker。

---

## 9. 页面映射

| 路由 | 视图 |
|---|---|
| `/` | 今天：注意力 + 今日时间线 |
| `/projects` | 项目列表（选详情前占位） |
| `/projects/[slug]` | 项目详情 |
| `/log` | 日分组倒序日志流 + 过滤 |
| `/stats` | 关键指标 + 趋势 + 分布 |
| `/board` | 项目任务看板（三列拖拽） |
