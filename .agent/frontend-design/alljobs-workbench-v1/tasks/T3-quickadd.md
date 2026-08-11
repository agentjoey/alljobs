# T3 · quickadd — 快速添加日志（server action + 落账动效）

## 背景（必读）

1. `.agent/frontend-design/alljobs-workbench-v1/brief.md` — 状态矩阵「快速添加」行 + mockup/states.html 样张 04/05/06/14（校验失败/提交中→印压成功/写入失败/今日无日志）
2. mockup/overview.html 快速添加行（今日区末行=下一条空格线）；T1 的 lib/data、T2 的总览页

**不要重开 Brief/Gate；实现已批准行为。**

## 交付物

1. **Server action**（`app/actions/quickadd.ts` 或就近约定位置）：
   - 输入：text（必填非空）、project slug（必选，须存在于 data/projects）、agent（joey/claude/codex/kimi）
   - 追加行 `- HH:MM <slug> @<agent> <text>` 到 `data/log/<今日 YYYY-MM-DD>.md`（不存在则创建；无 frontmatter，纯列表行；时间为服务器本地时）
   - zod 校验；fs 失败返回结构化错误（不抛 500）
2. **表单接线**（总览今日区）：真实 `<form>` 提交（**回车即落账**），`useActionState`/`useFormStatus` 或等价——
   - idle：占位「记一笔…（回车落账）」+ 项目/agent select + 落账钮
   - validation：aria-invalid + 红下划线 + 行内错误文案（`aria-describedby` 关联输入），文案同样张 04
   - submitting：控件禁用、按钮「落账中…」
   - success：新行落账，`is-new` 印压 180ms ease-out（scale 1.015→1 + 淡入），**prefers-reduced-motion 直接出现**；表单清空、焦点回输入框
   - fs error：行内 proof 风格错误 + 「你的内容还在输入框里」+ 手动补记路径提示（同样张 06）
   - 今日无日志时显示引导句（同样张 14）
3. **测试**：action 单测（合法追加/建新文件/空文本拒绝/未知 slug 拒绝/追加格式精确）；表单状态可用组件测或保留手测记录于 evidence

## 验收

- `npm run lint && npm run build && npm test` 全绿
- 提交后刷新 `/log` 与对应 `/projects/[slug]` 均出现该行（数据单源验证）
- 键盘全流程可达；reduced-motion 降级验证

## 证据

命令输出；落账前后 data/log 文件 diff；总览提交成功 + 校验失败两态截图（scripts/shot.mjs，port 3456）。
