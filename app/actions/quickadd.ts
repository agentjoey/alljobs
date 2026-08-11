"use server";

import { refresh } from "next/cache";
import { appendLogEntry, type AppendedEntry } from "../../lib/data/append";

/**
 * 快速添加日志（T3）：真实 <form> 提交，回车即落账。
 * 校验失败 → validation（行内提示）；写盘失败 → fs（proof 风格错误，不抛 500）；
 * 成功 → refresh() 让同一响应带回重渲染后的页面（页面均 force-dynamic，重渲染即重读 data/）。
 */
export type QuickAddState =
  | { status: "idle" }
  | { status: "validation" }
  | { status: "fs"; file: string; message: string }
  | { status: "success"; entry: AppendedEntry };

export async function quickAdd(
  _prev: QuickAddState,
  formData: FormData,
  dataDir = "data",
): Promise<QuickAddState> {
  const result = appendLogEntry(
    {
      text: String(formData.get("text") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      agent: String(formData.get("agent") ?? ""),
    },
    { dataDir, now: new Date() },
  );
  if (!result.ok) {
    return result.kind === "fs"
      ? { status: "fs", file: result.file, message: result.message }
      : { status: "validation" };
  }
  refresh();
  return { status: "success", entry: result.entry };
}
