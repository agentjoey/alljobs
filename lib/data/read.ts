import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { dateSchema, logKindSchema, logLineSchema, projectFrontmatterSchema } from "./schema";
import type { LedgerData, LogEntry, Project, ProofIssue } from "./types";

/**
 * 读取整个 data/ 目录（server-only：使用 node fs）。
 * 容错：单文件/单行解析失败不抛出，收集为 ProofIssue（「校对」清单），其余照常。
 */
export function readLedger(dataDir = "data"): LedgerData {
  const issues: ProofIssue[] = [];
  const projects = readProjects(join(dataDir, "projects"), issues);
  const knownSlugs = new Set(projects.map((p) => p.slug));
  const entries = readLogs(join(dataDir, "log"), knownSlugs, issues);
  return { projects, entries, issues };
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => join(dir, f));
}

function readProjects(dir: string, issues: ProofIssue[]): Project[] {
  const projects: Project[] = [];
  for (const file of listMarkdown(dir)) {
    const slug = basename(file, ".md");
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(readFileSync(file, "utf8"));
    } catch (e) {
      issues.push({ file, message: `frontmatter 解析失败：${(e as Error).message}` });
      continue;
    }
    const r = projectFrontmatterSchema.safeParse(parsed.data);
    if (!r.success) {
      const first = r.error.issues[0];
      issues.push({
        file,
        field: first?.path.join(".") || undefined,
        message: first?.message ?? "frontmatter 校验失败",
      });
      continue;
    }
    const body = parseBody(parsed.content);
    projects.push({ slug, file, ...r.data, ...body });
  }
  return projects;
}

/** 从 markdown body 提取 `## Now` / `## Next` / `## Notes` 三段 */
function parseBody(content: string): Pick<Project, "now" | "next" | "notes"> {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of content.split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      current = m[1].toLowerCase();
      sections[current] ??= [];
    } else if (current) {
      sections[current].push(line);
    }
  }
  const text = (key: string) => (sections[key] ?? []).join("\n").trim() || null;
  const next = (sections["next"] ?? [])
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
  return { now: text("now"), next, notes: text("notes") };
}

/** 行文法：`- HH:MM <slug> @<agent> [kind] <text>` */
const LOG_LINE = /^-\s+(\d{2}:\d{2})\s+([a-z0-9][a-z0-9-]*)\s+@(\S+)(?:\s+\[(\w+)\])?\s+(.+)$/;

function readLogs(dir: string, knownSlugs: Set<string>, issues: ProofIssue[]): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const file of listMarkdown(dir)) {
    const date = basename(file, ".md");
    if (!dateSchema.safeParse(date).success) {
      issues.push({ file, message: "日志文件名须为 YYYY-MM-DD.md，已跳过" });
      continue;
    }
    const raw = readFileSync(file, "utf8");
    // brief：日志 frontmatter 可省、也可存在——先剥离再逐行解析。
    // 行号必须按原文件真实行号计（校对清单要指对行），故记录被剥离的行数作偏移。
    let body = raw;
    let lineOffset = 0;
    try {
      const parsed = matter(raw);
      body = parsed.content;
      lineOffset = raw.split("\n").length - body.split("\n").length;
    } catch {
      // frontmatter 损坏：按原文逐行解析，坏行自然会进 ProofIssue
    }
    body.split("\n").forEach((rawLine, i) => {
      const lineNo = lineOffset + i + 1;
      const line = rawLine.trim();
      if (!line) return;
      const m = LOG_LINE.exec(line);
      if (!m) {
        issues.push({ file, line: lineNo, message: `无法解析的日志行：${line}` });
        return;
      }
      const rawKind = m[4];
      let kind: string | null = null;
      if (rawKind !== undefined) {
        const kr = logKindSchema.safeParse(rawKind);
        if (!kr.success) {
          issues.push({
            file,
            line: lineNo,
            field: "kind",
            message: `未知日志 kind：${rawKind}`,
          });
        } else {
          kind = kr.data;
        }
      }
      const r = logLineSchema.safeParse({ time: m[1], slug: m[2], agent: m[3], kind, text: m[5] });
      if (!r.success) {
        const first = r.error.issues[0];
        issues.push({
          file,
          line: lineNo,
          field: first?.path.join(".") || undefined,
          message: first?.message ?? "日志行校验失败",
        });
        return;
      }
      if (!knownSlugs.has(r.data.slug)) {
        issues.push({ file, line: lineNo, field: "slug", message: `未知项目 slug：${r.data.slug}` });
      }
      entries.push({ ...r.data, date, file, line: lineNo });
    });
  }
  return entries;
}
