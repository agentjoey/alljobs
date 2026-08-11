# T3 Brief — alljobs-restyle-apple（视觉世界替换）

状态: **Draft**（等 Human Owner 对 rendered 结果的决定）· Revision: r1 · 日期: 2026-08-12
前置任务: [alljobs-workbench-v1](../alljobs-workbench-v1/brief.md)（已 shipped，main @ ee320ec）

## Start Card

```md
Workflow: 3.3
Task: alljobs-restyle-apple —— 用 apple-design skill 把全站视觉世界从「工作底账」改为 Apple HIG
Role: Primary Agent（Claude Code / Fable 5）
Tier / 理由: T3 —— 替换已批准 T3 surface 的视觉世界，覆盖核心导航与全部关键旅程；
      按 §6「最终 build 与已批准 mockup 实质偏差 → Reopened」，前任务 alljobs-workbench-v1
      的视觉批准对本改动失效，须重新取得 Human Owner 对 rendered 结果的批准
Canonical record: .agent/frontend-design/alljobs-restyle-apple/
Branch / worktree: restyle/apple-hig（base ee320ec）——**未合并，main 保持已验证的账本设计**
Mockup Gate: Required —— 采用视觉确认阶梯最上一档：真实应用的 dev-only 预览
      （127.0.0.1:3510 + 16 张最终 build 截图），而非独立 HTML mockup
Review path: 独立 apple-design 评审（新会话子代理，不继承实现上下文）
Human checkpoints: 设计方向（已由本次指令 pin 定）→ 本 Gate（rendered 结果）→ 合并决定
```

## 方向（Human Owner pinned）

「用 apple-design skill 更新页面风格」。impeccable 规则：**user- 或 brief-pinned 方向优先于概念骰**，
故本次不跑 concept-seed，直接以 Apple HIG 为世界；前身账本世界的 seed `cda17d0d` 与全部设计证据
保留在 alljobs-workbench-v1/ 与 mockup/，可随时回退。

## Skill 溯源（第三方，已审）

- 来源：GitHub `dickwu/apple-design-skill`（`name: apple-design`，55 篇 md：SKILL.md + hig-lookup + 53 篇 HIG 规范）
- 装入：`~/.claude/skills/apple-design/`（用户全局，与既有 impeccable 等同目录）
- 安装前安全扫描：无脚本/二进制（仅 .md + .cursorrules + .gitignore）、无网络调用、无 `curl|sh`、
  无提示注入语句；命中的 password/token 关键词全为 HIG 隐私章节正文。仓库无 LICENSE 文件（内容源自 Apple HIG），
  仅作本地设计参考使用。
- 该 skill 定位是**审查器**（reviewer），本次用法：先按其 Design Review Process 审计现有 build，
  再以其 references/hig/ 的规范条文驱动重做设计系统。

## 改动范围

- `app/globals.css` 全量重写为 Apple HIG 设计系统（明暗两套语义 token）
- `components/ledger/contract.tsx`：方向契约六块改写为新世界（seed 血统保留一行）
- `components/ledger/primitives/date-stamp.tsx`：倾斜双圈日期戳 → 平台 large title
- `components/ledger/primitives/today-sheet.tsx`：占位文案精简为「记一笔…」，回车承诺移入 aria-label
- `scripts/shot.mjs`：新增第 6 参数 `light|dark`（CDP `Emulation.setEmulatedMedia`），
  使明暗截图证据可复现，不再继承宿主系统外观
- 测试：3 处断言随设计决定更新（日期分隔符、占位文案）
- **未动**：数据层、路由、页面结构、server action、派生逻辑

## 设计决定（逐条有据）

| 决定 | 依据 |
|---|---|
| 功能层唯一玻璃 = 顶栏（blur 30px · saturate 180% · 半透明），内容层一律不透明卡片 | liquid-glass.md「Don't use Liquid Glass in the content layer」；blur/opacity 取其建议区间（regular 变体 20–40px / 0.6–0.8） |
| 顶栏在 `prefers-reduced-transparency: reduce` 与不支持 backdrop-filter 时退为实色 | 同上 + accessibility.md |
| 分组列表：卡面 + 12px 圆角 + 发丝分隔线自文字前缘起 | layout.md 分组与对齐；平台分组列表惯例 |
| 导航改分段控件 | 平台原生形制；同时保住原有 aria-current 语义 |
| 状态戳 → 着色胶囊（色 + 文字） | color.md「Avoid relying solely on color」 |
| 系统字体栈 `-apple-system…`，mono 用 SF Mono | typography.md「Access all system fonts — don't embed」 |
| 正文 15px、层级 11/12/13/15/22/28 | typography.md 桌面 13pt/移动 17pt 之间的 Web 取值；operate 模式紧凑步进 |
| 深色模式随系统切换，**不做 app 内主题开关** | dark-mode.md「Avoid offering an app-specific appearance setting」 |
| **强调蓝下沉 #007AFF → #0066CC（浅色）** | accessibility.md：≤17pt 文字需 4.5:1；实测 Apple 系统蓝在白底仅 4.00:1，白字在其上 3.99:1 |
| **label 层级加深**（secondary 0.68→0.88、tertiary 0.42→0.76；深色 0.66/0.42→0.78/0.60） | 同上：Apple 语义 label 色实测 4.25:1 / 2.24:1，不满足 4.5:1 门槛；上一版账本 build 全站 ≥4.5:1，不接受改版倒退 |
| agent 色标浅色组 `#C93400 / #0050E6 / #8E3A96 / #2E7D32` | dataviz `validate_palette --pairs all` **全通过**（正常视力最差邻对 ΔE 21.4） |
| agent 色标深色组取平台亮度变体 | 严格 all-pairs CVD 下蓝/紫处 floor band——**Apple 自身系统色亦然（实测 ΔE 5.9）**；identity 恒由「色标 + 文字」双编码承载，符合 floor band 的二次编码要求。已如实披露，未声称通过 |
| 活动强度用单色相 sequential 梯 | dataviz：magnitude 用单 hue 明度单调 |
| 动效仅落账插入（0.32s，平台 ease）+ 行悬停 | motion 纪律；reduced-motion 全禁 |

## 验证结果（本分支最终 build）

- `npm run lint` 0 error（1 warning：scripts/shot.mjs 既有）· `npm test` **102/102** · `npm run build` ✓ 四路由动态
- **对比度实测（CDP，明/暗 × 1440/390 × 三路由，共 37 项检查点）：0 项不达标**
  （脚本合成半透明底色后计算；首轮未合成时误报，已修正后复测）
- 无横向滚动：四路由 390px `scrollWidth == clientWidth`
- 每页 h1 唯一；键盘焦点环为 3px 强调色（`:focus-visible`）
- 16 张最终 build 截图（四路由 × 桌面/移动 × 明/暗）存 `screens/`

## 独立评审（apple-design skill · 新会话子代理）与处置

**总评：Good**；未出现 rebuild 级发现。评审者独立复算了对比度、CVD 模拟、像素合成值，并对我的四项主张逐条裁定——
其中**主张①「37 项对比度全过」被判定为部分不实**：我的审计只覆盖静态文字对，**漏掉交互态与全部非文字对比度**。这条批评成立。

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| C1 | **Critical** | 焦点环用 `color-mix(…55%, transparent)` 实测仅 2.27–2.43:1（需 3:1）；快速添加输入框 `outline: none` 让焦点提示掉到 1.44:1，且未分层的组件规则恒压过 `@layer base` | 焦点环改 2px 实色强调色、删除误导性的 `border-radius`、输入框不再 `outline:none`（柔光降为辅助）。**CDP 真实 Tab 键实测**：明/暗各 9 个焦点位，3.82–5.76:1 全部达标 |
| C2 | High | 选中态 chip 的计数文字 4.00/3.62:1 | 白字 alpha 0.78 → 0.92 |
| C3 | High | 有明/暗两档但缺 `prefers-contrast: more` 档 | 新增增强对比度档（label/分隔线/tally 加深、卡片实描边、顶栏去玻璃） |
| C4 | High | 强调蓝被 14 日活动图借用——数据不可点却与「可点=蓝」同色，自我违背方向契约 | 活动梯改中性石墨；蓝色只保留「可点」一种含义 |
| I1 | Medium | 深色 agent 色标 codex↔kimi 在红绿色盲下 ΔE 0.6–2.1（**完全重合**，我此前措辞「floor band」失真） | 重选深色组：codex↔kimi 正常视力 ΔE 21.6；最差配对变为 claude↔joey（橙/绿）deutan 6.7，处合法 floor band。**CSS 注释按实情重写**，不再淡化 |
| I2 | Medium | 活动图 5 档里 3 档不可见（1.15–2.24:1） | 梯度抬升：浅色 1 档 2.24 → **3.11**、2 档 4.74、3 档 7.36；条宽 6 → 8px |
| I3/I4 | Medium | 同屏三种状态写法（`ACTIVE` / `停滞` / `active`）；详情页中英双写全大写眉标 | 抽出 `STATUS_LABEL` 词典统一为中文句首式（进行中/卡住/暂停/已完成/停滞），胶囊与 chip 共用；详情标题去掉冗余英文 |
| I5 | Medium | 移动端控件 32–36px，低于平台默认 44pt | 移动断点内按钮/chip/输入/下拉 ≥44px，tab 40px，chip 间距 10px |
| I7 | Medium | 深色卡面与纯黑分组底仅 1.23:1 且取消了阴影 | 深色补 0.5px 极淡描边作为备用深度线索 |
| I6 / I8 / I9 / I10 / I11 | Low–Medium | 多维筛选器缺分组语义、玻璃缺 scroll edge effect、桌面端 NEXT 单行截断、灰色一色多义、safe-area/行长等 | **未做，留作后续**（不阻塞：均非可达性门禁，且部分需改结构而非样式） |

评审复核后的实测（最终 build）：文字对比度 37 项 **0 不达标**（明/暗 × 桌面/移动）；焦点环 18 个位点全部 ≥3:1 实线；
`lint` 0 error · `test` 102/102 · 四路由 390px 无横向滚动。

## 待 Human Owner 决定

1. 采用 Apple 版并合并 `restyle/apple-hig` → main（合并后需重跑独立 Verification）
2. 保留账本版（main 不动，本分支留作备选）
3. 择优混合（例如保留账本世界但采纳其中的深色模式 / 对比度修正）

**在决定之前，main 与线上运行的仍是已验证的账本 build。**
