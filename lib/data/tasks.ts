import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";
import type { TaskBucket, TaskItem, TaskStatus } from "./types";

export type { TaskItem, TaskStatus };

const TASK_LINE = /^-\s+\[(.)\]\s+(.+)$/;

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => join(dir, f));
}

function markerToStatus(marker: string): TaskStatus | null {
  if (marker === " ") return "todo";
  if (marker === "/") return "doing";
  if (marker === "x") return "done";
  return null;
}

/**
 * 读取 data/tasks/<slug>.md，按项目返回任务清单与校对问题。
 * 未知 slug、非法 marker、frontmatter/project 缺失都会进对应 bucket 的 issues。
 */
export function readTasks(dataDir: string, knownSlugs: Set<string>): Map<string, TaskBucket> {
  const dir = join(dataDir, "tasks");
  const buckets = new Map<string, TaskBucket>();

  for (const file of listMarkdown(dir)) {
    const slug = basename(file, ".md");
    const bucket: TaskBucket = { items: [], issues: [] };

    if (!knownSlugs.has(slug)) {
      bucket.issues.push({ file, message: `未知项目 slug：${slug}` });
    }

    const raw = readFileSync(file, "utf8");
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch (e) {
      bucket.issues.push({ file, message: `frontmatter 解析失败：${(e as Error).message}` });
      buckets.set(slug, bucket);
      continue;
    }
    const lineOffset = raw.split("\n").length - parsed.content.split("\n").length;

    const projectSlug = parsed.data?.project;
    if (typeof projectSlug !== "string" || projectSlug !== slug) {
      bucket.issues.push({
        file,
        field: "project",
        message: `frontmatter 须包含 project: ${slug}`,
      });
    }

    parsed.content.split("\n").forEach((rawLine, i) => {
      const lineNo = lineOffset + i + 1;
      const line = rawLine.trim();
      if (!line) return;
      const m = TASK_LINE.exec(line);
      if (!m) {
        bucket.issues.push({ file, line: lineNo, message: `无法解析的任务行：${line}` });
        return;
      }
      const status = markerToStatus(m[1]);
      if (status === null) {
        bucket.issues.push({ file, line: lineNo, message: `非法任务 marker：[${m[1]}]` });
        return;
      }
      bucket.items.push({ status, text: m[2].trim(), line: lineNo });
    });

    buckets.set(slug, bucket);
  }

  return buckets;
}
