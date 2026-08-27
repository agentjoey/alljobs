<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# alljobs — Project Context

## Frontend workflow authority

All frontend UI design, development, and review follows
`/Users/xtation/AgentWorks/Tools/FRONTEND-DESIGN-WORKFLOW.md` version 3.3. This repository-local
authority corrects the obsolete v3.1 path that omitted the `Tools/` directory.

## ⭐ Session 启动（每次必执行）
```bash
git pull
cat .agent/CURRENT.md
```

## Project Overview
Joey 的个人多项目规划工作台。当前正在以绿地方式重建 Planning Core：统一可视化和管理
Project → Roadmap → Backlog / Task，同时保持代码项目的 Roadmap/Backlog 在各自 repo 内作为唯一事实源。
旧 v0.1 产品方向、schema、样例数据、UI 与测试均已作废并从当前树清除；旧版服务保持离线，
只通过 Git 历史与 `archive/v0.1.0-retired` 保留整版回滚能力。

**Location:** ~/AgentWorks/GPT_Workspace/alljobs
**GitHub:**   agentjoey/alljobs
**Live:**     https://alljobs.agentjoey.ai（Cloudflare Access 邮件验证码登录）
**Version:**  v0.1.0-retired（release 可回滚，当前未监听 3456）；Planning Core V1 Brief r1 已批准

**Canonical planning docs:** [Architecture baseline](docs/superpowers/specs/2026-08-26-alljobs-federated-planning-core-design.md) · [T3 Brief](.agent/frontend-design/planning-core-v1/brief.md) · [Development plan](docs/superpowers/plans/2026-08-26-alljobs-federated-planning-core-rebuild.md)

## Target Tech Stack
| Layer | Tech |
|---|---|
| 前端框架 | Next.js 16（App Router）+ React 19 + TypeScript |
| 样式 | Tailwind v4 + shadcn/ui（radix-nova）+ T3 mockup 批准后的新设计系统 |
| 数据层 | AllJobs-native Markdown + repo-owned Markdown 的只读 Git mirror projection；无数据库 |
| 测试 | Vitest + Testing Library + Playwright；最终数量以实现证据为准 |
| 部署 | 单一 Control Host：本地 Next + refresh worker（launchd）+ 现有 Cloudflare Tunnel / Access |

## Key Constraints

- **`next start` 必须带 `-H 127.0.0.1`**（见 `package.json` 的 `start:prod`）。Next 默认 `--hostname 0.0.0.0`，
  不显式绑回环地址会让本机应用对整个局域网零鉴权敞开——tunnel 是唯一入口这条安全边界靠这个参数成立，改脚本时勿删。
- **Turbopack 不接受软链的 `node_modules`**（`git worktree` 场景会踩到）：worktree 需要
  `npm install` 装一份真实依赖，不能 `ln -s` 复用主仓库的。
- **headless Chrome CLI 截图有 500px 最小窗口宽陷阱**：`--window-size=390` 实际按 500 布局再裁切，
  移动端证据会失真。用 `scripts/shot.mjs`（CDP `Emulation.setDeviceMetricsOverride`），不要裸调 CLI。
- **Mockup Gate 状态**: Task 1 Mockup Gate 于 2026-08-27 获 Human Owner 明确批准（"mockup gate 通过，进入下一步"）。
- **当前授权 Task 2**: 正在构建 Planning Core V1 的基础运行时（Next.js semantic shell、Paper Workbench 样式系统、Vitest 与 Playwright 测试基座）。
- **旧产品不兼容迁移**：不得读取或转换 v0.1 schema/sample data；旧版本只通过 Git tag 整版回滚。

## Dev Commands

```bash
npm run dev                 # 本地 Next.js 开发服务器
npm test                    # 运行 Vitest 单元与组件测试
npm run test:e2e            # 运行 Playwright 端到端测试
npm run typecheck           # TypeScript 静态类型检查
npm run lint                # ESLint 代码规范检查
npm run build               # Next.js 生产环境构建
npm run start:prod          # 启动生产应用 (127.0.0.1:3456)
node scripts/shot.mjs <url> <out.png> <width> <scale> <mobile:0|1> [light|dark]   # CDP 截图
```

## Release gate

Planning Core 是 T3：必须绑定 approved Brief/mockup/final commit，完成独立 Review 与 Verification、Human Owner
亲手走查和发布批准，且 final screenshot 来自最终 build。切换时保留 Tunnel/domain/Access，失败按计划整版回滚。

<!-- pact:begin (managed by pactify — edit outside this block) -->
# pact protocol

This repo uses the **pact protocol** (v1). Seats (who does what) are listed in
`.pact/PROJECT.md` and `.pact/STATE.yml`.

**Your identity — bind it to this working copy first.** Your seat is resolved
from `PACT_AGENT_ID` (env), else the untracked `.pact/seat` file. Set the
file once per working copy:
```bash
pactify seat use <your-seat-id>   # from the roster in .pact/PROJECT.md
```
For concurrent seats in the same repo, use a separate git worktree per seat.

**Primary — MCP:** the `pact` MCP server is wired into your config. Use its tools
(projects / status / join / assign / checkpoint / accept / changes / merge / validate) and
resources (`pact://state`, `pact://log`). Cold start: call `status`, then `join`
(registers your seat and checks out your feature branch). Every action tool takes an
optional `project` (a name from `projects`) to act on another registered repo without
restarting — default is this repo.

**Fallback — shell** (if MCP is unavailable):
```bash
pactify seat use <your-seat-id>   # if not already bound
pactify join --roles <your-roles>
```
then `pactify help` for the verbs.

**The two rules:** a worker cannot self-accept (only the task's reviewer accepts); a
feature cannot merge until all its tasks are accepted.
<!-- pact:end -->
