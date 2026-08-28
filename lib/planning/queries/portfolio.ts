import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProjectRegistryEntry, Task } from "../domain/types";
import { NativePlanningStore } from "../native/store";
import { getLogDir } from "../paths";
import { type AttentionItem } from "./attention";
import { getProjectDetail } from "./project";

export interface PortfolioKPIs {
  activeProjects: number;
  ongoingWork: number;
  attentionRequired: number;
  completedRecent: number;
}

export interface PortfolioOverview {
  projects: ProjectRegistryEntry[];
  ongoingTasks: Task[];
  attentionItems: AttentionItem[];
  kpis: PortfolioKPIs;
}

const RECENT_COMPLETION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Tasks carry no completion timestamp; the activity log is the only
 * time-ordered record of a task reaching `done`, so "recent completions"
 * are counted from TASK_CREATED/TASK_UPDATED events in the last 30 days.
 */
async function countRecentCompletions(root: string | undefined): Promise<number> {
  const logFile = resolve(getLogDir(root), "activity.jsonl");
  let raw: string;
  try {
    raw = await readFile(logFile, "utf8");
  } catch {
    return 0;
  }

  const since = Date.now() - RECENT_COMPLETION_WINDOW_MS;
  let count = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const timestamp = Date.parse(entry?.timestamp);
      if (!Number.isFinite(timestamp) || timestamp < since) continue;
      if (
        (entry.type === "TASK_UPDATED" && entry.details?.patch?.status === "done") ||
        (entry.type === "TASK_CREATED" && entry.details?.status === "done")
      ) {
        count++;
      }
    } catch {
      // Skip malformed log lines
    }
  }
  return count;
}

export async function getPortfolioOverview(
  options: { root?: string; cacheDir?: string } = {}
): Promise<PortfolioOverview> {
  const store = new NativePlanningStore(options.root);
  const allProjects = await store.listProjects();
  const activeProjects = allProjects.filter(p => !p.archived);

  const ongoingTasks: Task[] = [];
  const attentionItems: AttentionItem[] = [];

  for (const p of activeProjects) {
    const detail = await getProjectDetail(p.slug, options);
    if (!detail) continue;

    for (const t of detail.tasks) {
      if (t.status === "doing" || t.status === "blocked" || t.status === "waiting") {
        ongoingTasks.push(t);
      }
    }

    attentionItems.push(...detail.attention);
  }

  const completedRecent = await countRecentCompletions(options.root);

  return {
    projects: activeProjects,
    ongoingTasks,
    attentionItems,
    kpis: {
      activeProjects: activeProjects.length,
      ongoingWork: ongoingTasks.length,
      attentionRequired: attentionItems.length,
      completedRecent
    }
  };
}
