# Sprint 001

Goal:      从零交付 alljobs v1（多项目进度工作台）并部署上线
Period:    2026-08-11 ~ 2026-08-12
Version:   v0.1.0
Assignee:  混合（claude 设计与编排 / kimi(k3) 实现 / claude(opus-5) 评审）

> 本 Sprint 早于 `.agent/CURRENT.md` + `BACKLOG.md` 规范（v2.0）落地，回顾性补记；
> 完整过程记录（Brief、Mockup、评审、Verification）在
> `.agent/frontend-design/alljobs-workbench-v1/` 与 `.agent/frontend-design/alljobs-restyle-apple/`，
> 本文件只做索引与摘要，不重复内容。

## 阶段与产出

1. **T3 设计工作流**（`.agent/frontend-design/alljobs-workbench-v1/brief.md`）
   - Brief：数据层=repo Markdown、部署=本地 + Cloudflare Tunnel、v1 范围=四页+快速添加
   - 视觉方向：concept-seed 骰选定「工作底账 The Working Ledger」（seed `cda17d0d`），
     Human Owner 于 Mockup Gate 批准 r2
2. **实现（pact 协议编排）**：任务 `data-layer` → `pages` → `quickadd` → `deploy-docs`，
   worker=kimi(k3)，reviewer=claude(opus-5)，4/4 accepted，hard gate 全绿，merge 到 main（`ee320ec`）
3. **独立 Verification**（`.agent/frontend-design/alljobs-workbench-v1/verification.md`）：
   axe 零违规、102 测试、坏文件注入实测、键盘/焦点、reduced-motion、关键旅程 E2E，结论 PASS
4. **部署**：`docs/deployment.md` 落地——launchd 常驻 `com.agentjoey.alljobs`（:3456）
   + cloudflared tunnel + Cloudflare Zero Trust Access，验证 `https://alljobs.agentjoey.ai` 302→登录页
5. **Apple HIG 改版评估**（`.agent/frontend-design/alljobs-restyle-apple/brief.md`）：
   用 `apple-design` skill 重做设计系统，独立评审 Good，Critical（焦点环对比度 2.3:1，需 3:1）
   与 4 项 High（选中态对比度、缺增强对比度档、强调色语义冲突、深色 agent 色标红绿色盲重合）
   均已修复；分支 `restyle/apple-hig` 未合并，**合并决定悬置**

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | 新设计前 | N/A（走的是 impeccable/T3 设计工作流，非 superpowers） |
| verification-before-completion | Task Done 前 | ✅（独立 Verification Agent，见上） |
| systematic-debugging | 发现 Bug 时 | ✅（React 19 隐式 reset 脱节 bug，三轮定位后修复） |

## Sprint 回顾
**Done：** 全部（设计→实现→验证→部署→改版评估）
**Deferred：** 视觉方向终审（Apple vs 工作底账 vs 混合）→ 移入 `BACKLOG.md` HIGH；
数据从占位改真实值 → 同上
**经验：**
- concept-seed 的骰子决策页若用户未及时应答会关闭，需走结构化提问兜底重新确认——已发生一次
- 独立评审比自评更容易抓到系统性遗漏：v1 阶段抓到 TradeLinks 种子数据自相矛盾；
  Apple 改版阶段抓到"对比度审计只测静态文字、漏了交互态与非文字元素"这一整类盲区
- 部署排障（Cloudflare 预览子域名 DNS 记录声称成功但从未落地）超出可诊断范围时，
  果断放弃预览域名、收窄到单一生产域名，比反复重试更省时间
