"use server";

import { revalidatePath } from "next/cache";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MARKERS: Record<string, string> = {
  todo: " ",
  doing: "/",
  done: "x",
};

export type MoveTaskState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "validation"; message: string }
  | { status: "fs"; file: string; message: string };

export async function moveTask(
  _prev: MoveTaskState,
  formData: FormData,
): Promise<MoveTaskState> {
  const slug = String(formData.get("slug") ?? "");
  const line = Number(formData.get("line") ?? NaN);
  const newStatus = String(formData.get("newStatus") ?? "");

  // slug 格式与 appendLogEntry（lib/data/append.ts）同一正则：server action 是公开 POST
  // 端点，参数由请求体反序列化而来，不能信任其只包含 UI 呈现过的合法值——不校验格式，
  // "../../etc/passwd" 这类 slug 能让下面的 join() 逃出 data/tasks/ 目录。
  if (
    !slug ||
    !/^[a-z0-9][a-z0-9-]*$/.test(slug) ||
    Number.isNaN(line) ||
    !line ||
    !MARKERS[newStatus]
  ) {
    return { status: "validation", message: "参数非法" };
  }

  const dataDir = process.env.ALLJOBS_DATA_DIR ?? "data";
  const file = join(dataDir, "tasks", `${slug}.md`);
  if (!existsSync(join(dataDir, "projects", `${slug}.md`))) {
    return { status: "validation", message: `未知项目 slug：${slug}` };
  }
  try {
    const raw = readFileSync(file, "utf8");
    const lines = raw.split("\n");
    const idx = line - 1;
    if (idx < 0 || idx >= lines.length) {
      return { status: "validation", message: "行号越界" };
    }
    const original = lines[idx];
    const marker = MARKERS[newStatus];
    const replaced = original.replace(/^(-\s+\[)[xX\s\/\\](\]\s+)/, `$1${marker}$2`);
    if (replaced === original) {
      return { status: "validation", message: "无法识别的任务行格式" };
    }
    lines[idx] = replaced;
    writeFileSync(file, lines.join("\n"), "utf8");
  } catch (e) {
    return {
      status: "fs",
      file,
      message: (e as Error).message,
    };
  }

  revalidatePath("/board");
  return { status: "success" };
}
