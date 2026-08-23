# Product Backlog — alljobs

> 这是 alljobs 自己的 canonical backlog。每项使用稳定 ID，排入 Sprint 后保留 ID 并从 Active 区移入对应 Sprint；不要用临时聊天结论替代本文件。
>
> 优先级：P0 = 不做就无法形成真实使用闭环；P1 = 下一阶段重要；P2 = 可延后 polish；Research = 真实使用前不实现。

## P0 — Operational Adoption

### AJ-BL-001 — 项目卡切换为真实数据

**Why**：当前 `data/projects/*.md` 大量仍是 mockup/seed 阶段占位值，工作台展示与真实项目进度已经漂移。

**Scope**：逐个核对现有项目卡，并补充当前真正需要追踪的高频项目；校正 `status` / `priority` / `agents` / `links` / `Now` / `Next` / `Notes` / 日期字段。

**Done when**：
- 所有保留的 `data/projects/*.md` 均经过人工或可信 repo 事实核对，不再带“占位样例”语义
- `Now` / `Next` 与对应项目当前状态一致，链接可定位到真实 repo/资料
- 已结束或不再追踪的项目被明确标记 `done` / `paused` 或移出 active 集合，而不是继续伪装活跃
- 页面无由本轮数据引入的 `ProofIssue`
- Joey 从 `/` 和 `/projects` 抽查后能用当前数据决定“今天推进什么”

### AJ-BL-002 — 建立 agent → alljobs 落账闭环

**Why**：alljobs 的核心差异是 agent 可以直接写 Markdown；若 agent 完成工作后不落账，工作台会再次变成漂亮但失真的陈列柜。

**Scope**：先接入至少 3 个高频项目，在其 `AGENTS.md` / `CLAUDE.md` / 等价 agent 入口中加入精简约定：完成有意义的开发/运营节点后，向 `alljobs/data/log/<YYYY-MM-DD>.md` 追加一条合法记录；必要时同步项目卡 `Now/Next`。

**Done when**：
- 至少 3 个高频项目具有明确、可执行的 alljobs 落账约定
- agent 写入遵守 `data/README.md` 行文法，不需要专用 API 或凭证
- 至少完成 3 次来自不同真实工作会话的落账验证，刷新 alljobs 后立即可见
- 约定明确“重要节点记录，避免每个微步骤刷屏”，不把日志变成 token 排泄场

## P1 — Baseline & Reliability

### AJ-BL-003 — 核验 v2 production baseline

**Why**：repo 已合并 v2，但 reconciliation 尚未取得“生产进程当前运行的 build 就是 v2 main”的新证据。

**Done when**：
- production build/restart 绑定到当前批准的 `main` SHA
- 经 Cloudflare Access 实测 `/`、`/projects`、`/log`、`/board`、`/stats` 至少各成功访问一次
- `/board` 和 `/stats` 不再只是 build-time 存在，而是 production 可达
- 验证 SHA、时间与结果记录到 `.agent/CURRENT.md` 或运维记录

### AJ-BL-004 — 恢复 v2 关键 UI 回归覆盖

**Why**：v1 有 102 tests；v2 最新基线为 75 tests。数量本身不重要，真正缺的是新 `components/workbench/*` 的关键交互回归覆盖。

**Scope**：只补 load-bearing 行为，不追求把旧测试机械搬回来。

**Done when**：
- 自动化覆盖移动端主导航可达
- 自动化覆盖 board 的键盘 task move 路径与安全校验
- 自动化覆盖 Quick Add 的成功/校验失败及显示值与实际写入一致性
- 至少覆盖 ProofBanner / 坏数据不拖垮其余页面这一核心容错契约
- `lint` / `test` / `build` 全绿

### AJ-BL-005 — 真实使用 10 天后的产品复盘

**Why**：提醒、自动采集、更多统计等需求应该从真实摩擦中长出来，而不是继续凭空建造一个非常勤奋的未来。

**Done when**：
- `data/log/` 有连续 ≥10 个真实使用日的数据（允许周末无工作，但需记录评估口径）
- 复核 stale=7 天、dueSoon=5 天、attention 排序、30 日统计、streak 是否符合实际决策习惯
- 汇总真实使用中重复出现的 3–5 个摩擦点
- 仅将有证据的需求提升为新的 Active backlog 项

## P2 — Polish / Maintenance

### AJ-BL-006 — 项目资料链接提供真正可用的本地打开方式

**Done when**：repo/folder 链接不再只是浏览器无法打开的纯文本；采用一种受控且跨当前主要桌面环境可用的 deep link / copy-open 方案，并有失败降级。

### AJ-BL-007 — 校对横幅补“定位问题文件”动作

**Done when**：`ProofBanner` 中的问题项可以把用户带到明确的文件定位方式，而不是保留 `href="#"` 占位；浏览器无法直接打开本地文件时提供复制路径降级。

### AJ-BL-008 — 清理 Cloudflare preview 残留配置

**Done when**：确认 `alljobs-preview` 不再被任何文档、tunnel route 或 Access policy 使用后，从 Cloudflare dashboard 删除遗留项，并在运维文档注明单一 production hostname 策略。

## Research — 等真实使用证据

### AJ-R-001 — 到期提醒 / 推送

只有 `AJ-BL-005` 证明“被动 attention 列表不够用”后再设计；v2 当前不增加通知基础设施。

### AJ-R-002 — Agent session 内容集成

评估是否在项目详情展示 Claude/Codex/Kimi 等 session 摘要或链接。先证明日志粒度不足，再决定是否接入更重的数据源。

### AJ-R-003 — 深色模式

v2 当前明确为浅色 Apple HIG 基线。只有真实使用场景出现明确夜间需求后再进入设计，不为复选框完整度增加第二套视觉维护成本。

## Completed / Reconciled

- `2026-08-23`：`redesign/apple-hig-v2` 已合入 `main`，旧 backlog 中“Apple HIG vs 工作底账 vs 混合取舍”关闭，不再作为待决策事项
- `2026-08-23`：v2 数据扩展已包含 tasks / stats / `[session]`，任务看板不再属于 Research
- `Sprint 001 / 2026-08-12`：v1 设计 → 实现 → 独立 Verification → launchd + Cloudflare Tunnel + Access 上线
