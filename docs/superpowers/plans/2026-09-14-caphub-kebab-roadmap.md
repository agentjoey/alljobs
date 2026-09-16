# Caphub（kebab）实施主路线图

- 状态：P1-C 已批准；P1 已验收；P2-A 部分通过，等待 Kimi direct-HTTP structured-output probe
- 日期：2026-09-14
- Canonical spec：`docs/superpowers/specs/2026-09-13-caphub-kebab-design.md`
- 开发 checkout：`/Users/xtation/AgentWorks/GPT_Workspace/alljobs`
- Git remote：继续使用 `https://github.com/agentjoey/alljobs.git`，禁止迁移或替换

## Scope check

已批准设计包含七个可独立拒绝或批准的子系统：现有 Backlog 产品退役、Capture foundation、模型/provider 与分析流水线、审批/Registry、Obsidian/导出、自研移交、Runtime/eval/update。它们不能放进一个执行计划。每个阶段必须拥有独立详细计划、测试闭环、review/verification 证据、Human Gate 和回滚点；P0 与 P1 的详细计划随本路线图提供，P2–P6 只能在各自前置条件满足后另写计划。

## 全局不可变约束

- 第一期所有发布、更新和自研投入均须人工审批。
- MiniMax 在 Worker 与工具注册层 hard deny 代码实现、文件写入、Shell、Git、安装、部署和发布。
- Kimi Research 只读；只有批准后的 Kimi Code，或 Human 手工移交 Claude/Codex，能够实现代码。
- Kimi provider 后续同时支持 API key 与本地 OAuth/login，业务接口和状态不依赖认证模式。
- PostgreSQL 是最终 Registry 事实来源；Obsidian 仅是可重建投影视图。
- 不迁移 Linear 数据，不删除现有 Backlog 文档，不改变 Git remote，不自动 merge 或 production deploy。
- 所有来源内容按不可信数据处理；Schema 校验、幂等、审计、权限拒绝和可恢复失败是阶段验收的一部分。
- 新增页面/路由、审批、敏感数据或破坏性操作仍须绑定 approved Brief、rendered mockup（适用时）、独立 Review/Verification、Human walkthrough 和明确 release gate。Human Owner 已于 2026-09-16 取消 `FRONTEND-DESIGN-WORKFLOW.md` 对 Caphub Task 7+ 的约束；这不取消上述证据与安全门禁。

## 阶段关系

```text
P0 Backlog retirement
  -> P1 Foundation + Web Capture vertical slice
      -> P2 Providers + analysis
          -> P3 Review + PostgreSQL Registry
              -> P4 Obsidian + export
              -> P5 Self-development handoff
                  -> P6 Runtime router + evals + update watcher
```

P4 与 P5 在 P3 后可分别规划，但不得并发修改同一 Registry contract；如需并发，必须使用不同 worktree 和明确文件所有权。

## P0：AllJobs Backlog 管理退役与壳层稳定化

**目标**

移除已经转移到 Linear 的 Backlog 主动管理 surface，包括 R1 排序 writer、copy-only Backlog proposal、assistant `draft_backlog` 入口及其 UI/action/test/当前运维文档，同时保持 AllJobs 的 roadmap/current planning 只读证据、Task、assistant 问答、monitoring 和 Control Host 安全边界稳定。

**依赖**

- 已完成当前依赖审计。
- Human Owner 确认 Linear 是新的 Backlog 管理入口，但本阶段不做数据迁移。
- 执行前工作区无与计划文件重叠的 Human 改动，或 Human 明确给出处理方式。

**产物**

- 无 Backlog 管理 action、writer、ordering UI、proposal UI 或 assistant Backlog draft。
- Project detail/search/shell 不再提供 Backlog 管理入口。
- 保留 Backlog schema/parser/projection/relations/context read path 和现有 Backlog 文件。
- 更新现行 architecture/operations/product UI 文案，历史 R1 evidence 保持不可变。
- focused tests、full Vitest、typecheck、lint、build、E2E 与部署 invariant 证据。

**人工门禁**

- Gate P0-A：Human 批准详细删除清单和保留清单。
- Gate P0-B：独立 Review 验证没有删除 shared planning/assistant/monitoring。
- Gate P0-C：Human 对最终 build 走查并批准发布；发布前不重启服务。

**验收条件**

- UI、Server Action、API/assistant intent 均不能创建、排序、提议或应用 Backlog 变更。
- `docs/BACKLOG.md`、`.agent/BACKLOG.md`、外部 projection bytes 未改变。
- roadmap、Task、project registry、assistant ask/task draft、monitoring 页面和 refresh contracts 继续通过。
- `git remote -v` 与基线一致；Human-owned dirty files 未被 stage 或修改。

**明确非目标**

- 不迁移 Linear 数据；不删除 Backlog 文档、只读 parser 或 projection。
- 不实现 Caphub；不引入 PostgreSQL；不改 deploy/remote。

**详细计划**

`docs/superpowers/plans/2026-09-14-alljobs-backlog-retirement.md`

## P1：Foundation 与单条 Capture vertical slice

**目标**

在不接模型、不建 review UI、不部署生产的条件下，建立 Caphub 模块壳、versioned schema、storage ports、本地原子 adapters，并完成一条由 `/caphub` 提交 multipart screenshot、经 `POST /api/caphub/captures` 写入不可变证据、再由 metadata-only GET 查询 `received` 状态的纵向链路。

**依赖**

- P0 已通过独立验证，壳层稳定。
- Human 批准 P1 exact scope、filesystem storage 临时边界、请求大小和 origin/auth 策略。
- Human Gate P1-A 已批准 Brief revision 1 与 rendered mockup；`/caphub` 可见 UI、真实边界 E2E、最终截图和独立验证均已完成。Task 7+ 不再以已取消的 frontend workflow 文件为执行权威。

**产物**

- `lib/caphub/domain/` 的 Capture、object reference 与 audit schema。
- `lib/caphub/storage/contracts.ts` 的 `CaptureStore`、`CaptureObjectStore` 与 `CaptureAuditLog` ports。
- `lib/caphub/storage/` 的原子、内容寻址、幂等本地 adapters。
- `lib/caphub/service/capture.ts`、`/caphub` UI 与 `app/api/caphub/captures/` POST/GET routes。
- `GET /api/caphub/captures/[captureId]` 状态查询。
- focused unit/integration/route tests 和明确的 PostgreSQL 迁移 contract。

**人工门禁**

- Gate P1-A：已通过。Human 批准 API contract、保存路径、保留策略、Web caller 边界、Brief revision 1 与 rendered mockup。
- Gate P1-B：已通过。独立 Security/Review 验证 traversal、symlink、oversize、invalid URL、idempotency conflict、partial-write/audit recovery 和 redaction；首次审查发现的配置加载前置 symlink 写入已由 `058c381` 修复并通过定向复审。
- Gate P1-C：已通过。Human Owner 于 2026-09-16 明确批准 P1-C，接受 P1 并允许进入 P2 规划。P1 未生产发布；该批准不授权配置启用、服务重启、部署、真实 provider 调用、push、merge、tag 或 release。

**验收条件**

- 在单一 active writer 且 matching idempotency index 已 durable 的边界内，相同 key + 相同 canonical payload 返回同一 Capture；不同 payload 返回 `409 IDEMPOTENCY_CONFLICT`。
- 原始 payload/attachment metadata 可追溯，object bytes 由 SHA-256 内容寻址且不覆盖。
- P1 Capture 固定停止在 `received`，并始终带 `human_review_required: true`；没有 approve/publish/build/model side effect。
- 无 token/secret/原始附件 bytes 进入 audit log。审计失败后的 durable Capture 可由同 key/payload 重试修复；索引落盘前或不受支持的多进程写入产生的 orphan/unindexed evidence 必须 safe-off、保留并升级处理，不得手工编辑或删除。
- API 的 `400`、`403`、`409`、`411`、`413`、`415` 与 bounded `500/503` 路径都有测试。

**明确非目标**

- 不接 Telegram、MiniMax、Kimi、Obsidian、PostgreSQL、agent runtime。
- 不创建 Review Console 页面，不自动发布，不生产部署。

**详细计划**

`docs/superpowers/plans/2026-09-14-caphub-foundation.md`

## P2：MiniMax/Kimi providers 与分析流水线

**目标**

实现 deterministic preprocessor、MiniMax Extraction、Kimi entity/claim research、Capability Assessment、条件触发的 MiniMax Critic 和 ReviewPacket composer，所有步骤经 versioned JSON Schema 连接并可恢复。

**依赖**

- P1 Capture/Artifact ports 稳定。
- Human 以只读方式完成 MiniMax M3 图片 structured-output probe。
- Human 分别验证 Kimi API key 与本地 OAuth/login 的可用性；至少批准一种主路径和另一种可替换 contract。
- 独立 threat model 批准 Worker profiles 与外层 sandbox。

**2026-09-16 P2-A evidence：**Human 单独授权限定真实 provider probe。MiniMax M3 synthetic-image + strict JSON probe PASS；Kimi local-login/K3-256K no-tool `stream-json` probe PASS；Human 随后提供 `https://api.kimi.com/coding` 并授权一次 API probe，现有 `KIMI_CODE_API_KEY` 通过文档化 `/v1` 路径完成 Kimi Code CLI in-memory API-key/no-tool `stream-json` probe，PASS。Focused plan review confirmed that this does not prove spec §9.3 canonical server-side direct-HTTP JSON Schema mode；该项仍需新的单独授权 probe，P2-A 保持 PARTIAL。详细 probe 证据见 `.agent/caphub/p2-provider-probes.md`；详细实施计划和 focused review 见 `docs/superpowers/plans/2026-09-16-caphub-providers-analysis.md`、`.agent/caphub/p2-plan-review.md`。

**产物**

- `MiniMaxProvider`、`KimiProvider` ports 与 capability probe。
- Kimi API-key adapter、本地 login adapter、同一上层 request/result contract。
- `ExtractionResult -> ResearchDossier -> CapabilityAssessment -> CriticReview -> ReviewPacket` schemas/jobs。
- MiniMax hard-deny policy tests；Kimi Research read-only tool allowlist tests。
- model call audit（模型、prompt/input version、耗时、用量、结果 digest），不记录 reasoning 或 secrets。

**人工门禁**

- Gate P2-A：真实 provider request 需单独授权；fixture tests 不构成真实调用授权。
- Gate P2-B：Human 批准 source/tool allowlist 与费用/并发预算。
- Gate P2-C：独立权限验证证明 MiniMax 和 Kimi Research 无写入/Shell/Git/deploy 能力。

**验收条件**

- 第一次 schema failure 只允许一次纠错，第二次进入人工队列；无无限重试。
- 身份不明确产生 `IDENTITY_AMBIGUOUS`，不强配实体。
- prompt injection fixtures 不触发任何工具扩权或命令执行。
- 任一失败可从持久 job 节点恢复，且不重复生成 artifact/audit side effect。

**明确非目标**

- 不做审批 UI、正式 Registry release、Kimi Code build、Obsidian、自动部署。

## P3：Review Center 与 PostgreSQL Registry

**目标**

把 PostgreSQL 建成 Capture、Entity、Claim、Candidate、ExperienceCard、BuildProposal、Release、Deployment、UsageObservation、审批与审计的正式事实来源，并提供统一人工 Review Center。

**依赖**

- P2 ReviewPacket contract 稳定。
- Human 选择 PostgreSQL provider、Secret 管理、备份/PITR、迁移和费用边界。
- T3 Brief、完整状态矩阵、approved rendered mockup 与独立 pre-implementation review。

**产物**

- PostgreSQL schema/migrations、transactional repository adapter、filesystem-to-PostgreSQL contract verification（不迁移 Linear）。
- ReviewDecision append-only audit、optimistic concurrency/idempotency、Reject 永久保留。
- `/reviews`、`/captures/:id`、`/capabilities/:id` 的 approved UI scope。
- WAITING_FOR_REVIEW workflow suspend/resume；未经审批不得产生 Release/Build handoff。

**人工门禁**

- Gate P3-A：数据库与 migration plan 批准。
- Gate P3-B：每类审批的权限、Diff、确认文案、撤销/拒绝语义批准。
- Gate P3-C：独立 data-integrity/security/UI verification 与 Human walkthrough。
- Gate P3-D：生产 migration/release 单独批准。

**验收条件**

- Registry 可回答从任一 Release 回溯 Capture/Evidence/Decision 的 lineage 查询。
- 并发或重复审批不产生双发布；stale decision 被拒绝。
- Reject 不被删除，审计记录 append-only。
- filesystem adapter 可关闭且 contract suite 在 PostgreSQL adapter 上通过。

**明确非目标**

- 不做 Obsidian 双向同步、平台发布、Kimi Code 实现、动态装配。

## P4：Obsidian 投影与 Capability Package 导出

**目标**

从 Registry 生成可重建的 Obsidian 单向投影和平台无关 Capability Package，并通过 Codex/Claude/Hermes adapters 生成待审 Diff，而非直接写入正式环境。

**依赖**

- P3 Registry/version/approval 稳定。
- Human 确认 Vault 绝对路径、备份策略、人工区域 markers、Package Git 边界。
- 各目标平台 adapter contract 和 license review 获批。

**产物**

- Registry -> Obsidian projector，保留人工区域且生成 manifest/digest。
- neutral Capability Package schema 与 versioned Git representation。
- Codex/Claude/Hermes preview adapters；发布前只生成 Diff/ReviewPacket。
- Deployment version pointer 与 rollback record。

**人工门禁**

- Gate P4-A：Human 批准 Vault path 与首次 dry-run Diff。
- Gate P4-B：每个 target adapter 单独批准。
- Gate P4-C：每个 Release 的 publish 和 rollback 均单独批准。

**验收条件**

- 删除并重建系统管理区得到相同内容 digest；人工区域保持不变。
- 未批准 Release 无法写正式 Agent 目录。
- 平台产物可从 neutral package 重建，Registry 仍是事实来源。

**明确非目标**

- 不做 Obsidian 双向实时同步、不自动安装依赖或启用工具、不自动发布。

## P5：自研能力人工移交闭环

**目标**

实现 `BuildProposal -> Human approval -> ImplementationHandoff -> isolated worktree -> verification -> ImplementationAsset -> Human release approval`，支持批准后的 Kimi Code 与 Human 手工 Claude/Codex 两条路径。

**依赖**

- P3 Registry approval/audit、P4 package/release contract 稳定。
- Human 批准 builder sandbox、仓库 allowlist、命令 policy、资源预算和交付边界。

**产物**

- BuildProposal scope/digest/status contract。
- Kimi Code builder profile 与 manual handoff packet。
- 隔离 worktree/branch runner、exact-file diff/test evidence、ImplementationAsset registration。
- merge/deploy/publish 三个独立 Human gates。

**人工门禁**

- Gate P5-A：研究处置方向批准。
- Gate P5-B：`APPROVED_FOR_IMPLEMENTATION` 与范围批准。
- Gate P5-C：实现 diff/测试/独立 review 批准。
- Gate P5-D：merge、production deploy、Capability release 分别批准。

**验收条件**

- 未批准 BuildProposal 无法启动 builder。
- Builder 不能自动合并默认分支、部署或发布。
- 每个 ImplementationAsset 绑定 exact commit/diff、测试、review 和审批记录。
- manual handoff 不依赖浏览器自动化。

**明确非目标**

- 不实现自由 Agent swarm，不让 MiniMax 写代码，不自动 merge/deploy/publish。

## P6：Runtime Router、Evals 与 Update Watcher

**目标**

实现少量常驻 + 按需装配的 Capability Router、Execution Bundle、使用反馈、六层评测、黄金数据集，以及 WatchSource/UpstreamChange/UpdateProposal 的持续运营闭环。

**依赖**

- P3 lifecycle/Registry、P4 package/deployment、P5 ImplementationAsset 稳定。
- 至少 30 个 Human-reviewed 黄金截图集和明确的数据保留/隐私规则。
- Human 批准自动 watcher 来源、频率、预算与所有 UpdateProposal gate。

**产物**

- Registry read API/MCP：`search_capabilities`、`get_capability`、`build_execution_bundle`、`get_bundle_resource`。
- append-only feedback API：`report_capability_usage`、`report_capability_issue`、`suggest_capability_update`。
- Execution Bundle manifest/policies/references/tools/evaluation。
- schema/retrieval/workflow/task/safety/regression 六层 eval。
- WatchSource、freshness policy、Impact Analyzer、UpdateProposal。

**人工门禁**

- Gate P6-A：Router selection/exclusive-group/security policy 批准。
- Gate P6-B：黄金集、judge independence、费用/隐私预算批准。
- Gate P6-C：每个影响正式能力的 UpdateProposal 和发布批准。

**验收条件**

- Bundle 遵循固定优先级与预算，只加载当前任务相关、权限匹配且未暂停的能力，并输出选择理由。
- 同一 Kimi 会话不评价自身结果；Baseline/Treatment 结果可复算。
- 价格、API、模型、安装、安全 Claim 有 `last_verified_at`/`review_after`。
- updater 只提出 Diff，不自动改变正式 Deployment。
- 生命周期可安全降级、暂停、弃用和切换版本，历史不删除。

**明确非目标**

- 不训练/微调模型，不建立推理集群，不允许任意工具自动安装，不形成自由协商 swarm。

## 路线图完成定义

Caphub MVP 只有在 P0–P5 均通过各自 Human release gate，且设计文档第 22 节验收条件全部具备运行证据时才可宣称完成。P6 是持续运营能力；其首个受控 release 通过后进入持续迭代，但任何 UpdateProposal 仍保留人工审批。阶段文档、代码、测试、build、截图、review 和 production smoke 必须绑定同一 exact commit/build。
