# T1 · data-layer — 数据层：schema、seeds、解析与派生

## 背景（必读，按此顺序）

1. `PRODUCT.md` — 产品事实
2. `.agent/frontend-design/alljobs-workbench-v1/brief.md` — T3 Brief **r2，已 Approved**：数据 schema canonical 定义、状态矩阵、验收标准
3. `.agent/frontend-design/alljobs-workbench-v1/mockup/` — 已批准的 rendered 设计（种子内容以它为准）

**本任务是已批准 Brief 的生产实现阶段。不要重开 Brief、不要再走 Mockup Gate、不要生成新的 Start Card——T3 记录已存在于上述目录。** 遵循 repo 根 AGENTS.md（含 Next.js 版本警告与 pact 协议）。

## 交付物

1. **`data/` 种子**（内容与 mockup 一致）：
   - `data/projects/*.md` ×10：pactify-apps、alljobs、agent-pact、codesk、eastern-astrology-mvp、tradelinks、petcare-app、diskwatch、mathmagics-mvp、design——frontmatter 按 brief schema；tradelinks 含 `blocked_reason: 等海外供应商报价答复` 与 `blocked_since: 2026-08-06`（schema 新增可选字段 `blocked_since`，date）
   - 每个文件 frontmatter 后加一行 HTML 注释 `<!-- 占位样例：状态/优先级/日期待 Joey 校正 -->`
   - `data/log/2026-08-07.md`、`2026-08-08.md`、`2026-08-10.md`、`2026-08-11.md`——行文法 `- HH:MM <slug> @<agent> <text>`，条目取 mockup（overview/log/project 三页并集，去重）
   - `data/README.md`：schema 速查 + 行文法 + 「任何 agent 改文件即写入」说明
2. **解析层 `lib/data/`**（TypeScript，server-only）：
   - 依赖：`gray-matter` + `zod`（`npm install`）；测试：`vitest`（devDep，package.json 增加 `"test": "vitest run"`）
   - `schema.ts`：zod schema（project frontmatter + log 行）；`types.ts` 导出推断类型
   - `read.ts`：读 `data/projects/*.md` 与 `data/log/*.md`；**容错**：单文件/单行解析失败不得抛出，收集为 `ProofIssue { file, line?, field?, message }`（「校对」清单）返回，其余照常
   - `derive.ts`：派生逻辑——
     - 项目 `lastEntry` = 提及该 slug 的最新日志行（日期+时间）；无则 null（UI 显示 `—`）
     - `stale` = status active 且（无记录或 lastEntry ≥7 天前）
     - `dueSoon` = due 存在且 ≤5 天后
     - `blockedDays` = blocked_since 存在时距今天数
     - 注意清单 = blocked ∪ stale ∪ dueSoon（按此优先级去重排序）
     - 14 日活动数组（每项目每日条数，0–4+ 封顶 4）；masthead 计数（active/blocked/今日笔数）
   - 相对时间格式化（刚刚/N 小时前/昨天/N 天前/MM-DD）与日期工具（周几中文、ISO 周号）——**周几必须由日期真实计算**
3. **单元测试**（vitest，≥8 例）：schema 通过/拒绝、坏 frontmatter 进 ProofIssue 不抛错、坏日志行进 ProofIssue、lastEntry/stale/dueSoon/blockedDays/14 日数组边界（跨月、空日、未知 slug 行→ProofIssue）

## 验收

- `npm run lint && npm run build && npm test` 全绿
- 手工注入一个坏 frontmatter 文件 → read 层返回 ProofIssue 且其余项目正常解析（写成测试）
- 不引入任何 UI；不改 app/ 下页面

## 证据（checkpoint 时写入 evidence）

命令输出（lint/build/test）、新增文件清单、测试用例数。
