# Verification Record — redesign-v2（Apple HIG 三栏工作台）

阶段: 接手完成 · 2026-08-23 · 原实现: kimi（2026-08-22，未提交即中断）

## 背景

工作目录被发现处于 `redesign/apple-hig-v2` 分支、大量未提交改动（spec.md 计划「实现完成
后一次性 commit」，中断在提交前）。核对 `.agent/frontend-design/redesign-v2/spec.md` +
`data/tasks/alljobs.md`（kimi 用自己刚做的任务功能记录自己的进度："[/] 完成 Apple HIG v2
三栏视图"）确认这是有意为之的完整实现尝试，非残留垃圾。lint/build/test 起手即全绿
（0 error · 6 路由编译通过 · 73/73），screenshots/ 目录有完整的 6 页×桌面/移动证据
（2026-08-22 10:39–10:43 一次性批量拍摄）。

## 审查发现与处置（全部已修复，逐条验证）

| # | 发现 | 严重度 | 验证方式 | 处置 |
|---|---|---|---|---|
| 1 | `/stats` 30 日柱状图完全不渲染——`items-end` 使 flex 子元素失去确定高度，`height:X%` 全部解析为 0 | Critical（核心功能不可见） | 实测 DOM：真实数据 07=1/08=2/10=6/11=5 全部算对，纯 CSS 渲染问题；截图确认修复后柱状正确 | `app/stats/stats-view.tsx`：改用像素高度（`128px` 对应 `h-32`） |
| 2 | `--accent` (#007AFF) 用作文字色/白字底色 7 处，实测 4.02:1，不达 4.5:1 | Critical（a11y，同 `restyle/apple-hig` 分支半年前修过的同一问题） | WCAG 亮度公式实算（非目测），逐处 grep 定位 | 7 处改用 `--accent-text` (#0066CC, 5.57:1)：EntryRow/Toolbar/ListRow/Sidebar×2/Badge/QuickAddSheet |
| 3 | 看板任务移动仅支持 HTML5 拖放，无键盘/读屏替代 | Critical（WCAG 2.1.1 Keyboard 硬失败） | 端到端实测：真实写入 `data/tasks/alljobs.md`，marker 正确改写，验后还原 | `app/board/board-view.tsx` 加 `<select>` 键盘替代，复用同一 `moveTask` action |
| 4 | 移动端侧栏 `md:hidden` 无任何替代入口——`/board`/`/stats`/`/log`/`/projects` 完全不可达 | Critical（核心功能缺失，非降级） | `AppShell` 与 `ProjectsShell` 各自独立渲染侧栏，两处分别核实、分别修复 | 新增共享 `MobileNavDrawer`；`ProjectsShell` 因详情态 Toolbar 本身不渲染，另加悬浮菜单按钮（仅 `!isIndex`，避免与 index 态 Toolbar 自带按钮重复） |
| 5 | 详情页悬浮菜单按钮与「项目」面包屑重叠 | Medium（4 的修复引入，非独立发现） | `getBoundingClientRect()` 实测两者矩形重叠 | 详情内容移动端加 `pt-14` 让出空间 |
| 6 | `movetask.ts` 未校验 slug 格式/项目是否存在——`join()` 可被畸形 slug 逃出 `data/tasks/` | High（security，非纯 a11y/polish） | 对照 v1 `appendLogEntry`（同一场景已用正则+存在性双重校验） | 补齐同款校验；`movetask.test.ts` 补两条回归测试（路径穿越 slug、格式合法但项目不存在） |
| 7 | `--label-tertiary` (#8E8E93，18 处引用) 实测 3.26:1 | Critical（a11y，覆盖面最广的一项） | WCAG 实算；grep 确认引用数 | 加深至 `#707075`（4.93:1，与 `--label-secondary` 同色相族） |
| 8 | `--green-text` 4.4:1，差 4.5:1 一点点 | Medium | WCAG 实算 | 加深至 `#1e8034`（5.01:1） |
| 9 | `Badge` 组件 red/orange/green/gray 四变体（当前未被任何调用点使用，但已是公开 API）与 #2 同款白字底色对比度问题 | Low（未激活但会成陷阱） | 同 #2 方法 | 四变体改用各自 `-text` token |

## 验证结果（本轮，2026-08-23）

- `npm run lint`：0 error（1 warning，`scripts/shot.mjs` 既有非本次代码）
- `npm test`：**75/75**（原 73，movetask 新增 2 条回归测试）
- `npm run build`：Turbopack ✓ 编译成功，6 路由（`/` `/board` `/log` `/projects` `/projects/[slug]` `/stats`）全部动态渲染成功
- 手动核实：`/board` 任务移动键盘路径端到端（真实文件写入→还原）；移动端 4 路由导航抽屉可达；桌面端布局对新 token 值无回归（截图对照）
- 证据：`screenshots-fixed/`（today/stats/board-alljobs 桌面 + today/detail 移动端）

## 未覆盖（明确披露，非遗漏假装不存在）

- 新 UI 组件层（`components/workbench/*`）无组件级单元测试——v1 的 `ledger.test.tsx`/
  `views.test.tsx`/`today-sheet` 测试随旧组件一并删除，v2 未补等价覆盖；现有 9 个测试
  文件全部是数据层（schema/read/seed/tasks/stats/movetask）
- 未对每个文件做逐行穷尽审查（如 `ContentArea.tsx`/`StatusDot.tsx`/`SegmentedControl.tsx`/
  `lib.ts` 只读过引用位置，未完整通读）
- 未跑自动化对比度扫描（如 `restyle/apple-hig` 分支的 `a11y-contrast.mjs`，本分支未移植）——
  本轮 9 项发现均为针对性实测，不是穷尽扫描的结果，不排除还有未发现的同类问题

## 待 Human Owner 决定

- `redesign/apple-motion`、`feature/dashboard` 两分支已由 Human Owner 确认过时，不再考虑
- 本分支 commit 后暂不 push（按 spec.md 原计划）；何时合并 main、是否需要独立 Verification
  agent 复核（本项目 T3 惯例），留待 Human Owner
