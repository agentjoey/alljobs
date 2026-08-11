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
): Promise<QuickAddState> {
  // 数据目录是服务端配置，不是客户端输入：server action 是公开 POST 端点，
  // 参数由请求体反序列化，绝不能把文件系统路径暴露成参数。测试经 env 注入。
  const dataDir = process.env.ALLJOBS_DATA_DIR ?? "data";
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
