# alljobs v2 重设计实现规格

> 方向：Apple HIG，浅色系，三栏（Finder/备忘录语法）。用户已确认「推倒重来」。
> 工作分支：`redesign/apple-hig-v2`。seed key：`755ffb78`。

---

## 1. 信息架构（核心不变，重新组织）

总原则：**左栏导航（源列表），中间列表，右栏详情；手机折叠为单栏栈。**

路由（保留 App Router 文件约定）：

| 路由 | 内容 |
|---|---|
| `/` | **今天** 视图：注意力清单置顶 + 今日时间线 + 快速添加。单主内容区（类似 Reminders 的「今天」）。 |
| `/projects` | 项目索引：左源列表 + 中项目列表 + 右占位（提示选择项目）。 |
| `/projects/[slug]` | 同一布局，中项目列表保持，右项目详情。 |
| `/log` | 日志时间线：左源列表 + 主内容区（分段过滤 + 日分组倒序流）。 |
| `/stats` | 数据统计：左源列表 + 主内容区（关键指标 + 30 日趋势 + agent 分布 + 连续记录）。 |
| `/board` | 任务看板：左源列表 + 主内容区（项目选择器 + todo/doing/done 三列拖拽）。 |

导航语义：
- 源列表顶部「智能列表」：今天、注意力、看板、统计、日志。
- 其下「项目」分组：活跃、搁置、完成。点击项目 → `/projects/<slug>`。
- 当前项用系统蓝高亮 (#0071ff 选中文本)，图标与文字，徽章计数。

---

## 2. 设计 Token（浅色系 only）

全部写入 `app/globals.css`，覆盖旧账本 token。使用 Tailwind v4 `@theme inline`。

### 颜色
```css
--bg: #F5F5F7;                 /* app underlay / sidebar */
--surface: #FFFFFF;            /* content cards / lists */
--surface-secondary: #F2F2F7;  /* grouped sections */
--hairline: rgba(60,60,67,0.12);
--divider: #D1D1D6;            /* visible borders */

--label-primary: #1D1D1F;
--label-secondary: #6E6E73;    /* contrast ≥4.5:1 on white */
--label-tertiary: #8E8E93;
--label-inverse: #FFFFFF;

--accent: #007AFF;             /* controls / selected / focus ring */
--accent-text: #0066CC;        /* inline links ≥4.5:1 */
--accent-hover: #0051D5;
--focus-ring: #0066CC;

--red: #FF3B30;
--red-text: #D70015;
--orange: #FF9500;
--orange-text: #C93400;
--green: #34C759;
--green-text: #248A3D;
--yellow: #FFCC00;
--gray: #8E8E93;
--gray-text: #636366;

/* status semantic */
--status-active: #34C759;
--status-blocked: #FF3B30;
--status-paused: #FF9500;
--status-done: #8E8E93;
--status-due: #FF9500;

/* agent chips (solid bg + dark text) */
--agent-claude: #BF5AF2;
--agent-codex: #5E5CE6;
--agent-kimi: #0A84FF;
--agent-joey: #FF375F;
```

### 字体
```css
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
```
Body 15px / 1.5，sidebar 13px / 1.3，detail title 22px semibold。

### 尺寸
- 侧边栏宽度：`240px` desktop，`200px` tablet，手机抽屉。
- 列表列 minmax：`320px`。
- 详情列：`1fr`。
- 圆角：cards 10px；controls 8px；buttons pill；seg control 8px。
- 间距：1px hairline 分隔为主；section gap 24px；inner padding 16px / 12px。

### 动效
- 原生 ease：`cubic-bezier(0.32, 0.72, 0, 1)` for sheet/sidebar。
- 微交互：state 过渡 150ms；focus ring 2px solid accent。
- `prefers-reduced-motion` 全局禁用。

---

## 3. 组件层（新建 `components/workbench/`）

旧 `components/ledger/` 在视图重写完成后删除。新组件全部 TypeScript。

### Chrome
- `Sidebar`：源列表。props: `counts`, `projectsByStatus`, `activeItem`, `attentionCount`。
- `Toolbar`：页面标题 + 全局「新建日志」按钮（提交到 quickAdd server action）。props: `title`, `children`（过滤/操作）。
- `SplitView`：三栏布局容器（Sidebar + List + Detail）。手机端退化为单栏。
- `ContentArea`：主内容区 padding 与 max-width（非 split 页面用）。
- `ContractComment`：方向契约 HTML 注释，种子 `755ffb78`，挂载在 `body` 首子。内容见 §9。

### Primitives
- `ListRow`：中栏行通用组件（title, subtitle, meta, leading icon/chip, trailing, selected, href）。
- `DetailCard`：右栏分组卡片（title + children）。
- `SegmentedControl`：分段过滤控件。
- `Badge`：计数/状态小徽章。
- `AgentPill`：agent 色标胶囊（claude/codex/kimi/joey）。
- `StatusDot`：彩色状态圆点。
- `EmptyState`：空数据占位。
- `ProofBanner`：坏文件指认横幅（保留原有能力）。

### Forms
- `QuickAddSheet`：快速添加表单，替换旧 `today-sheet`。逻辑复用：form action → `quickAdd`，提交后 `refresh()`。受控 select 仍用原生 reset + queueMicrotask 方案，但视觉上按 Apple sheet 重做。

---

## 4. 数据层扩展

### 4.1 日志条目增加 `kind`
扩展 `logLineSchema`，新增可选字段 `kind: z.enum(["session"]).default(null)`。
语法：日志行中 agent 后可选 `[kind]` 标记：
```
- 21:14 alljobs @kimi [session] 重设计 brief 定稿，进入实现
```
解析时：正则 `^-\s+(\d{2}:\d{2})\s+([a-z0-9][a-z0-9-]*)\s+@(\S+)(?:\s+\[(\w+)\])?\s+(.+)$`。
未知 kind 不 fatal，计入 issue 并保留条目 kind=null。

### 4.2 任务实体 `data/tasks/<slug>.md`
文件约定：
```yaml
---
project: <slug>
---
```
body 为 markdown task list，每行一条任务：
- `- [ ] 任务文本` → todo
- `- [/] 任务文本` → doing
- `- [x] 任务文本` → done

新建 `lib/data/tasks.ts`：
- `TaskItem = { status: "todo" | "doing" | "done"; text: string; line: number }`
- `readTasks(dataDir): Map<slug, { items: TaskItem[]; issues: ProofIssue[] }>`
- 容错：文件非 task list 时进 issues；非法 marker 进 issues；文件名为未知 slug 时进 issues。
- 更新 `data/README.md` 加入 Tasks 与 Sessions 格式。

### 4.3 统计派生 `lib/data/stats.ts`
纯函数，输入 `LedgerData + tasks + today`：
- `activeProjectsCount`, `blockedCount`, `pausedCount`, `doneCount`
- `entriesLast30Days: {date; count}[]`
- `entriesByAgent: {agent; count}[]`
- `entriesByProject: {slug; count}[]`
- `currentStreak(today, entries): number`（连续有日志的天数）
- `longestStreak(today, entries): number`
- `taskCounts: {todo; doing; done}`
- `sessionCount`（kind=session 的条目数）

### 4.4 测试
- 更新 `lib/data/schema.test.ts` 加 kind 合法/非法用例。
- 更新 `lib/data/read.test.ts` 加 kind 解析与未知 kind issue。
- 新增 `lib/data/tasks.test.ts`。
- 新增 `lib/data/stats.test.ts`。
- 更新 `seed.test.ts`：真实 data/ 中新增 sample tasks + session 行后断言数字同步。
- 更新 `data/README.md`。

### 4.5 样本数据
- `data/tasks/alljobs.md`：3 条任务（todo/doing/done 各一）。
- `data/tasks/pactify-apps.md`：2 条任务。
- `data/log/2026-08-11.md` 追加一条 `[session]` 行。

---

## 5. 视图实现

### 5.1 `/` 今天视图
- 顶部 Toolbar：标题「今天」+ 日期 + 新建日志按钮。
- 注意力清单（Attention）：如果存在，放在 surface card 顶部；每个项为 ListRow，显示项目名、原因（blocked/stale/dueSoon）、天数、跳转链接。
- 今日时间线：按时间倒序列出今日日志条目，session 项带特殊图标/颜色。
- 快速添加：Toolbar 的「新建日志」按钮触发一个 slide-over sheet（Apple 风格），表单复用 quickAdd。
- 空状态：没有日志时显示 EmptyState，引导落账。

### 5.2 `/projects` 与 `/projects/[slug]`
使用 `app/projects/layout.tsx` 渲染 `SplitView`：
- 中栏：项目列表，默认按 priority 分组（P0/P1/P2）或按 status 过滤（SegmentedControl）。
- 右栏：`children`。`/projects/page.tsx` 渲染占位「选择项目」；`[slug]/page.tsx` 渲染详情。
- 项目详情：
  - header：title、slug、status dot、priority badge、links（repo/obsidian/folder/url）、agents。
  - 分组卡片：Now / Next / Notes。
  - 活动流：该项目相关日志 + session，按日分组。
  - 任务区：迷你任务列表 + 链接到 `/board?project=<slug>`。

### 5.3 `/log`
- Toolbar 标题「日志」。
- SegmentedControl：全部 / 按项目 / 按 agent。
- 日分组倒序流，30 天外按月折叠（复用现有 `foldOlderThan` 逻辑）。
- session 项带 icon。

### 5.4 `/stats`
- Toolbar 标题「统计」。
- 关键指标卡片（4 列）：活跃项目、今日日志、连续记录、任务完成率。
- 30 日日志柱状图（纯 CSS/HTML bars，不引入图表库）。
- Agent 分布 / 项目分布（水平条）。
- 顶部项目活跃度排行（最近 14 天条目数）。

### 5.5 `/board`
- Toolbar 标题「看板」+ 项目选择器（SegmentedControl 或 Select）。
- 主区为三列卡片：待办 / 进行中 / 已完成。
- 任务卡片可拖拽到另一列，触发 `moveTask` server action 改写文件 marker。
- 手机端退化为三列垂直堆叠（不可拖拽或长按菜单），保证可查看。

---

## 6. Server Actions

保留 `app/actions/quickadd.ts`，行为不变。
新增 `app/actions/movetask.ts`：
- `moveTask(prev, formData)` 或 `(taskFile, line, newStatus)`。
- 读取 `data/tasks/<slug>.md`，修改指定行 marker，写回。
- 验证：任务文件存在；newStatus ∈ todo/doing/done；line 合法。
- 错误：validation / fs 两类，返回状态，页面 `useActionState` 处理。
- 成功后 `revalidatePath("/board")`。

---

## 7. 可访问与质量

- 键盘：sidebar 链接可达，三栏焦点顺序自然。
- 对比度：正文 ≥4.5:1；大标题 ≥3:1。
- 状态不靠单一颜色：blocked 加图标，due 加徽章。
- 动效尊重 `prefers-reduced-motion`。
- 坏文件继续 ProofBanner 指认；单文件错误不拖垮页面。

---

## 8. 方向契约 HTML 注释（ContractComment 内容）

```html
<!--
THESIS: 一台 Apple 原生生产力工具形态的个人工作台——信息架构即 Finder/备忘录三栏，总览即「今天」智能列表；拒绝 v1 的账本隐喻与任何网页式 dashboard 卡阵。
OWN-WORLD: macOS 浅色系：#F5F5F7 底、白内容面、#6E6E73 次级文字、#0066CC 链接/#007AFF 控件，SF 系统字体栈，10px 连续圆角，hairline 分隔线，分段控件与源列表为原生语法。
STORY: Joey 打开「今天」，30 秒内看到注意力清单（blocked/逾期/停滞）与今日时间线，一键落账；侧栏随时下钻任何项目。
FIRST VIEWPORT: 左源列表（智能列表+项目分组），主区顶部工具栏（标题+⌘N 落账），注意力清单元顶，下接今日时间线。
FORM: Apple HIG Operate 三栏（用户 pin，骰选让位），seed 755ffb78。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
-->
```

---

## 9. 分支与提交策略

- 在当前 `redesign/apple-hig-v2` 分支上直接修改。
- 实现完成后一次性 commit；commit 信息：`redesign: Apple HIG 三栏工作台 + 任务/统计/会话/到期提醒`。
- 不要 push。
