import "server-only";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * 快速添加落账（server-only：node fs）。
 * 追加 `- HH:MM <slug> @<agent> <text>` 到 data/log/<今日>.md——
 * 文件不存在则创建（无 frontmatter，纯列表行）；时间为服务器本地时。
 * 容错定案与 read 层一致：校验/写盘失败都返回结构化结果，不抛出。
 */

export const quickAddInputSchema = z.object({
  text: z.string().min(1, "内容不能为空"),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "slug 须为小写字母/数字/连字符"),
  agent: z.enum(["joey", "claude", "codex", "kimi"]),
});

export interface AppendedEntry {
  date: string;
  time: string;
  slug: string;
  agent: string;
  text: string;
}

export type AppendResult =
  | { ok: true; entry: AppendedEntry; file: string }
  | { ok: false; kind: "validation"; message: string }
  | { ok: false; kind: "fs"; message: string; file: string };

const pad = (n: number) => String(n).padStart(2, "0");

export function appendLogEntry(
  input: { text: string; slug: string; agent: string },
  { dataDir = "data", now = new Date() }: { dataDir?: string; now?: Date } = {},
): AppendResult {
  // 行文法是单行：换行/连续空白折叠为空格再 trim，空文本在此现形
  const text = input.text.replace(/\s+/g, " ").trim();
  const parsed = quickAddInputSchema.safeParse({ slug: input.slug, agent: input.agent, text });
  if (!parsed.success) {
    return { ok: false, kind: "validation", message: parsed.error.issues[0]?.message ?? "输入校验失败" };
  }
  const { slug, agent } = parsed.data;
  // slug 必须存在于 data/projects（与 read 层「未知 slug 进校对」对齐：写侧直接拒）
  if (!existsSync(join(dataDir, "projects", `${slug}.md`))) {
    return { ok: false, kind: "validation", message: `未知项目 slug：${slug}` };
  }
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const file = join(dataDir, "log", `${date}.md`);
  const line = `- ${time} ${slug} @${agent} ${text}`;
  try {
    mkdirSync(join(dataDir, "log"), { recursive: true });
    // 手写的既有文件可能末尾无换行：先补一个，保证新行独立成行
    const needsBreak =
      existsSync(file) && statSync(file).isFile() && !readFileSync(file, "utf8").endsWith("\n");
    appendFileSync(file, (needsBreak ? "\n" : "") + line + "\n", "utf8");
  } catch (e) {
    return { ok: false, kind: "fs", message: (e as Error).message, file };
  }
  return { ok: true, entry: { date, time, slug, agent, text }, file };
}
