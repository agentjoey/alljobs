/** 页脚：data/ 即真相 */
export function Footer({ left, right }: { left: string; right: string }) {
  return (
    <footer className="footer">
      <span>{left}</span>
      <span>{right}</span>
    </footer>
  );
}
