# Task Capsule: Full Code & UI/UX Review (2026-08-28)

Workflow: 3.3
Task: 全量 code review（架构/代码质量）+ 按 FRONTEND-DESIGN-WORKFLOW v3.3 的 UI/UX review，修复发现的 bug 与不合理设计/文案
Role: Primary Agent (Kimi Code)
Tier / 理由: T2 —— 分级有歧义取 T2。预期修复为现有 surface 的缺陷与逻辑优化（T1 级），但修复范围未定、可能触及交互与多文件，按 §3 歧义规则取 T2。无新路由、无 T3 触发器；若发现需新页面/破坏性操作再升级。
Canonical record: 本文件
Branch / worktree: main（单 agent 顺序执行，无并发）
Mockup Gate: Conditional —— 逻辑/缺陷修复复用已批准模式可跳过；若涉及布局/信息层级实质变更则创建
Review path: 修复后由独立会话 review；Human Owner 最终确认
Human checkpoints: 修复清单确认后实施；涉及设计方向变更时暂停上报

## Status matrix（修复时按适用覆盖）
loading / empty / error / success / validation / disabled —— 按各组件实际状态逐一核对

## Baseline
- Base commit: 2681dc8 (main)
- v1.0.0 已上线生产（127.0.0.1:3456 + Cloudflare Tunnel）

## Results (2026-08-28)
- Final commit: fbe7f46（51 files, +2054/-374）
- 修复：3 Critical（静态预渲染永久陈旧、cacheDir 未接线、/archived 死页+restore 必败）、全部 High（CRLF 数据损坏、锁契约/死锁、business 文件写错根、git_remote 无回退、⌘K/状态条造假、logo 黑块、skip-link、移动端溢出）、及可修的 Medium/Low（注入防护、patch 白名单、错误泄漏、revalidate 覆盖、a11y 语义、reduced-motion、文案空态等）
- 验证：typecheck ✓ / lint 0 error / Vitest 82 ✓（新增 lock、render、CRLF、回退等用例）/ Playwright 6 ✓ / 最终 build 截图 `/tmp/alljobs-final/`（desktop+mobile 全路由）
- 发布：build 后 launchctl kickstart 重启 `com.agentjoey.alljobs` 与 `com.agentjoey.alljobs-refresh`；生产 4 路由 200，/projects 实时渲染，refresh worker 首轮 fresh（H5 回退生效）
- Mockup Gate: Skipped —— 全部修复复用已批准的 Paper Workbench 模式，无新布局/信息层级变更
- Human decisions: 用户批准"提交一个 commit"与"立即发布"（2026-08-28）
- 遗留：移动端 nav "Archived" 裁剪为 "A"（可横向滚动，Low）；apply 侧 clone 未加 trusted_path 回退（inspect 已拦非法 remote）；⌘K 搜索交互未做浏览器实测
- Next safe action: Human Owner 走查 /archived restore 流程与 ⌘K 搜索；git push 待用户决定
