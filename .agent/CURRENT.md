# Current Status — alljobs

Version:        v0.1.0（package metadata）
Baseline:       v2 / Apple HIG 三栏工作台
Sprint:         001 已完成；下一 Sprint 尚未开启
Last Updated:   2026-08-23 by GrandeGPT
Sprint File:    .agent/sprints/sprint-001.md

## Open Bugs

🟢 无已知 P0/P1 runtime bug。

最近一次 v2 Verification（2026-08-23）记录：`npm run lint` 0 error、`npm test` 75/75、`npm run build` 成功，6 个路由均可构建；看板键盘移动、移动端导航与任务写回做过针对性实测。已知质量缺口不是失败用例，而是 v2 `components/workbench/*` 尚未恢复 v1 同等的组件级测试覆盖，已进入 Backlog。

## Current Baseline

`redesign/apple-hig-v2` 已于 2026-08-23 fast-forward merge 到 `main`（核心提交 `560efce`），旧的“Apple HIG 是否合并”决策已结束。当前产品基线是 Apple HIG 浅色三栏工作台，而不是 v1「工作底账」视觉。

当前能力：

- `/`：今天 / 注意力 / 今日日志 / 快速添加
- `/projects`、`/projects/[slug]`：项目列表与详情
- `/log`：全局日志
- `/board`：Markdown task 看板，可写回 `data/tasks/<slug>.md`
- `/stats`：30 日活动、agent/project 分布、streak、task/session 统计
- 数据层：`data/projects/*.md` + `data/log/*.md` + `data/tasks/*.md`；Markdown 仍是 single source of truth
- 写入面：快速添加日志 + task 状态移动；不存在数据库或独立 API 服务

部署拓扑仍是本机 Next.js server + launchd + Cloudflare Tunnel + Zero Trust Access。此次 reconciliation 只确认 repo 基线，不把“v2 已在生产进程重新 build/restart”当成已验证事实；该项单独进入 Backlog。

## Operational State

当前最大缺口不是继续加页面，而是**真实使用尚未建立**：`data/projects/*.md` 仍有大量 mockup/seed 阶段占位状态，项目 Now/Next/priority 等与真实工作已经漂移；agent 也尚未形成稳定的跨 repo 落账约定。

因此下一阶段定义为：**Operational Adoption / Real Data Loop**。

## Next Sprint Candidates

按 `.agent/BACKLOG.md` 排序：

1. `AJ-BL-001` — 把项目卡从占位样例校正为真实项目状态
2. `AJ-BL-002` — 建立高频 agent → alljobs 日志落账约定
3. `AJ-BL-003` — 核验 v2 production baseline 与 6 路由运行状态
4. `AJ-BL-004` — 恢复 v2 关键交互的自动化回归覆盖
5. `AJ-BL-005` — 连续真实使用 ≥10 天后做产品规则复盘

## Version History

| Baseline | Date | Summary |
|---|---|---|
| v2 UI baseline | 2026-08-23 | Apple HIG 三栏工作台合入 main；新增 board / stats / tasks / session；Verification 75/75 + lint/build PASS |
| v0.1.0 | 2026-08-12 | v1 首发：四页 + 快速添加；独立 Verification PASS；本地 launchd + Cloudflare Tunnel + Access 上线 |
