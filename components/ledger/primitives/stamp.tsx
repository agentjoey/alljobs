import type { ReactNode } from "react";

/** 状态戳：文字 + 墨色（色不单独承义）。kind: active|blocked|paused|done|due|stale */
export function Stamp({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`stamp ${kind}`}>{children}</span>;
}
