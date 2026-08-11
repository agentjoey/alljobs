/** 签名元素：今日日期戳（全站唯一的倾斜与双圈），仅总览今日区使用 */
export function DateStamp({ date }: { date: string }) {
  return (
    <span className="datestamp" aria-hidden="true">
      {date.replace(/-/g, "·")}
      <small>今日</small>
    </span>
  );
}
