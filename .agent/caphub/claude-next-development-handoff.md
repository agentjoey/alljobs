# Claude handoff — Caphub P5.1

Copy the prompt below into a new Claude Code session.

---

继续 AllJobs / Caphub 开发。

仓库：`/Users/xtation/AgentWorks/GPT_Workspace/alljobs`

开始前必须：

1. 读取并遵守仓库 `AGENTS.md`，执行 session startup。
2. 不修改主 checkout 的任何 Human-owned dirty/untracked 文件；从最新 `origin/main` 创建新的隔离 worktree 和 `claude/` 前缀分支。
3. 读取：
   - `.agent/CURRENT.md`
   - `docs/superpowers/specs/2026-09-17-caphub-manual-implementation-handoff-design.md`
   - `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`
   - `.agent/caphub/automatic-analysis-verification.md`
   - `.agent/caphub/automatic-analysis-handoff.md`

当前事实：

- P1–P4、Neon Registry/Object Storage、自动分析 worker、MiniMax + DeepSeek V4、Caphub Review、同名去重/冲突确认和 30 天原图清理已在 production 运行。
- 生产应用代码 SHA：`766f8504b703dea86d0bd487aa607941a917aa79`。
- 最近完整门禁：196 Vitest files / 1653 tests PASS。
- P5.1 spec 已批准并进入 main，但尚无 executable development plan，也未开始实现。

本次目标：先为 P5.1 编写独立、可执行的 development plan，再按计划连续实现 P5.1。不要重新设计已批准的 spec；只有发现实质冲突时才暂停。

P5.1 边界必须保持：

- 目标覆盖所有已在 AllJobs 注册、`work_modes` 包含 `implementation` 的本地 Git code project。
- Caphub 只创建/管理 BuildProposal、ImplementationHandoff、ImplementationEvidenceBundle、ImplementationAsset 和 implementation review lineage。
- 外部 evidence 一律不可信；commit、base ancestry、changed paths、diff/blob digests 必须由服务端从已注册仓库的 Git object 只读重算。
- Caphub 不创建或切换目标仓库 branch/worktree，不运行 Shell/测试命令，不修改目标仓库，不 fetch/clone/checkout/merge/rebase/push/tag，不 deploy/publish/install/enable。
- `caphub.implementation.enabled=false` 为默认值；生产迁移、配置启用、真实目标仓库 evidence 导入、push/merge/deploy 均是单独 hard stop。
- P5.2 builder、自动 Agent 执行与 P6 Runtime Router/evals/update watcher 不在本次范围。

执行要求：

- development plan 放在 `docs/superpowers/plans/`，明确任务顺序、文件范围、RED→GREEN、真实 Git 边界 BDD、migration、rollback、UI/API/CLI、性能与验收证据。
- 功能与缺陷使用 TDD；跨 PostgreSQL、Git object、Next route 和目标仓库只读边界使用 BDD。
- 前端不使用已退役的 frontend-design-workflow；遵循现有 Paper Workbench，完成最终 build 的 1440/390 浏览器验证与截图。
- 控制 review 范围：在完整 P5.1 changeset 上做一次独立 Review/Verification；修复后只复核 findings 和受影响边界，不重复全局审查。
- 每个可验证批次运行 focused checks；最终只运行一次完整 typecheck、lint、test、build、deploy invariant 和必要 E2E。
- 更新 `.agent/CURRENT.md`、Caphub roadmap、证据/handoff 和 Linear。创建范围清晰的本地 commits。
- 不要因为普通 task 边界停下来；只在需要凭证/生产副作用、破坏性操作、push/PR/main merge、scope 扩张、实质 spec 冲突或无法解决的阻塞失败时暂停。

完成时报告：worktree/branch、base/final SHA、任务结果、测试/Review/Verification、截图、Linear 状态、未执行的生产动作、剩余 hard gates 和下一安全动作。

---
