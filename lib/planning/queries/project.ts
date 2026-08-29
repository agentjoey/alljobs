import type {
  BacklogItem,
  ProjectRegistryEntry,
  ProofIssue,
  RoadmapItem,
  Task
} from "../domain/types";
import { loadControlHostConfig, type ControlHostResolvedPaths } from "../config";
import { validateProjectRelations } from "../domain/relations";
import { NativePlanningStore } from "../native/store";
import type { PlanningSourceState, SourceProvenance } from "../providers/contracts";
import { NodeGitRunner } from "../providers/git-runner";
import { getCachedProjection } from "../providers/refresh";
import { resolveCodePlanning } from "../providers/source-resolver";
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
  planningSource?: PlanningSourceState;
  backlogDigest?: string;
  metrics: ProjectDetailMetrics;
  digest: string;
}

/**
 * Resolves where the refresh worker's projections live. Web callers pass no
 * options, so fall back to the control-host config; if it is missing the
 * projection simply stays null instead of throwing.
 */
function resolveCacheDir(options: { root?: string; cacheDir?: string }): string | undefined {
  if (options.cacheDir) return options.cacheDir;
  if (options.root) return `${options.root}/cache`;
  try {
    return loadControlHostConfig().cacheDir;
  } catch {
    return undefined;
  }
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
  const issues: ProofIssue[] = [...taskIssues];
  let provenance: SourceProvenance[] = [];
  let planningSource: PlanningSourceState | undefined;
  let backlogDigest: string | undefined;
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
    let resolvedPaths: ControlHostResolvedPaths | undefined;
    try {
      resolvedPaths = loadControlHostConfig(options.root);
    } catch {
      // Preserve the existing cache-only read behavior when the host config is
      // unavailable to this caller; direct local reads always require config.
      const cacheDir = resolveCacheDir(options);
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
    if (resolvedPaths) {
      const paths = options.cacheDir ? { ...resolvedPaths, cacheDir: options.cacheDir } : resolvedPaths;
      const resolved = await resolveCodePlanning({ project, paths, gitRunner: new NodeGitRunner() });
      projection = resolved.projection;
      planningSource = resolved.source;
      backlogDigest = resolved.source.backlogDigest;
      roadmap = projection.roadmap;
      backlog = projection.backlog;
      issues.push(...projection.issues);
      provenance = projection.provenance;
    }
  }

  // Combine tasks
  const allTasks = [...nativeTasks];

  // Native roadmap/tasks never went through the git provider's relation
  // validation; run it here and merge (deduped) issues into the detail result
  const relationResult = validateProjectRelations({
    project,
    roadmapItems: roadmap,
    backlogItems: backlog,
    tasks: allTasks,
    sourcePath: project.type === "business" ? `data/roadmaps/${slug}.md` : "native"
  });
  for (const issue of relationResult.issues) {
    const duplicate = issues.some(
      i => i.code === issue.code && i.objectId === issue.objectId && i.field === issue.field
    );
    if (!duplicate) issues.push(issue);
  }

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
    planningSource,
    backlogDigest,
    metrics: {
      activeTasks,
      totalBacklog: backlog.length,
      doneCount,
      blockedCount
    },
    digest: tasksDigest
  };
}
