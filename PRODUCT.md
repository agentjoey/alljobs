# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js（App Router）+ Tailwind v4 + shadcn/ui（radix-nova 预设）+ TypeScript。
来源：Human Owner 全局前端工作流（FRONTEND-DESIGN-WORKFLOW.md v3.3），§5 Bootstrap 已于 2026-08-11 执行。
部署形态（Human Owner 2026-08-11 确认）：本地常驻 Next.js server + Cloudflare Tunnel 暴露为 alljobs.agentjoey.ai，Cloudflare Zero Trust（Access，邮件验证码登录）承担全部访问控制——应用内不实现任何登录/鉴权代码。

## Users

AgentJoey（个人开发者/运营者，唯一用户），并行推进多个项目：代码开发、商业分析、日常运营。
项目与任务由多个 agent 执行：Claude Code、ChatGPT/Codex（macOS/iOS app）、Kimi CLI 等；Joey 负责决策、验收与人工事务。
使用场景：每天过一遍所有项目状态，决定当天推进什么；随时深入单个项目查看进展与资料入口；跨 agent 交接时留下/查阅记录。桌面为主，手机（iOS Safari）查看与快速记录必须可用。

## Product Purpose

alljobs 是 Joey 的个人工作台：对所有并行项目的进度做日常追踪和管理。
成功 = 每天打开 30 秒内看清「哪些项目活着、哪些卡住、今天该推进什么」，且任何 agent 的工作留痕都汇入同一处。

## Positioning

Agent-native 的进度中枢：数据层是 repo 内 Markdown（frontmatter），任何 agent 改文件即完成写入——无 API、无凭证，git 即历史，Obsidian 可直接把 data/ 当 vault 打开。邻近产品（Notion/Linear/Jira）做不到「每个 coding agent 天然会写」。

## Operating Context

- 项目代码分布在 ~/AgentWorks/CodeSpace/ 各 repo；知识库归档在 git repo、本地文件夹（含 iCloud）与 Obsidian。
- data/ 目录即 single source of truth：data/projects/<slug>.md（项目卡）+ data/log/<YYYY-MM-DD>.md（每日日志）。写入方：各 agent（直接编辑文件）与 Joey（本地网页快速添加、或任意编辑器/Obsidian）。
- 工作台以本地 server 常驻运行；外网经 Cloudflare Tunnel 访问 alljobs.agentjoey.ai（手机场景），登录由 Cloudflare Access 邮件验证码完成。

## Capabilities and Constraints

v1 范围（Human Owner 2026-08-11 确认）：

1. 总览：今日日志、注意力清单（blocked / 长期未动 / 临近到期）、活跃项目（优先级分组，含近 14 天活动强度、下一步、最近更新、执行 agent）
2. 项目列表：全部项目 + 类型/状态/agent 过滤
3. 项目详情：状态、资料链接（repo / Obsidian / 文件夹 / URL）、Now·Next、该项目活动流
4. 日志时间线：按日倒序全量记录，可按项目/agent 过滤
5. 快速添加日志：网页表单写入当日 data/log 文件（本地 fs 写入；部署形态为本地 server，远程访问同样可用）

约束：

- 无多用户/权限体系；访问控制整体在 Cloudflare 层
- 数据文件可能被手工/agent 写坏：解析必须容错，单文件错误不能拖垮页面，须指出问题文件与字段
- 手机端定位为查看 + 快速记录；重编辑发生在桌面编辑器/Obsidian
- 未决：data schema 细节以 T3 Brief（.agent/frontend-design/alljobs-workbench-v1/brief.md）定稿为准；到期提醒、任务看板、agent 会话集成为后续迭代候选

## Evidence on Hand

真实项目名（~/AgentWorks/CodeSpace/）：agent-pact、alljobs（本项目）、codesk、design、diskwatch、eastern-astrology-mvp、mathmagics-mvp、pactify-apps、petcare-app、tradelinks——mockup 与种子数据使用真实项目名；其状态/优先级/下一步为占位样例，待 Joey 校正后成为真实数据。无营销素材与第三方证言（也不需要）。

## Product Principles

1. 一眼定今天：总览页 30 秒内回答「什么卡住了、今天推进什么」。
2. 写入零摩擦：任何 agent/人改一个 md 文件就算完成记录；工作台绝不要求专用写入通道。
3. 文件即真相：渲染永远忠于 data/ 文件；解析失败要指出文件与原因，不静默吞掉。
4. 查看不打扰：信息密度优先于装饰；动效只服务状态理解。
5. 单人产品：不为假想的协作/多租户加复杂度。

## Accessibility & Inclusion

单用户产品但坚持基线：键盘可达、语义化结构、正文对比度 ≥4.5:1（大字号 ≥3:1）、状态不只靠颜色传达、prefers-reduced-motion 降级。
