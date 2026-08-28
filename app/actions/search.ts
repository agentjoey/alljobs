"use server";

import type { ActionResult } from "./action-result";
import { errorResult, successResult } from "./action-result";
import { getPortfolioOverview } from "@/lib/planning/queries/portfolio";
import { getProjectDetail } from "@/lib/planning/queries/project";

export interface SearchProjectHit {
  slug: string;
  name: string;
  type: string;
  href: string;
}

export interface SearchTaskHit {
  id: string;
  title: string;
  project: string;
  status: string;
  href: string;
}

export interface SearchBacklogHit {
  id: string;
  title: string;
  project: string;
  href: string;
}

export interface SearchResults {
  projects: SearchProjectHit[];
  tasks: SearchTaskHit[];
  backlog: SearchBacklogHit[];
}

const EMPTY: SearchResults = { projects: [], tasks: [], backlog: [] };
const MAX_PER_GROUP = 8;

export async function searchPlanningAction(
  query: string
): Promise<ActionResult<SearchResults>> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    return successResult(EMPTY, "Query too short");
  }

  try {
    const overview = await getPortfolioOverview();

    const projects: SearchProjectHit[] = overview.projects
      .filter(p => p.slug.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, MAX_PER_GROUP)
      .map(p => ({ slug: p.slug, name: p.name, type: p.type, href: `/projects/${p.slug}` }));

    const tasks: SearchTaskHit[] = [];
    const backlog: SearchBacklogHit[] = [];

    const details = await Promise.all(
      overview.projects.map(p => getProjectDetail(p.slug).catch(() => null))
    );

    for (const detail of details) {
      if (!detail) continue;
      for (const t of detail.tasks) {
        if (tasks.length >= MAX_PER_GROUP) break;
        if (t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)) {
          tasks.push({
            id: t.id,
            title: t.title,
            project: t.project,
            status: t.status,
            href: `/projects/${t.project}`
          });
        }
      }
      for (const b of detail.backlog) {
        if (backlog.length >= MAX_PER_GROUP) break;
        if (b.id.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)) {
          backlog.push({
            id: b.id,
            title: b.title,
            project: detail.project.slug,
            href: `/projects/${detail.project.slug}`
          });
        }
      }
    }

    return successResult({ projects, tasks, backlog }, "Search complete");
  } catch {
    // Search is read-only best-effort; never surface internal errors to the shell.
    return errorResult("Search is temporarily unavailable", "SEARCH_ERROR");
  }
}
