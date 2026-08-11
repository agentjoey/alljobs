import { formatMmDd } from "../lib";

/**
 * 14 日划记格：sequential 单色（t0→t4，单日封顶 4）。
 * aria 文本与 tooltip 全部由数据生成（杜绝手写数字漂移）。
 */
export function Tally({
  counts,
  dates,
  total,
}: {
  /** 最旧 → 今日，长度 14，值 0–4（4 = ≥4） */
  counts: number[];
  /** 与 counts 对齐的 YYYY-MM-DD */
  dates: string[];
  /** 窗口内真实总条数（不封顶） */
  total: number;
}) {
  const label =
    total === 0 ? "近 14 天无记录" : `近 14 天 ${total} 条记录`;
  return (
    <span className="tally" role="img" aria-label={label}>
      {counts.map((v, i) => (
        <i
          key={dates[i]}
          data-v={v > 0 ? v : undefined}
          title={`${formatMmDd(dates[i] ?? "")} · ${v >= 4 ? "4+" : v} 笔`}
        />
      ))}
    </span>
  );
}
