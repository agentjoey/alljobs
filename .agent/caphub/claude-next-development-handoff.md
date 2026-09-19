# Claude handoff — Caphub current-state orientation

> 2026-09-19: this orientation was completed. Its findings produced the documentation reconciliation on branch `codex/caphub-doc-truth`. The next step is the Caphub re-design (Notion AJ-001), not P5.

Copy the prompt below into a new Claude Code session.

---

请先完整理解 AllJobs / Caphub 的现状。本次不是开发任务，不启动 P5，也不直接修改代码或文档。

仓库：`/Users/xtation/AgentWorks/GPT_Workspace/alljobs`

`.worktrees/caphub-release` 是生产工作目录（app build 与 worker 源码都从这里运行），**不得**在其中 pull、checkout、安装依赖或 build。只读检查请使用独立的只读视图，例如：

`git -C /Users/xtation/AgentWorks/GPT_Workspace/alljobs fetch origin main` 后，用 `git show origin/main:<path>` 读取文件；或由 Human 授权后新建一个 detached 只读 worktree。

开始时：

1. 读取并遵守仓库 `AGENTS.md`。
2. 读取 `origin/main` 上的 `.agent/CURRENT.md`，以顶部 “Current state” 小节为唯一当前状态权威。
3. 不要修改主 checkout；其中存在 Human-owned dirty/untracked 文件。
4. 不创建 branch/worktree，不提交或推送，不修改 Linear，不调用真实 provider，不修改生产配置或服务。

重点阅读：

- `.agent/CURRENT.md`
- `.agent/caphub/automatic-analysis-handoff.md`
- `.agent/caphub/automatic-analysis-verification.md`
- `docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`
- `docs/superpowers/plans/2026-09-14-caphub-kebab-roadmap.md`
- `docs/superpowers/specs/2026-09-16-caphub-review-registry-design.md`
- `docs/superpowers/specs/2026-09-16-caphub-obsidian-package-export-design.md`
- `docs/superpowers/specs/2026-09-18-caphub-automatic-analysis-workbench-design.md`
- `docs/superpowers/plans/2026-09-18-caphub-automatic-analysis-workbench.md`
- `docs/operations.md`
- `docs/deployment.md`

当前已知事实：

- Planning Core V1 和 Caphub P1–P4 已进入生产。
- Neon PostgreSQL Registry 和 private Object Storage 已启用。
- Capture 上传、同名/同内容去重、同名/不同内容人工确认、持久化单并发分析 worker、MiniMax + DeepSeek V4、Caphub Review 和成功导入后 30 天原图清理已运行。
- Obsidian Vault `Caphub` 已配置，但不要读取或写入 Vault 内容。
- 生产应用代码 SHA 为 `766f8504b703dea86d0bd487aa607941a917aa79`；后续 main 包含测试和文档整理提交。
- 最近完整验证为 196 Vitest files / 1653 tests PASS；typecheck PASS；lint 0 errors、79 个既有 warnings。
- P5.1 spec 已批准并保留，但当前明确暂缓 development plan 和 implementation。P5.2 与 P6 同样暂缓。

你的任务只是形成清晰、基于证据的项目理解。请进行只读代码与文档检查，并在对话中输出一份简洁报告，包含：

1. 当前产品能力地图：用户从 Capture 到 Analysis、Review、Registry、Package preview、retention 的真实路径。
2. 当前运行架构：Next.js、LaunchAgents、Neon Registry/Object Storage、模型 provider、Obsidian 边界及主要数据流。
3. 当前状态矩阵：已上线、已实现但默认关闭、仅有设计、已废弃/历史记录、尚未开始。
4. 证据与风险：测试、生产 canary、性能、已知限制、配置依赖、运维恢复点。
5. 文档一致性审计：指出 CURRENT、roadmap、spec、plan、handoff 中重复、过期或互相矛盾的内容；引用具体文件和段落，不立即修改。
6. 已有系统优化清单：只针对当前已搭建内容，按 P0/P1/P2 排序，并区分产品体验、性能、可靠性、运维、文档和可维护性。
7. 推荐下一步：选择一个最小、可验证的整理或优化批次，说明理由、范围、验收方式和需要的授权；不要开始实施。

要求：

- 区分事实、推断和建议；不要把历史状态当成当前状态。
- 优先使用当前代码、配置 schema、最新 evidence 和运行文档，不能只依赖 `.agent/CURRENT.md` 的历史段落。
- 控制检查范围，不运行全量测试、build、浏览器 E2E 或真实外部调用；只有在确认事实所必需时运行 focused read-only checks。
- 不重新规划 P5/P6，不提出自动 builder、Runtime Router 或新 capability 开发。
- 不执行任何修复。最终等待 Human 选择优化批次后，再进入后续设计或开发。

---
