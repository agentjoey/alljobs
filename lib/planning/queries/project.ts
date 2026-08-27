import type {
  BacklogItem,
  ProjectRegistryEntry,
  ProofIssue,
  RoadmapItem,
  Task
} from "../domain/types";
import { NativePlanningStore } from "../native/store";
import type { SourceProvenance } from "../providers/contracts";
import { getCachedProjection } from "../providers/refresh";
import { deriveAttentionItems, type AttentionItem } from "./attention";

export interface ProjectDetailMetrics {
  activeTasks: number;
  totalBacklog: number;
  doneCount: number;
  blockedCount: number;
}

export interface ProjectDetailView {
  project: ProjectRegistryEntry;
  roadmap: RoadmapItem[];
  backlog: BacklogItem[];
  tasks: Task[];
  issues: ProofIssue[];
  attention: AttentionItem[];
  provenance: SourceProvenance[];
  metrics: ProjectDetailMetrics;
  digest: string;
}

export async function getProjectDetail(
  slug: string,
  options: { root?: string; cacheDir?: string } = {}
): Promise<ProjectDetailView | null> {
  const store = new NativePlanningStore(options.root);
  const project = await store.getProject(slug);
  if (!project) return null;

  const { tasks: nativeTasks, digest: tasksDigest, issues: taskIssues } = await store.readTasks(slug);

  let roadmap: RoadmapItem[] = [];
  let backlog: BacklogItem[] = [];
  let issues: ProofIssue[] = [...taskIssues];
  let provenance: SourceProvenance[] = [];
  let projection = null;

  if (project.type === "business") {
    const { items: bizRoadmap, digest: rDigest, issues: rIssues } = await store.readRoadmap(slug);
    roadmap = bizRoadmap;
    issues.push(...rIssues);
    provenance.push({
      provider: "native",
      location: `data/roadmaps/${slug}.md`,
      revision: "native",
      digest: rDigest,
      fetchedAt: new Date().toISOString()
    });
  } else {
    // Code project: load cached projection
    const cacheDir = options.cacheDir || (options.root ? `${options.root}/cache` : undefined);
    if (cacheDir) {
      projection = await getCachedProjection(slug, cacheDir);
      if (projection) {
        roadmap = projection.roadmap;
        backlog = projection.backlog;
        issues.push(...projection.issues);
        provenance = projection.provenance;
      }
    }
  }

  // Combine tasks
  const allTasks = [...nativeTasks];

  const attention = deriveAttentionItems({
    project: slug,
    tasks: allTasks,
    issues,
    projection
  });

  const activeTasks = allTasks.filter(t => t.status === "doing" || t.status === "todo" || t.status === "waiting").length;
  const doneCount = allTasks.filter(t => t.status === "done").length;
  const blockedCount = allTasks.filter(t => t.status === "blocked").length;

  return {
    project,
    roadmap,
    backlog,
    tasks: allTasks,
    issues,
    attention,
    provenance,
    metrics: {
      activeTasks,
      totalBacklog: backlog.length,
      doneCount,
      blockedCount
    },
    digest: tasksDigest
  };
}
