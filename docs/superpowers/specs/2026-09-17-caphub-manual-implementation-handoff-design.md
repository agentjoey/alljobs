# Caphub P5.1：人工实现移交与 ImplementationAsset 设计

- 状态：已确认设计
- 日期：2026-09-17
- 阶段：P5.1 Manual Implementation Handoff
- 上游设计：[Caphub 总体设计](./2026-09-13-caphub-kebab-design.md)
- 路线图：[Caphub 分阶段路线图](../plans/2026-09-14-caphub-kebab-roadmap.md)
- 前置能力：P3 Review/Registry、P4 neutral package/export contract
- 默认配置：`caphub.implementation.enabled=false`

## 1. 摘要

P5.1 为需要自研实现的 `CapabilityCandidate` 建立一条受控、可审计、人工驱动的交付路径：

```text
Candidate(build)
  -> BuildProposal
  -> Human approval
  -> ImplementationHandoff
  -> external Human / Kimi Code / Claude Code / Codex implementation
  -> ImplementationEvidenceBundle
  -> server-side read-only Git revalidation
  -> ImplementationAsset
  -> Human implementation review
```

P5.1 是交付控制面，不是自动编码系统。Caphub 负责约束范围、生成确定性移交材料、导入证据、重新验证 Git 事实并登记 `ImplementationAsset`；实际实现由 Caphub 外部的人类或 Agent 完成。

本阶段不创建 worktree、不启动 Agent、不运行实现命令、不修改目标仓库、不合并、不部署、不发布，也不安装任何能力。自动 Kimi Code builder、隔离 worktree runner 和命令 policy 属于后续 P5.2，必须另行设计和批准。

## 2. 交付顺序调整

本设计被固化后，近期执行优先级调整为：

1. 暂不实现 P5.1。
2. 单独设计并审批 P1–P4 的 production 激活方案。
3. 先让现有 Caphub 在 production 完成第三方 capability 的识别、审查、Registry 管理和只读导出预览闭环。
4. 在该闭环具备真实运行证据后，再决定何时实现 P5.1。

P1–P4 production 激活的首轮目标不包含：

- 自建 Skill、Plugin、MCP 或其他 Capability。
- `BuildProposal`、`ImplementationHandoff` 或 `ImplementationAsset` 的实际启用。
- 自动安装、发布、部署或写入 Agent 正式目录。
- P5.2 builder、代码执行、Shell、Git 写操作或自动 worktree。
- P6 Runtime Router、自动更新或持续评测。

production 激活是独立设计与执行项目。本文件只规定其顺序和边界，不替代其配置、密钥、数据迁移、回滚、发布和验证计划。

## 3. 目标与非目标

### 3.1 目标

1. 将已批准的 build 方向固化成不可变、可复现的 `BuildProposal`。
2. 只允许 AllJobs 已注册的本地 Git code project 成为实现目标。
3. 生成与 executor 适配但语义一致的确定性人工移交材料。
4. 接收结构化实现证据，并把它始终视为不可信输入。
5. 由服务端对目标仓库的 Git 对象进行只读复核，不信任提交者声明。
6. 只在证据、范围和独立验证全部通过后登记 `ImplementationAsset`。
7. 将 build 批准、implementation 批准、merge、deploy 和 Capability release 保持为独立授权。
8. 保留完整 lineage、digest、审计事件和幂等语义。

### 3.2 非目标

P5.1 不提供：

- 自动 builder 或自由 Agent swarm。
- 由 Caphub 创建、切换或清理 branch/worktree。
- Shell、包管理器、测试 runner、Git 写操作或网络访问。
- 任意本地路径、任意 Git 仓库或远程仓库作为实现目标。
- 自动 fetch、clone、checkout、merge、rebase、push 或 tag。
- 自动部署、发布、安装、启用或更新 Capability。
- 根据 evidence 内的命令、日志或提示词执行任何内容。
- 对 Human-owned dirty/untracked 文件进行修改、暂存、恢复、移动或删除。
- 把 Linear、目标仓库文件或聊天记录作为审批事实来源。

## 4. 核心原则

### 4.1 Registry 是唯一控制面事实来源

`BuildProposal`、`ImplementationHandoff`、`ImplementationAsset`、ReviewRequest、审批消费记录和 lineage 均保存为 Registry 中的不可变记录或追加事件。目标代码仓库只保存实现代码，不要求写入 `.caphub` 控制文件。

Linear 可用于项目状态同步，但不授予权限，也不决定审批状态。

### 4.2 项目 slug 是唯一外部目标标识

API、Web 和 CLI 只接收 AllJobs project slug，不接收绝对路径、相对路径或 Git URL。服务端根据 Registry 中的 project entry 解析可信路径。

### 4.3 外部证据不等于事实

`ImplementationEvidenceBundle` 只表达 executor 的声明。Caphub 必须从已注册仓库的 Git 对象重新计算 commit 关系、变更路径、patch digest 和 blob digest。无法复核时不得生成 `ImplementationAsset`。

### 4.4 工作树状态只读且不参与修改

P5.1 只读取 Git 对象。目标仓库即使存在 Human-owned dirty/untracked 文件，也不得被 Caphub 修改；dirty 状态仅作为展示元数据。只要所需 Git 对象可安全读取，dirty 状态本身不阻断证据验证。

### 4.5 每个授权只消费一次

Build approval 只能生成与其 exact proposal version/digest 对应的 handoff。重复请求必须幂等返回同一 handoff。proposal 的 scope、base commit 或目标项目变化时，必须生成新 proposal version 并重新审批。

### 4.6 接受实现不等于交付上线

`ACCEPT IMPLEMENTATION <short-id>` 只批准 exact `ImplementationAsset`。它不授权 merge、push、deploy、publish、install、enable 或 Capability release。

## 5. 目标项目资格

P5.1 面向所有已经在 AllJobs 注册、且满足以下条件的本地 Git code project：

1. project entry 的 `work_modes` 包含 `implementation`。
2. entry 含有受信任的 `trusted_path`。
3. `trusted_path` 是某个已配置 `trustedCodeRoot` 的直接子目录。
4. 目标是真实目录，不是符号链接。
5. 目标是可读取的本地 Git working tree。
6. Git top-level 与解析后的 `trusted_path` 完全一致。
7. HEAD 可读取。
8. project slug 与 Registry entry 一致，entry digest 未漂移。

以下目标不具备资格：

- 未注册路径或任意用户输入路径。
- 只读 mirror、缓存 projection 或 Caphub 自身的 browse-only Git mirror。
- `work_modes` 不含 `implementation` 的文档、归档或只读项目。
- trusted root 本身、trusted root 的孙级目录或越界路径。
- symlink 目录、无法确认 Git identity 的目录或 bare repository。

## 6. 领域对象

### 6.1 BuildProposalV1

`BuildProposalV1` 固化“为什么要自研、在哪里实现、允许改什么、如何验收”。字段包括：

```text
proposal_id
schema_version
candidate_id
candidate_version
candidate_digest
target_project_slug
project_entry_digest
base_commit
problem_statement
target_outcome
alternatives_gap
scope
non_goals[]
allowed_path_prefixes[]
permissions[]
dependencies[]
license_risks[]
maintenance_risks[]
acceptance_criteria[]
required_checks[]
supported_executors[]
created_at
proposal_digest
```

约束：

- `base_commit` 必须是完整 commit object ID。
- `allowed_path_prefixes` 使用 repo-relative POSIX path prefix；禁止绝对路径、`..` 和空路径。
- `supported_executors` 只允许 `human`、`kimi-code`、`claude-code`、`codex`。
- `proposal_digest` 覆盖所有授权相关字段，不包含展示文案或运行时路径。
- proposal 不保存目标项目的绝对路径。

### 6.2 ImplementationHandoffV1

`ImplementationHandoffV1` 是 exact proposal approval 被消费后的不可变移交记录：

```text
handoff_id
schema_version
proposal_id
proposal_version
proposal_digest
target_project_slug
project_entry_digest
base_commit
allowed_path_prefixes[]
scope
non_goals[]
execution_constraints[]
prohibited_actions[]
required_checks[]
review_requirements[]
verification_requirements[]
evidence_schema_version
rendering_profiles[]
created_at
handoff_digest
```

同一 approved proposal version 只能产生一个 handoff。neutral、Kimi Code、Claude Code 和 Codex rendering 由同一结构化记录确定性生成；适配器不得改变 scope、base、禁止项或验收标准。

### 6.3 ImplementationEvidenceBundleV1

`ImplementationEvidenceBundleV1` 是外部 executor 提交的不可信声明：

```text
schema_version
handoff_id
handoff_digest
executor_type
base_commit
final_commit
source_branch
claimed_changed_paths[]
claimed_diff_digest
test_claims[]
typecheck_claims[]
lint_claims[]
build_claims[]
review_report
independent_verification_report
known_limitations[]
license_notes[]
runtime_notes[]
submitted_at
bundle_digest
```

测试类 claim 仅保存 command label、exit status、started/finished time 和 log digest。bundle 不得包含原始 Shell 输出、secret、绝对路径、环境变量值或未筛选日志。

### 6.4 ImplementationAssetV1

`ImplementationAssetV1` 只在服务端验证成功后生成：

```text
asset_id
schema_version
asset_type
interfaces[]
target_project_slug
project_entry_digest
base_commit
final_commit
source_branch
verified_changed_paths[]
verified_change_summary
verified_diff_digest
verified_blob_digests[]
check_summary
review_summary
verification_summary
runtime_notes[]
license_notes[]
maintainer_notes[]
known_limitations[]
proposal_id
proposal_digest
handoff_id
handoff_digest
evidence_bundle_digest
created_at
asset_digest
```

`ImplementationAsset` 不复制原始日志，也不表示代码已 merge、deploy、publish 或 release。

## 7. 生命周期与状态机

```text
Candidate(build)
  -> BUILD_PROPOSAL_WAITING
  -> APPROVED_FOR_IMPLEMENTATION | REJECTED
  -> HANDOFF_PREPARED
  -> WAITING_FOR_EXTERNAL_IMPLEMENTATION
  -> EVIDENCE_SUBMITTED
  -> EVIDENCE_INVALID | IMPLEMENTATION_REVIEW_WAITING
  -> ACCEPTED | REJECTED | SUPERSEDED
  -> eligible for later Capability Release planning
```

状态规则：

- proposal 的 project、base、scope、allowed paths 或验收标准变化：新 proposal version，重新经过 P5-B。
- 同一 proposal/base/scope 内的实现修订：保留 handoff，提交新的 evidence attempt。
- evidence 验证失败：记录失败审计事件，不创建 `ImplementationAsset`。
- final commit 或服务端重算 diff 变化：形成新的 asset version/digest，之前的 implementation approval 不可复用。
- asset 被接受后仍需 P5-D 对 merge、production deploy 和 Capability release 分别授权。

## 8. Human Gate 映射

### P5-A：build 方向

Human 决定 Candidate 是否进入自研方向。该决定不授权生成 handoff 或开始实现。

### P5-B：proposal 与移交

Human 审阅 exact proposal version/digest、target project、base commit、scope、allowed paths、风险和验收标准。批准后才能生成 handoff。

### P5-C：实现资产

Human 使用以下形式接受 exact asset：

```text
ACCEPT IMPLEMENTATION <short-id>
```

Review Center 必须同时展示完整 asset ID/version/digest、base/final commit、服务端重算 diff、检查摘要、review 与 independent verification。

### P5-D：交付动作

以下决策互相独立，并且不属于 P5.1：

- merge 或默认分支集成；
- push、PR、tag 或 release；
- production deploy 或流量切换；
- Capability release、publish、install 或 enable。

测试和 fixture 最多模拟 P5-C，不得触发实际 P5-D 动作。

## 9. Registry 与数据迁移

### 9.1 Forward-only migration

新增 migration：

```text
lib/caphub/registry/migrations/004_implementation_assets.sql
```

不得修改已执行的 `001`–`003` migration。migration manifest 必须追加 version、文件 digest 和顺序约束。

### 9.2 Record kind 与 ID

新增 record kind：

- `implementation_handoff`，ID prefix `hnd_`
- `implementation_asset`，ID prefix `impl_`

`BuildProposal` 使用既有或在 P5 实施计划中明确新增的 build proposal record kind；实现前必须以当前 Registry schema 为准，禁止假设数据库中已经存在未落地的表或 enum。

### 9.3 Lineage

```text
candidate              --approved_as--> build_proposal
build_proposal         --prepared_as--> implementation_handoff
implementation_handoff --realized_as--> implementation_asset
implementation_asset   --realized_as--> capability_release
```

沿用既有 `build` 和 `implementation` ReviewRequest kind。Build approval 在创建 handoff 时消费；Implementation approval 只在后续 release planning 中作为已接受资产证据，不直接创建 Release。

## 10. 服务边界

建议新增：

```text
lib/caphub/implementation/
  schemas.ts
  digest.ts
  projects.ts
  git-evidence.ts
  proposals.ts
  handoff.ts
  evidence.ts
  assets.ts
  errors.ts
```

职责：

- `schemas.ts`：四类 V1 contract 与严格输入校验。
- `digest.ts`：canonical serialization 与 domain-separated digest。
- `projects.ts`：project slug 到受信任本地 Git project 的只读解析。
- `git-evidence.ts`：受限 Git object reader 与 diff 复算。
- `proposals.ts`：proposal version、状态与 P5-B approval 检查。
- `handoff.ts`：幂等 handoff 创建和确定性 rendering。
- `evidence.ts`：bundle 导入、大小限制、claim 比对和失败审计。
- `assets.ts`：ImplementationAsset 生成、版本化与 P5-C ReviewRequest。
- `errors.ts`：稳定、安全、无路径泄漏的错误码。

Registry 侧建议新增或扩展：

```text
lib/caphub/registry/
  migrations/004_implementation_assets.sql
  migration-manifest.ts
  postgres/implementations.ts
  schemas.ts
  contracts.ts
  queries.ts
```

最终文件边界必须在实施前对照当前代码确认；若当前结构已演进，应保持职责与安全边界，不机械复制路径。

## 11. Git 证据验证

### 11.1 只读解析流程

1. 根据 project slug 读取 Registry project entry。
2. 验证 `implementation` work mode、entry digest 和 trusted root 关系。
3. 使用 `realpath` 语义验证真实目录、非 symlink 和直接子目录边界。
4. 使用受限 Git runner 验证 top-level、HEAD 与 object database。
5. 验证 `base_commit` 与 approved proposal 一致。
6. 验证 `base_commit`、`final_commit` 均存在且为 commit object。
7. 验证 final 是 base 的 descendant。
8. 验证声明的 source branch 包含 final commit。
9. 重新计算 `base..final` 的 change types、paths、patch digest 和 blob digests。
10. 与 bundle claims 比较，并执行 allowed path policy。
11. 通过后生成 ImplementationAsset；否则只记录安全错误与审计事件。

### 11.2 Git runner 限制

Git 子进程必须：

- 使用固定 allowlist 参数，不接受用户拼接的 option。
- 禁止 fetch、clone、pull、push 和任何网络访问。
- 禁止 hooks、pager、textconv、external diff 和 lazy fetch。
- 禁止读取 submodule 内容。
- 使用明确 timeout、输出上限和环境 allowlist。
- 不写 working tree、index、refs、config 或 object database。

### 11.3 证据上限

- evidence JSON：最大 1 MiB。
- changed paths：最多 200 条。
- recomputed patch：最大 5 MiB。
- 测试记录：只保存 command label、exit status、时间和 log digest。
- 超出任一限制：整体失败为 `EVIDENCE_TOO_LARGE`，不截断、不生成 asset。

### 11.4 特殊 Git 对象

- `.git` 或 `.git*` 路径变更：阻断。
- gitlink/submodule 变更：阻断。
- symlink 变更：阻断。
- binary path：只记录 mode、size 与 blob digest；proposal 必须明确允许 binary asset。
- mode-only change：作为独立 change type 展示并纳入 digest。
- 所有外部字符串仅用于校验或显示，不得执行。

## 12. Web、API 与 CLI

### 12.1 Build proposal 页面

建议入口：

```text
/build-proposals/:id
```

页面展示：

- scope、non-goals、target project slug 和 base commit；
- allowed path prefixes、权限、依赖、license 和维护风险；
- acceptance criteria 与 required checks；
- build ReviewRequest、approval 和消费状态；
- handoff ID/digest；
- neutral、Kimi Code、Claude Code、Codex 的复制或下载入口。

“Prepare handoff”只创建 Registry 记录和文本 artifact，不启动 Agent、不创建 worktree。

### 12.2 Evidence import

建议 API：

```text
POST /api/caphub/implementations/import
```

规则：

- 只接收严格 JSON，最大 1 MiB。
- 请求中不接收 repo path。
- 服务端重新解析 registered project 并重新计算 Git evidence。
- 校验失败只创建审计记录，不创建 asset。
- 校验成功创建 ImplementationAsset candidate 和 Implementation ReviewRequest。

### 12.3 Handoff API

建议 API：

```text
POST /api/caphub/build-proposals/:id/handoff
```

该 API 必须验证 exact approved proposal version/digest、approval 未被其他版本消费，并幂等返回同一 handoff。

### 12.4 Review Center

Implementation review 必须展示：

- exact asset ID/version/digest；
- project slug、base/final commit 和 source branch；
- 服务端重算的 changed paths、change types、diff digest；
- tests/typecheck/lint/build 摘要；
- review 与 independent verification；
- scope compliance、安全限制、license 与已知局限。

页面不提供 run builder、merge、deploy、publish 或 install 按钮。

### 12.5 CLI

建议新增：

```text
scripts/caphub-build-handoff.ts
scripts/caphub-import-implementation.ts
```

CLI 只接收 record ID、rendering profile 或 evidence file；不得接收 repo path 或任意 Git command。

## 13. 配置

```text
caphub.implementation.enabled=false
```

默认关闭。关闭时，handoff 创建和 evidence import 均 fail closed；只读历史记录仍可展示。

证据大小、路径数量、patch 大小和 Git 安全限制是代码级安全常量，不作为可随意放宽的运行时配置。

即使 `caphub.implementation.enabled=true`，P5.1 仍不包含 P5.2 builder，也不获得任何代码执行能力。

## 14. 稳定错误码

对用户和 API 返回以下安全错误码；响应不得包含绝对路径、原始 Git stderr、Shell 输出、SQL 或内部 stack：

```text
P5_HANDOFF_DISABLED
TARGET_PROJECT_NOT_REGISTERED
TARGET_PROJECT_NOT_CODE
UNSAFE_PROJECT_ROOT
GIT_IDENTITY_MISMATCH
BASE_COMMIT_MISMATCH
FINAL_COMMIT_UNAVAILABLE
FINAL_NOT_DESCENDANT
SOURCE_BRANCH_MISMATCH
IMPLEMENTATION_SCOPE_VIOLATION
EVIDENCE_DIGEST_MISMATCH
EVIDENCE_TOO_LARGE
UNSUPPORTED_GIT_OBJECT
INDEPENDENT_VERIFICATION_REQUIRED
IMPLEMENTATION_ALREADY_REGISTERED
REGISTRY_UNAVAILABLE
```

详细诊断只进入受控审计记录，并继续遵守秘密与路径脱敏规则。

## 15. 测试策略

P5.1 实施必须使用 TDD；跨 Registry、filesystem、Git process、API 或浏览器边界的行为使用 BDD。

### 15.1 Contract tests

- 四个 V1 schema 的合法、缺失、未知字段、超限和 digest fixture。
- allowed path normalization 与 traversal 拒绝。
- handoff rendering 跨 executor 语义一致且确定性。
- approval consumption 与重复请求幂等。

### 15.2 Project resolver tests

- 所有已注册 implementation project 可按 slug 解析。
- unregistered、非 code、root 本身、nested、symlink、mirror、identity mismatch 均 fail closed。
- 不在任何错误或日志快照中泄漏绝对路径。

### 15.3 Git evidence tests

使用临时本地 Git fixture 覆盖：

- valid descendant 与 exact diff recomputation。
- base mismatch、missing final、non-descendant、branch mismatch。
- allowed scope pass/fail。
- dirty tracked/untracked 文件保持原样。
- rename、delete、mode-only、binary、symlink、gitlink 和 `.git*`。
- path count、JSON size 和 patch size 上限。
- 禁止 fetch、hooks、pager、textconv、external diff 与 lazy fetch。

### 15.4 Registry tests

- `004` migration 可从前一 schema 前向应用。
- migration manifest digest 和顺序稳定。
- lineage、asset version、review request 和 approval consumption 原子化。
- evidence 失败不产生 asset。

### 15.5 API/UI BDD

- 未批准 proposal 无法准备 handoff。
- approved proposal 产生同一 digest 的 neutral 与 executor rendering。
- evidence import 不接受 target path。
- valid evidence 经过服务端重算后进入 implementation review。
- invalid、越界或无 independent verification 的 evidence 不进入 review。
- accepting implementation 不触发 merge/deploy/install/release。

### 15.6 最终阶段验证

最终 phase evidence 必须绑定同一 exact commit，包括：

- focused tests、typecheck、lint、production build；
- fixture-backed boundary BDD；
- 最终 build 浏览器实测与关键状态截图；
- 一次范围明确的独立 Review；
- 一次范围明确的独立 Verification。

不得在每个小任务重复全量 review 或全量测试；按风险在组件边界运行 focused checks，阶段收尾再执行完整 gate。

## 16. 实施分解

未来 P5.1 development plan 应按以下依赖顺序展开：

1. V1 contracts、digest 和 default-off config。
2. forward-only migration 与 Registry stores。
3. registered project resolver。
4. BuildProposal service。
5. deterministic handoff 与 renderers。
6. Git evidence importer。
7. ImplementationAsset service 与 implementation review。
8. read-only Web UI、API 和 manual CLI。
9. 跨真实边界 BDD。
10. 阶段验收、独立 Review/Verification 和最终证据。

该分解只定义设计依赖，不是可直接执行的 development plan。正式实施前必须根据届时的代码基线写独立计划。

## 17. 验收标准

P5.1 只有在以下条件全部满足时才可宣称完成：

1. 未批准 BuildProposal 不能生成 handoff。
2. 只有 AllJobs 已注册的本地 Git code project 能成为目标。
3. handoff 对同一 proposal version/digest 是确定且幂等的。
4. Caphub 不执行外部实现，不修改目标工作树。
5. Git commit、路径、diff 和 blob evidence 全部由服务端重算。
6. dirty Human working tree 在验证前后保持不变。
7. project drift、base drift、scope violation、unsupported object 和证据超限均 fail closed。
8. 没有外部实现证据不能创建 ImplementationAsset。
9. 没有 independent verification 不能进入 implementation review。
10. 接受 ImplementationAsset 不触发 merge、deploy、install、publish 或 release。
11. fixture BDD、最终 build、UI 证据、Review 和 Verification 绑定同一 exact commit。
12. 所有安全错误均不泄漏路径、secret、原始命令输出或内部实现细节。

## 18. 回滚与恢复

- 配置回滚：保持 `caphub.implementation.enabled=false`，关闭所有写入口。
- 数据回滚：不删除已创建记录；以追加的 `SUPERSEDED` 或失败事件保留审计历史。
- UI 回滚：隐藏创建/import action，但保留只读记录。
- migration 回滚：生产环境不执行破坏性 down migration；应用版本回退时必须能忽略未知的新 record kind。
- 目标仓库恢复：P5.1 从不写目标仓库，因此不需要由 Caphub 执行 Git 恢复。

## 19. 后续阶段边界

### P5.2：受控 builder

如果未来引入 Kimi Code builder，必须另行设计：sandbox、工作树隔离、command allowlist、依赖与网络 policy、资源预算、取消/超时、凭证边界、测试 runner、产物导入和审计。P5.1 的 handoff 与 evidence contract 可作为其输入/输出边界，但不自动授权执行。

### P5-D 与 P4 release

ImplementationAsset 被接受后，仍需单独决定是否集成代码，以及是否进入 P4 Capability Package/Release 流程。两者不得由 lineage 自动触发。

### P6

Runtime Router、usage observations、evals 和 update watcher 只消费正式 Capability Release，不直接消费未发布的 ImplementationAsset。

## 20. 结论

P5.1 用最小执行权限建立自研交付的审计闭环：Caphub 生成受控移交材料，外部 executor 完成实现，Caphub 只读验证 Git 事实并登记可审查资产。该边界为后续 builder 保留扩展点，但当前不引入任何代码执行或自动上线能力。

本设计已固化。下一项工作是为 P1–P4 production 激活编写独立设计与执行计划，使 Caphub 先能真实识别和管理第三方 capability；P5.1 实现继续保持暂停。
