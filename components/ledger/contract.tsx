/**
 * 方向契约：与 mockup/overview.html 首注释同文（THESIS…FINISH 六块 + seed）。
 * React 不渲染注释节点，故以 hidden div 承 HTML 注释置于 body 首子节点；
 * production build 后 `grep -r cda17d0d .next` 须命中。
 */
export const CONTRACT_COMMENT = `
THESIS: 多项目进度是一本按日记账的工作底账——每行一笔、每天一页、状态一枚戳；
拒绝品类默认的卡片网格 + 大数字统计 + 侧栏 SaaS 壳。
OWN-WORLD: eye-ease 绿账页纸（#ECF1E6）上的墨字（#1D211C）；红纵栏线分隔 mono 边距列与正文列；
蓝格线承行；状态=平印墨戳；agent=色标+墨字（色不载文字）；导航=页首索引标签；
无纹理、无做旧、全部平印；唯一倾斜与双圈属于今日日期戳。
STORY: Joey 晨检 30 秒——先看「需要注意」的红戳，再扫今日已记与各活跃项目的 NEXT，
随手在下一条空行落一笔账；任何 agent 改 data/ 的 md 文件即完成写入。
FIRST VIEWPORT: 页首 folio（ALLJOBS 戳 · 日期 · 活跃/卡住/今日计数 · 索引标签）；
其下对开双页：左页=需要注意 + 今日（快速添加空行为主操作），右页=活跃项目底账（P0 最上）。
FORM: 工作底账 The Working Ledger · 自有 grounded 列表第 6 位（assigned）· seed cda17d0d
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
