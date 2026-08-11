/**
 * 方向契约：与 mockup/overview.html 首注释同文（THESIS…FINISH 六块 + seed）。
 * React 不渲染注释节点，故以 hidden div 承 HTML 注释置于 body 首子节点；
 * production build 后 `grep -r cda17d0d .next` 须命中。
 */
export const CONTRACT_COMMENT = `
THESIS: 多项目进度是一份系统级分组清单——状态是胶囊、每组是一张卡、导航浮在内容之上；
拒绝品类默认的仪表盘网格与装饰性图表。
OWN-WORLD: 平台语义色系统（分组底 #F2F2F7 / 卡面 #FFF，深色 #000 / #1C1C1E），
系统字体 SF（-apple-system）与 SF Mono 数据声部；功能层唯一玻璃=顶栏（blur 30px · saturate 180%），
内容层一律不透明卡片 + 自文字前缘起的发丝分隔线；强调色仅用于可交互与主行动；
状态=着色胶囊（色+文字双编码）；agent=色标+文字；外观随系统明暗切换，无 app 内主题开关。
STORY: Joey 晨检 30 秒——先看「需要注意」的胶囊，再扫今日已记与各活跃项目的 NEXT，
随手在快速添加行落一笔账；任何 agent 改 data/ 的 md 文件即完成写入。
FIRST VIEWPORT: 玻璃顶栏（ALLJOBS · 日期 · 活跃/卡住/今日计数 · 分段控件）；
其下双栏：左栏=需要注意 + 今日 large title 与快速添加，右栏=活跃项目分组卡（P0 最上）。
FORM: Apple HIG（skill: apple-design · references/hig）· 方向由 Human Owner 指定（pinned）
· 前身「工作底账 The Working Ledger」seed cda17d0d 保留于 .agent 记录与 mockup/
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
`;

export function ContractComment() {
  return (
    <div
      id="direction-contract"
      hidden
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: `<!--${CONTRACT_COMMENT}-->` }}
    />
  );
}
