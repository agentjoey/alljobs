import type {
  BacklogItem,
  ProjectRegistryEntry,
  ProofIssue,
  RoadmapItem,
  Task,
  ValidationResult
} from "./types";

export interface ProjectPlanningData {
  project: ProjectRegistryEntry;
  roadmapItems: RoadmapItem[];
  backlogItems: BacklogItem[];
  tasks: Task[];
  sourcePath?: string;
}

export function validateProjectRelations(data: ProjectPlanningData): ValidationResult<{
  roadmapItems: RoadmapItem[];
  backlogItems: BacklogItem[];
  tasks: Task[];
}> {
  const issues: ProofIssue[] = [];
  const { project, roadmapItems, backlogItems, tasks, sourcePath = "" } = data;

  // Valid-object filtering must match issues by (collection, id): a task issue
  // must not exclude a roadmap item that happens to share the same id.
  const roadmapIssueIds = new Set<string>();
  const backlogIssueIds = new Set<string>();
  const taskIssueIds = new Set<string>();

  // 1. Roadmap item order uniqueness
  const orderSet = new Set<number>();
  for (const item of roadmapItems) {
    if (orderSet.has(item.order)) {
      issues.push({
        scope: "relation",
        code: "DUPLICATE_ROADMAP_ORDER",
        sourcePath,
        objectId: item.id,
        field: "order",
        message: `Duplicate roadmap order ${item.order} on item "${item.id}"`
      });
      roadmapIssueIds.add(item.id);
    }
    orderSet.add(item.order);

    // Kind vs Project Type check
    if (project.type === "code" && item.kind !== "phase") {
      issues.push({
        scope: "object",
        code: "INVALID_ROADMAP_KIND",
        sourcePath,
        objectId: item.id,
        field: "kind",
        message: `Code project "${project.slug}" roadmap items must have kind "phase", found "${item.kind}"`
      });
      roadmapIssueIds.add(item.id);
    } else if (project.type === "business" && item.kind !== "milestone") {
      issues.push({
        scope: "object",
        code: "INVALID_ROADMAP_KIND",
        sourcePath,
        objectId: item.id,
        field: "kind",
        message: `Business project "${project.slug}" roadmap items must have kind "milestone", found "${item.kind}"`
      });
      roadmapIssueIds.add(item.id);
    }
  }

  // 2. Primary focus check: at most one active item can be primary
  const primaryActive = roadmapItems.filter(i => i.status === "active" && i.focus === "primary");
  if (primaryActive.length > 1) {
    for (const item of primaryActive) {
      issues.push({
        scope: "relation",
        code: "MULTIPLE_PRIMARY_FOCUS",
        sourcePath,
        objectId: item.id,
        field: "focus",
        message: `Multiple active roadmap items marked focus: primary in project "${project.slug}"`
      });
      roadmapIssueIds.add(item.id);
    }
  }

  // 3. Business projects cannot have Backlog
  if (project.type === "business" && backlogItems.length > 0) {
    for (const b of backlogItems) {
      issues.push({
        scope: "document",
        code: "BUSINESS_BACKLOG_REJECTED",
        sourcePath,
        objectId: b.id,
        message: `Business project "${project.slug}" does not support Backlog items`
      });
      backlogIssueIds.add(b.id);
    }
  }

  // 4. Backlog phase references and dependencies
  const roadmapIdSet = new Set(roadmapItems.map(r => r.id));
  const backlogMap = new Map(backlogItems.map(b => [b.id, b]));

  for (const b of backlogItems) {
    if (b.phase && !roadmapIdSet.has(b.phase)) {
      issues.push({
        scope: "relation",
        code: "MISSING_PHASE_REFERENCE",
        sourcePath,
        objectId: b.id,
        field: "phase",
        message: `Backlog item "${b.id}" references missing or foreign phase "${b.phase}"`
      });
      backlogIssueIds.add(b.id);
    }

    // Dependencies checks
    for (const depId of b.dependencies) {
      if (depId === b.id) {
        issues.push({
          scope: "relation",
          code: "SELF_DEPENDENCY",
          sourcePath,
          objectId: b.id,
          field: "dependencies",
          message: `Backlog item "${b.id}" cannot depend on itself`
        });
        backlogIssueIds.add(b.id);
      } else if (!backlogMap.has(depId)) {
        issues.push({
          scope: "relation",
          code: "MISSING_BACKLOG_DEPENDENCY",
          sourcePath,
          objectId: b.id,
          field: "dependencies",
          message: `Backlog item "${b.id}" references non-existent dependency "${depId}"`
        });
        backlogIssueIds.add(b.id);
      }
    }
  }

  // Check for dependency cycles in Backlog
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function detectCycle(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;

    visited.add(id);
    inStack.add(id);

    const item = backlogMap.get(id);
    if (item) {
      for (const depId of item.dependencies) {
        if (detectCycle(depId)) return true;
      }
    }

    inStack.delete(id);
    return false;
  }

  for (const b of backlogItems) {
    if (!visited.has(b.id)) {
      if (detectCycle(b.id)) {
        issues.push({
          scope: "relation",
          code: "DEPENDENCY_CYCLE",
          sourcePath,
          objectId: b.id,
          field: "dependencies",
          message: `Dependency cycle detected involving Backlog item "${b.id}"`
        });
        backlogIssueIds.add(b.id);
      }
    }
  }

  // 5. Tasks relations validation
  for (const t of tasks) {
    if (t.project !== project.slug) {
      issues.push({
        scope: "relation",
        code: "TASK_PROJECT_MISMATCH",
        sourcePath,
        objectId: t.id,
        field: "project",
        message: `Task "${t.id}" belongs to project "${t.project}", but was validated under "${project.slug}"`
      });
      taskIssueIds.add(t.id);
    }

    if (t.backlog) {
      if (project.type === "business") {
        issues.push({
          scope: "relation",
          code: "BUSINESS_TASK_CANNOT_HAVE_BACKLOG",
          sourcePath,
          objectId: t.id,
          field: "backlog",
          message: `Business task "${t.id}" cannot reference a Backlog item`
        });
        taskIssueIds.add(t.id);
      } else if (!backlogMap.has(t.backlog)) {
        issues.push({
          scope: "relation",
          code: "MISSING_TASK_BACKLOG_TARGET",
          sourcePath,
          objectId: t.id,
          field: "backlog",
          message: `Task "${t.id}" references non-existent Backlog target "${t.backlog}"`
        });
        taskIssueIds.add(t.id);
      }
    }

    if (t.roadmap_item && !roadmapIdSet.has(t.roadmap_item)) {
      issues.push({
        scope: "relation",
        code: "MISSING_TASK_ROADMAP_TARGET",
        sourcePath,
        objectId: t.id,
        field: "roadmap_item",
        message: `Task "${t.id}" references non-existent Roadmap item "${t.roadmap_item}"`
      });
      taskIssueIds.add(t.id);
    }
  }

  const validRoadmap = roadmapItems.filter(r => !roadmapIssueIds.has(r.id));
  const validBacklog = backlogItems.filter(b => !backlogIssueIds.has(b.id));
  const validTasks = tasks.filter(t => !taskIssueIds.has(t.id));

  return {
    valid: [{
      roadmapItems: validRoadmap,
      backlogItems: validBacklog,
      tasks: validTasks
    }],
    issues
  };
}
