# Product Backlog — alljobs
> 排入 Sprint 后从此处移除。

## 🔴 HIGH
- [ ] 视觉方向终审：Apple HIG 改版（`restyle/apple-hig` 分支）vs 工作底账（现 main）vs 混合取舍——
      技术已就绪（两边都通过独立评审），只差 Joey 拍板
- [ ] `data/projects/*.md` 十个文件的 status/priority/next/links 从占位样例改成真实值——不做这步，
      工具没有实际使用价值
- [ ] 至少给 3 个高频协作项目（pactify-apps / agent-pact / tradelinks）的 CLAUDE.md/AGENTS.md
      加入"完成任务后往 `alljobs/data/log/<今日>.md` 记一行"的约定；格式见 `data/README.md`

## 🟡 MED
- [ ] 若采用 Apple 改版：清理 Cloudflare Access dashboard 里从未解析成功的 `alljobs-preview`
      域名残留条目（排障过程遗留，无害但该删）
- [ ] `docs/architecture.md` 目前是文字版数据流描述，可补一张实际时序图

## 🟢 LOW
- [ ] 项目详情页 `[repo]` 链接是纯文本（本地路径浏览器打不开）——可选 `file://` 或编辑器 deep link
- [ ] 项目列表校对横幅缺"打开文件"实际动作（mockup 起就是占位 `href="#"`）
- [ ] 若采用 Apple 改版，其独立评审记录的 Low 项一并处理：Liquid Glass 缺 scroll edge effect、
      过滤器多维分组缺 ARIA 语义、iOS safe-area 未处理

## 📋 研究向（未决策，v1 brief 明确排除，等真实使用后再评估）
- [ ] 任务看板
- [ ] 到期提醒推送
- [ ] agent 会话内容集成（如项目详情页显示相关 Claude/Kimi 会话摘要）
- [ ] 深色模式（工作底账世界目前没有；若采用 Apple 改版此项随之解决）

## ✅ 已完成（按 Sprint 归档）

### Sprint 001（2026-08-12 完成）
- [x] T3 设计工作流：Brief → concept-seed 方向骰选 →「工作底账」HTML mockup → 独立评审 →
      Human Owner Mockup Gate 批准（详见 `.agent/frontend-design/alljobs-workbench-v1/`）
- [x] pact 协议编排实现：kimi(k3) worker + claude(opus-5) reviewer，4 任务 7 轮迭代全部 accepted，
      hard gate（lint + build + test）
- [x] 独立 Verification：axe 零违规、102 测试、坏文件注入实测、键盘/焦点、reduced-motion、
      关键旅程 E2E（晨检 → 详情 → 落账）
- [x] 部署：本地 launchd 常驻 + Cloudflare Tunnel + Zero Trust Access（邮件验证码）
- [x] Apple HIG 改版评估（`restyle/apple-hig`）：独立评审 Good；Critical（焦点环对比度仅 2.3:1）
      与 4 项 High 已修复；合并决定悬置
