# Caphub（kebab）实施主路线图

- 状态：P1 已验收；P2-C fixture 实现已完成；P2-A live structured output 仍未证明；P3 已合并并以 safe-off 配置部署，Capture-only 试用已获单独授权；P3 Registry/Analysis 生产启用仍停在 Gate P3-D；P4 implementation 已完成并交由 Codex 独立验收（P4-A/P4-B/P4-C Human gates 未动）
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

**2026-09-16 P2-A evidence：**Human 单独授权限定真实 provider probe。MiniMax M3 synthetic-image + strict JSON probe PASS；Kimi local-login/K3-256K no-tool `stream-json` probe PASS；Human 随后提供 `https://api.kimi.com/coding` 并授权一次 API probe，现有 `KIMI_CODE_API_KEY` 通过文档化 `/v1` 路径完成 Kimi Code CLI in-memory API-key/no-tool `stream-json` probe，PASS。Focused plan review confirmed that this did not prove spec §9.3 canonical server-side direct-HTTP JSON Schema mode。Human 再次授权唯一一次 direct-HTTP probe，并指定 Caphub API model 为 `k3-256k`；请求一次到达 `/coding/v1/chat/completions`，返回 `HTTP 200`，但以 `AI_NoOutputGeneratedError` 结束，未产生 schema-valid final object，且未重试。因此 endpoint/auth/model acceptance PASS，structured-output compatibility FAIL / NOT PROVEN，P2-A 保持 PARTIAL。详细 probe 证据见 `.agent/caphub/p2-provider-probes.md`；详细实施计划和 focused review 见 `docs/superpowers/plans/2026-09-16-caphub-providers-analysis.md`、`.agent/caphub/p2-plan-review.md`。

**2026-09-16 P2 Task 1 evidence：**配置与预算边界已在 `e6fe123c163e8d227017dca6e71e4cec7534d559` 完成；analysis 默认关闭、并发固定为 1、provider endpoint/model 固定、secret 仅保存环境变量名、source origin 精确限制、预算只能向下收紧。RED→GREEN 为 2 focused files / 37 tests；typecheck PASS；focused lint 0 errors。

**2026-09-16 P2 Task 2 evidence：**版本化 analysis/workflow schemas 与 canonical digest 已在 `de76318` 完成。覆盖所有阶段、A/B 身份证据、歧义状态、0–5 独立维度、引用完整性、review-only packet、terminal job/audit unions 与 content-addressed artifact。RED→GREEN 为 2 focused files / 14 tests；typecheck 与 focused lint PASS。

**2026-09-16 P2 Task 3 evidence：**确定性预处理已在 `79d6dbf` 完成；覆盖 EXIF、质量/OCR 可用性、区域、真实 ZXing QR、英/简中本地 Tesseract、指标/命令证据、byte/pixel/deadline 限额、exact/perceptual dedupe 与 review-only 隐私建议。RED→GREEN 回归为 5 files / 26 tests；typecheck 与 focused lint PASS。只读 production audit 同时发现既有 Next/shadcn/gray-matter/ESLint 依赖链 advisories；新加的 5 个 direct media/OCR dependencies 不在 advisory chain 中，生产启用前仍须单独处理适用的既有 runtime finding。

**2026-09-16 P2 Task 4 evidence：**provider-neutral structured execution 与 redacted audit 已在 `776c126` 完成。每阶段只允许一次初始调用和最多一次 schema 纠错；传输失败零重试；纠错输入只含 validation paths 与原始 input digest；deterministic IDs、输入 byte、共享 8-call、256,000-token 上限均由 fixture 边界覆盖。RED→GREEN 为 2 focused files / 17 tests；typecheck 与 focused lint PASS。

**2026-09-16 P2 Task 5 evidence：**无工具 MiniMax extraction/critic adapter 已在 `2980a7f` 完成。固定官方 endpoint/model 与 server-only key 边界保持不变；图片按 index 生成有序 file parts；prompt/input/schema version 与 strict JSON Schema 入模；hostile source 被转义并封装于单一 untrusted delimiter；`maxRetries: 0`、输出上限、abort signal 与无 tools 字段经 fixture 验证。RED→GREEN 为 4 focused/adjacent files / 12 tests；typecheck 与 focused lint PASS。

**2026-09-16 P2 Task 6 evidence：**双模式 Kimi provider 已在 `f285d3e` 完成，API 模式固定 `https://api.kimi.com/coding/v1` 与 `k3-256k`，local-login 模式具备严格 OAuth 投影、zero-tool agent、真实 macOS Seatbelt、loopback-only fixed-target CONNECT proxy、JSONL/byte/deadline/process-group 边界与清理。真实 fixture 证明保护读取、外写、嵌套执行、直连、malformed/tool、flood/timeout 均 fail closed。RED→GREEN 为 6 focused files / 19 tests；typecheck 与 focused lint PASS；未调用任何真实 provider。

**2026-09-16 P2 Task 7 evidence：**受限 evidence source gateway 与 `ResearchDossier` 已在 `0a1f22c` 完成。严格 HTTPS origin、public-only DNS、连接地址固定与 peer 校验、逐跳重授权、压缩/解压字节上限、MIME/deadline/计数限制和默认禁用 search 均由 fixture 覆盖；hostile source 只作为不可信 evidence 字符串进入模型输入，host 重新构造 evidence 元数据并强制 A/B 身份引用或 `IDENTITY_AMBIGUOUS`。RED→GREEN 为 3 focused files / 21 tests；typecheck 与 focused lint PASS；未发生真实 source 或 provider 请求。

**2026-09-16 P2 Task 8 evidence：**`CapabilityAssessment`、条件 Critic 与 deterministic `ReviewPacket` 已在 `112b066` 完成。Host 强制 assessment/critic citation 闭合、独立维度、ambiguity unresolved question、确定性 alternatives rank 和六类本地 critic trigger；packet 保留不可变 source/stage 引用、截图/OCR/Entities/Claims/Evidence/conflicts/alternatives/dimensions/model contracts，并固定 `human_review_required: true` 与不可执行多平台预览。RED→GREEN 加相邻回归为 4 files / 22 tests；typecheck 与 focused lint PASS；未调用真实 provider。

**2026-09-16 P2 Task 9 evidence：**可恢复 analysis filesystem/state machine 已在 `373bb9a` 完成。严格 job/artifact path、0700/0600、atomic job replacement、immutable content-addressed artifact、deterministic append-only audit、固定阶段顺序、critic skip、每个 artifact 边界后的 restart 与同 job 并发串行化均由真实临时文件系统覆盖；发现 unmatched start 或 terminal-without-artifact 时固定进入 `HUMAN_REVIEW_REQUIRED`，不重复 provider 调用。RED→GREEN 加 P1 storage regression 为 5 files / 33 tests；typecheck 与 focused lint PASS；未使用生产状态或真实 provider。

**2026-09-16 P2 Task 10 evidence：**Capture-to-ReviewPacket 服务与 disabled-by-default local runner 由 `8e85cff`、`4cea8aa`、`87e4360`、`c733c8e` 和 `b705d52` 完成。服务固定执行 preprocess → extraction → research → assessment → critic? → review_packet，命令只接受一个 Capture ID，并以显式 server-only 条件加载固定 Control Host composition。修复轮补齐 OCR deadline abort/worker termination、ResearchDossier Claim 闭包、真实 Kimi API transport/source-policy BDD、真实 Seatbelt/proxy/peer evidence 与 CLI package 入口。最终门禁为 105 files / 1033 tests、typecheck PASS、lint 0 errors / 66 pre-existing warnings、webpack production build PASS；Turbopack 仅因执行沙箱不允许 CSS worker 绑定临时端口而失败。未发生真实 provider/source 请求、配置启用、服务重启、部署、push、merge、tag 或 release。P2-A 的 live structured-output compatibility 仍未证明，继续作为生产启用前的显式边界。

**产物**

- `MiniMaxProvider`、`KimiProvider` ports 与 capability probe。
- Kimi API-key adapter、本地 login adapter、同一上层 request/result contract。
- `ExtractionResult -> ResearchDossier -> CapabilityAssessment -> CriticReview -> ReviewPacket` schemas/jobs。
- MiniMax hard-deny policy tests；Kimi Research read-only tool allowlist tests。
- model call audit（模型、prompt/input version、耗时、用量、结果 digest），不记录 reasoning 或 secrets。

**人工门禁**

- Gate P2-A：**PARTIAL**。限定 probe 证明 endpoint/auth/model，但 live direct-HTTP structured output 未证明；任何后续真实 provider request 仍需单独授权。
- Gate P2-B：**IMPLEMENTATION BOUNDS ACCEPTED**。standing authorization 覆盖 threat-model 中的 fixture-only source/tool allowlist 与预算；live source origin、费用和生产流量仍未授权。
- Gate P2-C：**PASS（2026-09-16）**。聚焦独立 Review/Verification 证明 MiniMax/Kimi Research 无写入、Shell、Git 或 deploy 能力；全部 medium finding 已修复并通过单次 scoped re-review。

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

**2026-09-16 P3-C evidence：**P3 disabled-by-default 实现已在 `19b7ce1` 至 `750efe3` 完成，keyset 行为证据在 `bf734a5` 加强。PostgreSQL 17.11 临时 sentinel-owned cluster 验证 checksum migration、least-privilege app role、append-only triggers、不可变版本/lineage、filesystem/PostgreSQL adapter parity、ReviewPacket import、serializable exact-version decision、永久 Reject、unconsumed-only revoke、consumption、stale/concurrent/idempotency recovery，以及 `/reviews`、`/captures/[id]`、`/capabilities/[id]` 的 safe DTO 和最终 build UI。阶段门禁为 123 files / 1125 tests、typecheck PASS、lint 0 errors / 66 pre-existing warnings、webpack build PASS、P3 E2E 5/5；后续局部修复只复跑直接受影响的 3 files / 20 tests、2 条 browser 场景、real-PostgreSQL keyset 2 files / 7 tests 与最终截图 1/1。独立 Review/Verification 最终为 PASS，zero blocker/high/medium。详细证据见 `.agent/caphub/p3-verification.md` 和 `.agent/frontend-design/caphub-review-registry/final-verification.md`。

P3-C 只表示本地 implementation/fixture 通过，不表示 Gate P3-D 或生产 release 通过。没有选择或使用生产 PostgreSQL/provider/secret，没有启用配置、执行生产 migration、重启、部署、切流、push、PR、merge、tag 或 release。P3-D 仍是 hard stop。

**验收条件**

- Registry 可回答从任一 Release 回溯 Capture/Evidence/Decision 的 lineage 查询。
- 并发或重复审批不产生双发布；stale decision 被拒绝。
- Reject 不被删除，审计记录 append-only。
- filesystem adapter 可关闭且 contract suite 在 PostgreSQL adapter 上通过。

**明确非目标**

- 不做 Obsidian 双向同步、平台发布、Kimi Code 实现、动态装配。

## P4：Obsidian 投影与 Capability Package 导出

**规划状态（2026-09-16）**

- 实现规范：`docs/superpowers/specs/2026-09-16-caphub-obsidian-package-export-design.md`
- 开发计划：`docs/superpowers/plans/2026-09-16-caphub-obsidian-package-export.md`
- KimiCode 交接：`.agent/caphub/p4-kimicode-handoff.md`
- 实现负责人：KimiCode（`k3-256k`）；实现完成后由 Codex 独立验收。
- 当前仅完成规划，不代表 P4 implementation、P4-A、P4-B 或 P4-C 通过。真实 Vault/Agent root、dry-run、publish 与 rollback 仍须对应 Human Gate。

**2026-09-17 implementation evidence（KimiCode，base 4b373dd）：**P4 已在 `codex/caphub-p4-implementation` 完成实现，提交链 8261209 → docs closeout（逐任务窄提交）。最终门禁：150 files / 1335 tests PASS、typecheck PASS、lint 0 errors、production build PASS、deploy invariants PASS、P4 focused E2E 8/8（fixture PostgreSQL + sentinel-owned 临时根）。独立 Review/Verification 记录见 `.agent/caphub/p4-review.md`、`p4-verification.md`；截屏在 `.agent/caphub/p4-screenshots/`。未发生 push/merge/deploy/release/provider 调用/真实 root 配置。当前为 **ready for independent Codex acceptance**；Codex 验收通过前不得提议任何 Human gate。

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
