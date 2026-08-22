/**
 * 方向契约 HTML 注释（§8）。
 * React 不渲染注释节点，故以 hidden div 承载并置于 body 首子节点。
 * seed: 755ffb78
 */
export const CONTRACT_COMMENT = `
THESIS: 一台 Apple 原生生产力工具形态的个人工作台——信息架构即 Finder/备忘录三栏，总览即「今天」智能列表；拒绝 v1 的账本隐喻与任何网页式 dashboard 卡阵。
OWN-WORLD: macOS 浅色系：#F5F5F7 底、白内容面、#6E6E73 次级文字、#0066CC 链接/#007AFF 控件，SF 系统字体栈，10px 连续圆角，hairline 分隔线，分段控件与源列表为原生语法。
STORY: Joey 打开「今天」，30 秒内看到注意力清单（blocked/逾期/停滞）与今日时间线，一键落账；侧栏随时下钻任何项目。
FIRST VIEWPORT: 左源列表（智能列表+项目分组），主区顶部工具栏（标题+⌘N 落账），注意力清单元顶，下接今日时间线。
FORM: Apple HIG Operate 三栏（用户 pin，骰选让位），seed 755ffb78。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
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
