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
import { analyzeBacklogOrdering, type BacklogOrderingState } from "../backlog/ordering";
import { deriveAttentionItems, type AttentionItem } from "./attention";

export interface ProjectDetailMetrics {
  activeTasks: number;
  totalBacklog: number;
  doneCount: number;
  blockedCount: number;
}

export interface BacklogControlBlocker {
  code: string;
  message: string;
}

export interface BacklogControlState {
  source: PlanningSourceState;
  ordering: BacklogOrderingState;
  writable: boolean;
  blockers: BacklogControlBlocker[];
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
  backlogControl?: BacklogControlState;
  metrics: ProjectDetailMetrics;
  digest: string;
}

function sourceDigest(provenance: SourceProvenance[], location: string) {
  return provenance.find((entry) => entry.location === location)?.digest;
}

function isBacklogControlIssue(issue: ProofIssue, backlogIds: Set<string>) {
  return issue.scope === "document" || Boolean(issue.objectId && backlogIds.has(issue.objectId));
}

function deriveBacklogControlState(input: {
  project: ProjectRegistryEntry;
  backlog: BacklogItem[];
  issues: ProofIssue[];
  source: PlanningSourceState;
}): BacklogControlState {
  const { project, backlog, issues, source } = input;
  const ordering = analyzeBacklogOrdering(backlog).state;
  const blockers: BacklogControlBlocker[] = [];
  const backlogIds = new Set(backlog.map((item) => item.id));
  const controlIssues = issues.filter((issue) => isBacklogControlIssue(issue, backlogIds));

  if (project.archived) {
    blockers.push({ code: "PROJECT_ARCHIVED", message: "Archived projects cannot change Backlog ordering." });
  }
  if (!source.writable) {
    blockers.push({
      code: "SOURCE_NOT_WRITABLE",
      message: source.reason ?? "The current planning source is read-only."
    });
  }
  for (const issue of controlIssues) {
    blockers.push({ code: issue.code, message: issue.message });
  }
  if (ordering === "uninitialized") {
    blockers.push({
      code: "ORDERING_NOT_INITIALIZED",
      message: "Active Backlog items need rank initialization before ordered moves are available."
    });
  } else if (ordering === "repair-required") {
    blockers.push({
      code: "RANK_CONFLICT",
      message: "Duplicate active ranks require a lane repair before ordinary ordered moves."
    });
  }

  return {
    source,
    ordering,
    writable: !project.archived && source.writable && controlIssues.length === 0,
    blockers
  };
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
      planningSource = {
        mode: "cached",
        writable: false,
        reason: "Control Host configuration is unavailable; this view is read-only.",
        headRevision: projection?.revision,
        roadmapDigest: sourceDigest(provenance, "docs/ROADMAP.md"),
        backlogDigest: sourceDigest(provenance, "docs/BACKLOG.md"),
        readAt: new Date().toISOString()
      };
      backlogDigest = planningSource.backlogDigest;
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
  const backlogControl = project.type === "code" && planningSource
    ? deriveBacklogControlState({ project, backlog, issues, source: planningSource })
    : undefined;

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
    backlogControl,
    metrics: {
      activeTasks,
      totalBacklog: backlog.length,
      doneCount,
      blockedCount
    },
    digest: tasksDigest
  };
}
