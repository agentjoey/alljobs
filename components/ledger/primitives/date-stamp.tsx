/** 今日标题：平台 large title（原账本世界的倾斜双圈日期戳），仅总览今日区使用 */
export function DateStamp({ date }: { date: string }) {
  return (
    <span className="datestamp" aria-hidden="true">
      {date}
      <small>今日</small>
    </span>
  );
}
