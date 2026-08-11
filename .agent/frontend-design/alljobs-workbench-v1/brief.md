# T3 Brief — alljobs-workbench-v1

状态: **Approved**（Mockup Gate 已批准，2026-08-11）· Revision: **r2** · 日期: 2026-08-11

## Start Card

```md
Workflow: 3.3
Task: alljobs-workbench-v1 —— AgentJoey 个人工作台（alljobs.agentjoey.ai）v1：
      多项目进度的日常追踪与管理
Role: Primary Agent（Claude Code / Fable 5，本会话）
Tier / 理由: T3 —— 全部为新页面/新路由（总览、项目、详情、日志），构成核心导航与关键旅程；
      展示个人项目数据（隐私边界：Cloudflare Zero Trust，见部署）
Canonical record: .agent/frontend-design/alljobs-workbench-v1/
      （brief.md · verification.md · mockup/ · handoff.md）
Branch / worktree: main @ 066a7b6（create-next-app 初始 commit；greenfield 单 agent 无并发，
      后续任务再分支）
Mockup Gate: Required —— T3 新页面：Human Owner 批准 rendered mockup 后才开始 production 实现
Review path: impeccable finish reviewer（独立子代理新会话，不继承实现上下文）→ Human Owner
Human checkpoints: ① 设计方向（已完成，见 Human decisions）② Mockup Gate（rendered 截图）
      ③ 实现后独立 verification + 发布决定
```

## 问题与结果（Baseline → Target）

- **Baseline**：多项目并行（代码/商业/运营），任务散在 Claude、Codex、Kimi 等多个 agent 会话中；进度、阻塞、下一步没有单一视图，每天靠记忆和翻会话恢复上下文。
- **Target**：每天打开 alljobs 总览，30 秒内看清「什么卡住了、今天记了什么、每个活跃项目下一步是什么」；任何 agent 改一个 md 文件即完成进度写入。
- **测量窗口**：上线后 2 周。达标信号：连续 ≥10 天有日志写入；Joey 主观确认晨检替代了翻会话。未达标由 Human Owner 决定迭代或重开 Brief。

## 范围（v1，Human Owner 2026-08-11 确认）

1. `/` 总览：注意清单（blocked / 停滞≥7 天 / 5 天内到期）+ 今日日志 + 快速添加行 + 活跃项目（P0→P2 分组，含 14 日划记格、NEXT、最近更新、agent 章）
2. `/projects` 项目列表：全部项目，类型/状态/agent 过滤
3. `/projects/[slug]` 项目详情：状态、资料链接、Now·Next、该项目活动流
4. `/log` 日志时间线：按日倒序，项目/agent 过滤
5. 快速添加日志：表单写入当日 `data/log/*.md`（本地 fs；部署形态为本地 server + Cloudflare Tunnel，远程同样可用）

**非目标（v1 不做）**：深色主题（同世界「碳写副本」变体留作后续）、任务看板、到期提醒推送、agent 会话内容集成、多用户、应用内鉴权（由 Cloudflare Access 承担）、数据编辑器（编辑走文件/Obsidian）。

## 数据 Schema（canonical，实现阶段建 data/ 与 seed）

`data/projects/<slug>.md`：

```yaml
---
title: Pactify Apps          # 显示名
type: code                   # code | product | biz | ops
status: active               # active | blocked | paused | done
priority: P0                 # P0 | P1 | P2
agents: [claude, codex]      # 常用执行 agent；joey = 人工
links:
  repo: ~/AgentWorks/CodeSpace/pactify-apps
  obsidian: obsidian://open?vault=Main&file=Projects%2Fpactify   # 可选
  folder: ~/Documents/…       # 可选（含 iCloud 路径）
  url: https://…              # 可选
tags: [ios, app-store]
started: 2026-06-02
due: 2026-08-20              # 可选
blocked_reason: 等供应商报价   # status=blocked 时必填
---
## Now
当前推进中的一件事

## Next
- 下一步（首条即总览 NEXT 列）

## Notes
自由笔记
```

`data/log/YYYY-MM-DD.md`（frontmatter 可省）：

```md
- 08:35 alljobs @claude T3 Brief 与 mockup 完成，待 Mockup Gate
- 09:10 pactify-apps @codex 修复 iOS 签名问题；TestFlight #42 上传
- 10:20 tradelinks @joey 跟进供应商邮件，改约电话
```

行文法 `- HH:MM <slug> @<agent> <text>`。解析容错：缺时间显示 `—`；未知 slug / 无法解析的行进入「校对」清单（指明文件与行号），不拖垮页面。派生：项目最近更新 = 提及它的最新日志行；stale = active 且 ≥7 天无记录。

## 状态矩阵（T3 必填）

| Surface | loading | empty | error | success | validation | disabled | 其他 |
|---|---|---|---|---|---|---|---|
| 总览 | SSR 直出；流式兜底=空格线骨架 | 无项目→引导页（教 data/ 格式） | 单文件解析失败→「校对」横幅列出文件+字段，其余照常 | 默认 | — | — | 今日无日志→空格线+引导句；注意清单为空→「今日无风险」确认行 |
| 项目列表 | 同上 | 过滤无结果→一行说明+清除过滤 | 同「校对」横幅 | 默认 | — | — | 过滤器默认「全部」（索引页职责=全集；active 视角由总览承担。r2 修订，原写 active，待 Human Owner 在 Gate 确认） |
| 项目详情 | 同上 | 无活动记录→「本页尚无记录」 | slug 不存在→404 页含项目索引；body 缺 Now/Next→占位提示 | 默认 | — | — | blocked→页首红条含 blocked_reason；done→DONE 戳+整页减淡 |
| 日志 | 同上 | 空日跳过不渲染 | 同「校对」横幅 | 近 30 天全量+按月折叠 | — | — | 项目/agent 过滤 chips |
| 快速添加 | — | — | fs 写失败→行内错误+给出手动编辑路径 | 新行落账（印压动效） | 空文本/未选项目→行内提示 | 提交中禁用 | reduced-motion→直接出现 |
| 全局 | — | — | — | — | — | — | 焦点环=红栏线色 2px；断点 ≥1024 对开双页 / 768–1023 单页 / ≤767 移动单列；无横向滚动 |

## 设计方向（Human Owner 已确认，2026-08-11）

**世界：工作底账 The Working Ledger**（concept-seed key `cda17d0d`，assigned index 6 of 7 grounded candidates；决策页被关闭未答→按规则以结构化提问重呈一次，Human Owner 选定 assigned）。挑战者（夜航六联仪表 / 星舰弯管面板 / Emigre 位图字样）经两轴权衡（受众认同 × 产品清晰度）均败于账本语法；品类标准（standing exit）已呈现，未被选择。

- **Palette**：eye-ease 绿账页纸底 `#ECF1E6`；墨色正文 `#1D211C`；红纵栏线（结构+注意）；蓝格线（feint，非文本）；蓝墨链接；状态=平印戳墨色（active 绿墨 / blocked 红墨 / paused 石墨 / done 褪墨 / due 深琥珀）——全部带文字，不只靠颜色。
- **Type**：Geist（UI）+ Geist Mono（日期/slug/计数/时间，tabular-nums）。Operate 模式，单一家族 + mono 数据声部；mono 用于数据与度量（账本中打字机记录的对应物），非「技术感」化妆。
- **结构语法**：红纵栏线贯穿全站，分隔边距列（时间/戳/索引，mono）与正文列；每行记录坐在蓝格线上；桌面总览=对开双页（左：注意+今日；右：活跃项目底账）；导航=页首下沿的索引标签（拇指索引的顶置形态，行为是标准 tabs）。
- **签名元素（大胆只用一处）**：今日区头的红色日期戳（双圈边、mono、0.5° 旋转）。其余全部平直、无纹理、无做旧。
- **14 日划记格**：sequential 单色（绿墨浅→深，5 档），2px 间隔，胞元含 aria 文本（日期+条数）；不是 GitHub 绿的复刻而是账本划记密度。
- **动效**（三档中的「纯 CSS」档）：唯一 authored moment=快速添加落账的印压（180ms ease-out）；行悬停=即时底色微染；无进场编排；prefers-reduced-motion 全禁。
- **排序定案**：总览「今日」按时间升序（账本逻辑：新行落底，快速添加即下一空行）；日志页与详情活动流按倒序（检索逻辑：最新在上）。两处刻意不同，production 不得「顺手改齐」。
- **有意图的设计选择（红线条款要求显式陈述）**：① eye-ease 绿纸而非白/奶油/深色——既是账本世界的真实材料，也把工作台与四周深色终端窗口区分为「桌上的那本账」；② 红栏线是功能性栅格（列分隔+注意色）而非装饰；③ 状态用戳（文字+墨色）而非彩点/彩边。
- **红线自查**：无米色底（eye-ease 绿 ≠ cream，色相 ~110）、无 gradient text、无 border-left 色条（红栏线为全高结构线，非卡片边）、无 hero 大数字、无 01/02 眉标、无重复图标卡。对比度目标正文 ≥4.5:1。
- **Agent 章（categorical identity）**：claude / codex / kimi / joey 四色墨章，dataviz 校验脚本验证 CVD 分离与对比（结果见 verification.md）；色随实体固定，永不按序循环。

**方向契约**（THESIS/OWN-WORLD/STORY/FIRST VIEWPORT/FORM/FINISH 六块）写入 mockup/overview.html 首注释；production 实现时同一契约进入 app/layout.tsx 的 body 首注释。DESIGN.md 按 impeccable 规则在 production build 完成时由 documenter 从建成世界记录（mockup 阶段不预写规则书，避免对着未批准物固化权威——记录为时序决定）。

## 验收标准

1. 1440×900 总览首屏含：注意清单、今日日志与快速添加、≥P0 组活跃项目；30 秒判断测试通过（Owner 亲手走查）。
2. 任一 agent 向 `data/log/<今日>.md` 追加一行，刷新后总览与对应项目详情均出现该行。
3. 人为写坏一个项目文件的 frontmatter：其余页面照常渲染，校对横幅指明文件与字段。
4. 390px 宽全站可读可操作，无横向滚动；快速添加可用。
5. type/lint/test 通过；axe 扫描无 serious+；键盘全可达、焦点可见；对比度抽查 ≥4.5:1；reduced-motion 降级验证。
6. 最终截图来自修复后最终 build（桌面+移动）。

## 验证与回滚计划

- 验证顺序按 workflow §8：自动化检查 → 状态与数据边界（含坏文件注入）→ 键盘/焦点/对比/axe → 响应式双端截图 → 关键旅程 E2E（晨检→详情→快速添加落账）。T3 由独立 Verification 会话对最终 build 执行，不采信 Primary 文字结论。
- 回滚：应用层 `git revert` + 重启本地 server 即回滚；Cloudflare Tunnel/Access 配置独立于应用代码，出问题可单独停 tunnel（服务下线但数据无损）。数据层为纯文件，应用故障不影响 data/ 可读写。
- 部署形态：本地常驻 server（`npm run build && npm start` 或 launchd）+ cloudflared tunnel → alljobs.agentjoey.ai；Cloudflare Access 邮件验证码。Cloudflare 侧配置需 Owner 在 dashboard 登录操作，实现阶段我提供 config 模板与步骤文档（`docs/deploy.md`）。

## Production 实现待办（独立评审遗留，不阻塞 Gate）

- 字体走 next/font 自托管 Geist（mockup 的 Google Fonts CDN 不得带入；本地 server 离线可用）
- 方向契约注释迁入 app/layout.tsx 的 body 首子注释；production build 后 grep seed key `cda17d0d` 验证存活
- a11y：快速添加校验错误 aria-describedby 关联输入；各页补 h1 与标题结构（日志页 dayhead 转标题元素）；「回车落账」用真实 form submit 承接
- mockup 行内样式全部收进 class/token；`.blockbar` 等样张组件进组件库
- 划记格 aria 文本由数据生成（杜绝手写数字漂移）；tooltip 补每日明细

## Mockup Gate 决定

```md
Mockup Gate: Required（T3 新页面）
理由 / mockup revision / 预览方式: r2（r1 + 独立评审 M1–M5 修复）· standalone HTML（项目 token）· 本地静态服务 + 浏览器
桌面与移动端证据: mockup/screenshots/（见 verification.md 清单）
批准方向 / 需修改项 / 延后细节: 批准 r2，无修改要求；「默认过滤=全部」修订一并确认
Human Owner decision: 批准（2026-08-11）。附加指令：生产实现用 pactify（agent-pact 协议）驱动，
  worker=Kimi Code（k3 模型），Claude 会话自主驱动编排；commit 到本地 main 已授权（不 push）
```

## Human decisions 记录

| 日期 | 决定 | 方式 |
|---|---|---|
| 2026-08-11 | 数据层=Repo 内 Markdown | 结构化提问 |
| 2026-08-11 | 部署=本地 server + Cloudflare Tunnel + Zero Trust 邮件验证码 | 结构化提问（自定义答案） |
| 2026-08-11 | v1 范围=4 页 + 快速添加 | 结构化提问 |
| 2026-08-11 | 视觉方向=工作底账（assigned） | 决策页关闭未答 → 结构化提问确认 |
| 2026-08-11 | Mockup Gate 批准（r2）+ 默认过滤=「全部」确认 | 结构化提问 |
| 2026-08-11 | 实现执行方式：pactify 编排 · worker=kimi(k3) · Claude 自主驱动 · 授权本地 commit | 结构化提问（自定义答案） |

## Next safe action

构建 mockup（5 页：overview / project / projects / log / states）→ detect.mjs → 双端截图自检（≤2 轮）→ 独立 finish review → 更新 verification.md → **暂停在 Mockup Gate**。
