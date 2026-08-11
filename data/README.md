# data/ — alljobs 的单一真相源

**任何 agent 改文件即写入**：不需要 API、不需要凭证。改一个 md 文件，工作台刷新即生效；git 即历史，Obsidian 可直接把本目录当 vault 打开。

解析容错：单文件/单行写坏不会拖垮页面——坏处进入页面顶部「校对」清单（指明文件与行号/字段），其余照常渲染。

## 项目卡 `projects/<slug>.md`

`<slug>` 即文件名（小写字母/数字/连字符），日志用它引用项目。

```yaml
---
title: Pactify Apps          # 显示名（必填）
type: code                   # code | product | biz | ops（必填）
status: active               # active | blocked | paused | done（必填）
priority: P0                 # P0 | P1 | P2（必填）
agents: [claude, codex]      # 常用执行 agent，至少一个；joey = 人工
links:                       # 可选，各字段均可选
  repo: ~/AgentWorks/CodeSpace/pactify-apps
  obsidian: obsidian://open?vault=Main&file=Projects%2Fpactify
  folder: ~/Documents/…
  url: https://…
tags: [ios, app-store]       # 可选
started: 2026-06-02          # YYYY-MM-DD（必填，须为真实日期）
due: 2026-08-20              # 可选
blocked_reason: 等供应商报价   # status=blocked 时必填
blocked_since: 2026-08-06    # 可选，YYYY-MM-DD；用于显示「卡住 N 天」
---
```

frontmatter 之后写三段（段标题固定）：

```md
## Now
当前推进中的一件事

## Next
- 下一步（首条即总览 NEXT 列）

## Notes
自由笔记
```

## 日志 `log/YYYY-MM-DD.md`

文件名即日期（必须是真实日历日期）。frontmatter 可选（存在则被忽略，不解析也不报错）。每行一笔，行文法：

```
- HH:MM <slug> @<agent> <text>
```

- `HH:MM` 24 小时制；`<slug>` 必须是 `projects/` 里存在的项目；`@<agent>` 如 `@claude` `@codex` `@kimi` `@joey`。
- 一天之内按时间升序追加（新行落底）。
- 无法解析的行、未知 slug 不会丢数据——进「校对」清单。

## 派生规则（lib/data/derive.ts 实现）

- 项目最近更新 = 提及该 slug 的最新日志行（日期+时间）；无则显示 `—`
- 停滞 = status active 且（无记录或最近更新 ≥7 天前）
- 临近到期 = due 存在且 ≤5 天后（**含已过期**，无下界：逾期比临近到期更该被看见，不得从注意清单消失）
- 卡住天数 = blocked_since 距今天数
- 注意清单 = blocked ∪ 停滞 ∪ 临近到期（按此优先级去重排序）
