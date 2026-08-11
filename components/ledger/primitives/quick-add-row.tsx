/**
 * 快速添加占位行：今日区的下一条空格线。
 * T2 只交付形制（视觉规格即 mockup）；行为（server action / 校验 / 落账动效）由 T3 接线。
 */
export function QuickAddRow({ slugs }: { slugs: string[] }) {
  return (
    <form className="row quickadd" aria-label="快速添加日志">
      <span className="margin" aria-hidden="true">
        —:—
      </span>
      <span className="body">
        <input type="text" placeholder="记一笔…（回车落账）" aria-label="日志内容" disabled />
        <select aria-label="项目" disabled defaultValue="">
          <option value="" disabled>
            选择项目…
          </option>
          {slugs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select aria-label="记录者" disabled defaultValue="joey">
          {["joey", "claude", "codex", "kimi"].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button className="btn-stamp" type="button" disabled>
          落账
        </button>
      </span>
    </form>
  );
}
