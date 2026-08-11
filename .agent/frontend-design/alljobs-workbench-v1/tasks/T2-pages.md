# T2 · pages — 四条路由：总览 / 项目 / 详情 / 日志（账本世界）

## 背景（必读，按此顺序）

1. `.agent/frontend-design/alljobs-workbench-v1/brief.md` — r2 已 Approved：状态矩阵、设计方向、验收标准、Production 实现待办
2. `.agent/frontend-design/alljobs-workbench-v1/mockup/`：**mockup 即视觉规范**——`ledger.css`（token 与组件形制）+ 5 个 HTML。最终实现与已批准 mockup 实质偏差 = 任务 Reopened，宁可像素保守也不要自由发挥
3. `lib/data/`（T1 产物）：只经它取数，不得在页面里自行读文件

**不要重开 Brief/Gate/Start Card；这是已批准设计的实现。** 遵循 AGENTS.md（Next.js 版本警告：先读 node_modules/next/dist/docs 相关篇目再写代码）。

## 交付物

1. **Token 移植**：`app/globals.css` 用 Tailwind v4 `@theme` 承接 ledger.css 全部变量——shadcn 语义名映射（--background=纸、--foreground=墨、--primary=红栏线…）+ 世界专属（--rule-red、--feint、--st-*、--ag-*、--t0..t4）。字体已由 layout 的 next/font Geist 提供，**禁止引入 Google Fonts CDN**；补 Geist Mono（next/font）
2. **方向契约注释**迁入 `app/layout.tsx`：body 首子节点 HTML 注释，内容取 mockup/overview.html 顶部六块（THESIS…FINISH，seed cda17d0d）；build 后 `grep -r cda17d0d .next` 须命中
3. **共享组件**（`components/ledger/`）：Masthead（folio+计数+索引标签，aria-current）、Sheet/Row（红栏线+格线栅格）、Stamp、AgentMark（色标+墨字）、Tally（14 格，aria 文本由数据生成）、DateStamp（签名元素，仅总览）、ProofBanner（校对）、SectionHead
4. **路由**（server components 优先，数据每次请求新读——本地常驻 server，刷新即见文件改动；确保 `next start` 下也动态渲染）：
   - `/` 总览：注意清单（blocked/停滞/到期戳，行链接+hover）→ 今日（日期戳+条目升序+快速添加占位行，行为 T3 接）→ 最近完成；右页活跃项目 P0→P2（NEXT、meta、tally、last）；桌面对开双页
   - `/projects`：校对横幅（有 issue 时）、过滤 chips（**默认「全部」**；状态/类型/agent，URL searchParams 驱动）、全量底账行
   - `/projects/[slug]`：详情头（戳/标题/链接行[repo][vault][dir][url]/kv）、blocked 红条（blocked_reason+天数）、Now/Next/Notes（渲染 md body 分节）、活动流（倒序日分组）；slug 不存在 → not-found 页（含最近 slug 索引）
   - `/log`：过滤 chips（项目/agent）、日分组倒序、空日不渲染、按月「更早」折叠占位
5. **状态矩阵全覆盖**（对照 brief 表逐格）：空账引导（教 schema）、注意清单空「无事」行、今日无日志引导句、过滤无结果+清除、无活动记录、缺 Now 占位、done 减淡、校对横幅。骨架（空格线）用 loading.tsx
6. **a11y（Production 待办清单在 brief 内，必须做）**：每页 h1（可视觉低调）、日志 dayhead 用标题元素、键盘可达+focus-visible 红环、状态戳文字+颜色、reduced-motion 全降级、对比度不低于 mockup 实测值

## 验收

- `npm run lint && npm run build && npm test` 全绿；契约注释在 build 产物中存活
- 四路由渲染与 mockup 双端截图逐区一致（布局/密度/层级/戳形；数据由 seeds 驱动，日期相对值随当天变化属预期）
- 改一个 data 文件刷新即变（dev 与 start 都验证）
- 390px 无横向滚动

## 证据（checkpoint 时写入 evidence）

lint/build/test 输出；`npm run build && npm run start -- -p 3456` 后用 `node scripts/shot.mjs http://127.0.0.1:3456/<route> <out.png> <1440|390> <1|2> <0|1>` 对四路由拍桌面+移动共 8 张存 `.agent/frontend-design/alljobs-workbench-v1/impl-screens/`；`grep -r cda17d0d .next` 命中记录。
