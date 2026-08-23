<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# alljobs — Project Context

## ⭐ Session 启动（每次必执行）
```bash
git pull
cat .agent/CURRENT.md
```

## Project Overview
Joey 的个人多项目工作台：对并行推进的所有项目做日常追踪，任何 agent 改一个 `data/` 下的
Markdown 文件即完成进度写入，无 API、无凭证。v1 已实现并部署，正等待「工作底账」与「Apple
HIG」两个视觉方向的最终取舍（见 `.agent/CURRENT.md`）。

**Location:** ~/AgentWorks/GPT_Workspace/alljobs
**GitHub:**   agentjoey/alljobs
**Live:**     https://alljobs.agentjoey.ai（Cloudflare Access 邮件验证码登录）
**Version:**  v0.1.0（v1 功能完整，尚无 release.sh /版本号自动化）

**Technical docs:** [Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Operations](docs/operations.md) · [Product](PRODUCT.md)

## Tech Stack
| Layer | Tech |
|---|---|
| 前端框架 | Next.js 16（App Router）+ React 19 + TypeScript |
| 样式 | Tailwind v4 + shadcn/ui（radix-nova）+ 手写设计系统 token（`app/globals.css`） |
| 数据层 | 无数据库——`data/*.md`（gray-matter + zod 解析，`lib/data/`），git 即历史 |
| 测试 | vitest（102 例，`npm test`） |
| 部署 | 本地 `next start` 常驻（launchd）+ Cloudflare Tunnel + Zero Trust Access |

## Key Implementation Details
（仅非显而易见的陷阱/约定，其余读代码即可）

- **`next start` 必须带 `-H 127.0.0.1`**（见 `package.json` 的 `start:prod`）。Next 默认 `--hostname 0.0.0.0`，
  不显式绑回环地址会让本机应用对整个局域网零鉴权敞开——tunnel 是唯一入口这条安全边界靠这个参数成立，改脚本时勿删。
- **React 19 表单 action 的隐式 reset** 在 commit 的 layout 阶段触发，晚于任何 `requestAnimationFrame` 回调；
  受控 select 要在提交后重新同步显示，必须监听原生 `reset` 事件 + `queueMicrotask`（见
  `components/ledger/primitives/today-sheet.tsx` 注释，三轮踩坑后的结论）。
- **Turbopack 不接受软链的 `node_modules`**（`git worktree` 场景会踩到）：worktree 需要
  `npm install` 装一份真实依赖，不能 `ln -s` 复用主仓库的。
- **headless Chrome CLI 截图有 500px 最小窗口宽陷阱**：`--window-size=390` 实际按 500 布局再裁切，
  移动端证据会失真。用 `scripts/shot.mjs`（CDP `Emulation.setDeviceMetricsOverride`），不要裸调 CLI。
- **`color-mix(in srgb, X 55%, transparent)` 不是"变浅的 X"，是半透明的 X**：用它做焦点环/语义色这类
  非文字元素时，实际对比度远低于直觉（Apple 改版分支上真实测出过 2.3:1 的焦点环，需要 3:1）。语义性
  颜色用实色 token，半透明只用来做真正的 tint 底纹。
- **对比度实测走 `scripts/a11y-contrast.mjs` / `a11y-focus.mjs`**：CDP 驱动，明暗双模式、真实键盘
  Tab 走位，别用肉眼判断或只查静态文字对——上一次就是这么漏掉焦点环这个 Critical 的。

## Dev Commands
```bash
npm run dev            # 开发服务器（3000）
npm run build           # 生产构建
npm run start:prod      # 生产运行，端口 3456（本项目约定，含 -H 127.0.0.1）
npm test                # vitest，102 例
npm run lint             # eslint
node scripts/shot.mjs <url> <out.png> <width> <scale> <mobile:0|1> [light|dark]   # CDP 截图
```

## Release 后必做
本项目暂无 `release.sh` 自动化（v0.1.0 起步阶段，单人使用，未走版本号 bump 流程）。发生结构性变更后手动：
1. 更新本节上方 Version / 更新 `.agent/CURRENT.md` 的 Version History
2. 架构变更 → 更新 `docs/architecture.md`
3. 部署流程变更 → 更新 `docs/deployment.md`

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
