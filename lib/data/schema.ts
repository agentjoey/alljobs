import { z } from "zod";

/** YYYY-MM-DD，且必须是真实存在的日历日期。容错：js-yaml 会把未加引号的日期解析成 Date（UTC 零点），统一转回字符串 */
export const dateSchema = z.preprocess(
  (v) => {
    if (v instanceof Date) {
      const p = (n: number) => String(n).padStart(2, "0");
      return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
    }
    return v;
  },
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日期须为 YYYY-MM-DD 格式")
    .refine((s) => {
      const [y, m, d] = s.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    }, "日期不存在"),
);

/** HH:MM，24 小时制 */
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间须为 HH:MM（24 小时制）");

export const projectTypeSchema = z.enum(["code", "product", "biz", "ops"]);
export const projectStatusSchema = z.enum(["active", "blocked", "paused", "done"]);
export const prioritySchema = z.enum(["P0", "P1", "P2"]);

export const linksSchema = z.object({
  repo: z.string().min(1).optional(),
  obsidian: z.string().min(1).optional(),
  folder: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
});

/** data/projects/<slug>.md 的 frontmatter（canonical schema 见 data/README.md） */
export const projectFrontmatterSchema = z
  .object({
    title: z.string().min(1),
    type: projectTypeSchema,
    status: projectStatusSchema,
    priority: prioritySchema,
    agents: z.array(z.string().min(1)).min(1),
    links: linksSchema.optional(),
    tags: z.array(z.string()).default([]),
    started: dateSchema,
    due: dateSchema.optional(),
    blocked_reason: z.string().min(1).optional(),
    blocked_since: dateSchema.optional(),
  })
  .refine((v) => v.status !== "blocked" || v.blocked_reason !== undefined, {
    message: "status=blocked 时 blocked_reason 必填",
    path: ["blocked_reason"],
  });

export const logKindSchema = z.enum(["session"]);

/** 日志行文法 `- HH:MM <slug> @<agent> [kind] <text>` 解析出的单行 */
export const logLineSchema = z.object({
  time: timeSchema,
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "slug 须为小写字母/数字/连字符"),
  agent: z.string().min(1),
  kind: logKindSchema.nullable().default(null),
  text: z.string().min(1),
});
