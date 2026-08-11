# Verification Record — alljobs-workbench-v1 · Mockup 阶段

阶段: Mockup Gate 前置（production 实现后另行完整验证）· mockup revision: **r2** · 2026-08-11

## 证据清单（全部来自 r2 修复后重拍）

`mockup/screenshots/`：

| 页面 | 桌面 1440（scale 1） | 移动 390（scale 2, CDP 设备仿真） |
|---|---|---|
| 总览 | overview-desktop.png | overview-mobile.png |
| 项目详情 | project-desktop.png | project-mobile.png |
| 项目列表 | projects-desktop.png | projects-mobile.png |
| 日志 | log-desktop.png | log-mobile.png |
| 状态样张 | states-desktop.png | states-mobile.png |

截图方法注记：headless Chrome CLI 存在**最小窗口宽 500px** 陷阱（`--window-size=390` 实际按 500 布局、按 390 裁切，移动端证据失真）。r2 起全部证据经 CDP `Emulation.setDeviceMetricsOverride` 拍摄（脚本见会话 scratchpad shot.mjs；production 阶段建议移植为 repo 内工具）。移动端证据以 `document.fonts.ready` 后 full-page 捕获。

## 自动化检查

**impeccable detect.mjs**（6 文件，2026-08-11）：7 findings，全部 warning 级，处置如下——

| finding | 处置 |
|---|---|
| overused-font: Geist ×5 | 豁免成立（独立评审核验）：Operate 模式许可工作马字体；项目既有栈（create-next-app + nova 即 Geist）；显示声部为 mono 戳字非系统 display face。附带义务：production 走 next/font 自托管 |
| flat-type-hierarchy: states.html 11/12/13px | 不适用：仅样张页规格标签；产品页层级 22/15/14/12/11 未触发 |
| em-dash ×16 | 不适用（advisory）：中文「——」正当标点，独立评审逐处核验 |

**dataviz 调色板校验**（validate_palette.js，surface #ECF1E6 light）：agent 四色章 `#B3491D / #0B7DA6 / #7A3FA8 / #5C7E14` → **ALL CHECKS PASS**（lightness band ✓ · chroma floor ✓ · CVD 分离 ✓ · 正常视力最差邻对 ΔE 18.6 ≥15 ✓ · 对比 ≥3:1 ✓）。前三轮候选因 teal 色度不足/邻对过近被否，记录于会话。划记格为 sequential 单色渐进（浅→深单调），构造即合规。文字永不穿系列色（色标承色、mono 墨字承名）。

**对比度实测**（独立评审用实现值计算）：墨 14.2:1 · ink-2 6.9 · ink-3 5.0 · link 6.9 · active 5.5 · blocked 6.2 · paused 5.2 · done 4.9 · due 5.2——全部 ≥4.5:1。

## 独立复核记录

- **执行方式**：general-purpose 子代理新会话（不继承实现上下文），按 impeccable finish reviewer 契约执行；shipped reviewer 类型未注册、降级手册文件缺失，评审者按 new-work §finish 契约自行执行并披露（合规降级，已记录）。agentId a43b2591d6e9e1e0f。
- **Review Pass（对 r1）结论**：disposition **fix-then-ship**。五节契约 THESIS/OWN-WORLD/FIRST VIEWPORT/FORM-FINISH 成立，STORY 被 M2 数据矛盾削弱；九维中 Usefulness/Efficiency/Brand fit/Performance 强，Clarity/Consistency/Accessibility/Responsive 良；红线全 PASS。
- **Material findings（r1 → r2 处置）**：
  - M1 状态矩阵四格无渲染证据 → states.html 增样张 11–14（blocked 详情红条 / 过滤无结果 / 无记录+缺 Now / 今日无日志）
  - M2 种子数据违反派生规则（TradeLinks）→ last=4 小时前、划记格+今日、aria 同步；「卡住 5 天」戳保留（状态龄与活动分离，样张 11 注明语义）
  - M3 星期整体错一天 → 全站 +1（08-11 周二）
  - M4 注意行无 hover 示能 → .attn:hover 底色微染 + 标题转链接色，内联样式清除
  - M5 默认过滤矛盾 → 采纳改 brief 分支：默认「全部」，r2 修订待 Human Owner Gate 确认
- **Polish 处置**：P1/P2/P3/P4/P5/P7/P10 已随批修复；P6/P8/P9 列入 brief「Production 实现待办」。
- **Verdict Pass（对 r2）**：见下节（评审者后台执行中，返回后回填）。

## Verdict Pass 结果（2026-08-11）

| Finding | 分数 | 备注 |
|---|---|---|
| M1 状态矩阵四格 | **resolved** | 样张 11–14 在场且双端渲染正确 |
| M2 TradeLinks 自洽 | 首判 partial → **resolved** | 残留为 overview.html 两行机械同步（perl 未匹配）；同步后 overview 双端重截，由独立轻量核验代理（a1ab9a2aad6ac5ebb，新会话）确认两文件逐字一致、aria 数=胞元和=7、截图来自修复后版本 |
| M3 星期错一天 | **resolved** | 全站 grep + 三张截图证实 |
| M4 attn hover 示能 | **resolved** | 附注（整行下划线噪音）也已按建议抑制（a.row:hover） |
| M5 默认过滤矛盾 | **resolved** | 「改 brief」分支，显式呈报待 Gate 确认 |

**最终 disposition（评审者用词）：fix-then-ship** —— 5/5 material resolved，无 rebuild 级发现。

过程注记：主评审者会话在 M2 复判前 transcript 失效，M2 终判由新开的最小核验代理独立执行（只判该项，输入为文件与截图事实）——替代已按规则披露。最终 10 张截图全部摄于最终版本（13:04–13:07，晚于最后一次代码改动）。

## 待 production 阶段的验证项（本记录不替代）

按 workflow §8 完整顺序对最终 build 执行：type/lint/test → 状态与数据边界（含坏文件注入实测）→ 键盘/焦点/对比/axe → 响应式双端截图 → 关键旅程 E2E（晨检→详情→落账）。由独立 Verification 会话执行，不采信本记录结论。
