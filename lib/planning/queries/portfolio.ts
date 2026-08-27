import type { ProjectRegistryEntry, Task } from "../domain/types";
import { NativePlanningStore } from "../native/store";
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

export async function getPortfolioOverview(
  options: { root?: string; cacheDir?: string } = {}
): Promise<PortfolioOverview> {
  const store = new NativePlanningStore(options.root);
  const allProjects = await store.listProjects();
  const activeProjects = allProjects.filter(p => !p.archived);

  const ongoingTasks: Task[] = [];
  const attentionItems: AttentionItem[] = [];
  let completedRecent = 0;

  for (const p of activeProjects) {
    const detail = await getProjectDetail(p.slug, options);
    if (!detail) continue;

    for (const t of detail.tasks) {
      if (t.status === "doing" || t.status === "blocked" || t.status === "waiting") {
        ongoingTasks.push(t);
      } else if (t.status === "done") {
        completedRecent++;
      }
    }

    attentionItems.push(...detail.attention);
  }

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
