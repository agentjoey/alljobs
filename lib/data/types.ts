import type { z } from "zod";
import type { projectFrontmatterSchema, logLineSchema } from "./schema";

export type ProjectFrontmatter = z.infer<typeof projectFrontmatterSchema>;
export type LogLine = z.infer<typeof logLineSchema>;

/** 一个项目：frontmatter + slug + body 里解析出的 Now/Next/Notes */
export interface Project extends ProjectFrontmatter {
  slug: string;
  /** 源文件路径（相对或绝对，随 readLedger 入参） */
  file: string;
  /** `## Now` 段正文；缺段为 null */
  now: string | null;
  /** `## Next` 段的列表项（首条即总览 NEXT 列）；缺段为空数组 */
  next: string[];
  /** `## Notes` 段正文；缺段为 null */
  notes: string | null;
}

/** 一条日志：行内容 + 所属日期（取自文件名）与来源位置 */
export interface LogEntry extends LogLine {
  /** YYYY-MM-DD，来自日志文件名 */
  date: string;
  file: string;
  /** 1-based 行号 */
  line: number;
}

/** 任务项状态 */
export type TaskStatus = "todo" | "doing" | "done";

/** 任务项：解析自 data/tasks/<slug>.md 的 task list */
export interface TaskItem {
  status: TaskStatus;
  text: string;
  /** 1-based 行号 */
  line: number;
}

/** 单个项目的任务清单解析结果 */
export interface TaskBucket {
  items: TaskItem[];
  issues: ProofIssue[];
}

/** 「校对」清单条目：单文件/单行解析失败不抛出，收集于此 */
export interface ProofIssue {
  file: string;
  /** 1-based 行号（日志行错误时给出） */
  line?: number;
  /** 出问题的字段（frontmatter 校验失败时给出） */
  field?: string;
  message: string;
}

export interface LedgerData {
  projects: Project[];
  entries: LogEntry[];
  issues: ProofIssue[];
}
