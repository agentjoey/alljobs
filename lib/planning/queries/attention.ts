import type { ProofIssue, Task } from "../domain/types";
import type { ExternalProjection } from "../providers/contracts";

export interface AttentionItem {
  id: string;
  type: "blocked_task" | "waiting_follow_up" | "stale_source" | "proof_issue" | "upcoming_due";
  severity: "critical" | "warning" | "info";
  project: string;
  title: string;
  message: string;
  objectId?: string;
}

export function deriveAttentionItems(input: {
  project: string;
  tasks: Task[];
  issues: ProofIssue[];
  projection?: ExternalProjection | null;
}): AttentionItem[] {
  const { project, tasks, issues, projection } = input;
  const items: AttentionItem[] = [];

  // 1. Blocked Tasks
  for (const t of tasks) {
    if (t.status === "blocked") {
      items.push({
        id: `att-blocked-${t.id}`,
        type: "blocked_task",
        severity: "critical",
        project,
        title: `Task Blocked: ${t.title}`,
        message: t.blocked_reason || "Blocked without specific reason provided",
        objectId: t.id
      });
    } else if (t.status === "waiting") {
      items.push({
        id: `att-waiting-${t.id}`,
        type: "waiting_follow_up",
        severity: "warning",
        project,
        title: `Waiting on Response: ${t.title}`,
        message: t.waiting_on ? `Waiting on ${t.waiting_on}` : "Waiting on external dependency",
        objectId: t.id
      });
    }
  }

  // 2. Stale or Unavailable Git Projections
  if (projection) {
    if (projection.freshness === "stale") {
      items.push({
        id: `att-stale-${project}`,
        type: "stale_source",
        severity: "warning",
        project,
        title: `Stale Git Mirror for ${project}`,
        message: `Using cached commit (${projection.revision.slice(0, 7)}); latest fetch failed.`
      });
    } else if (projection.freshness === "unavailable") {
      items.push({
        id: `att-unavail-${project}`,
        type: "stale_source",
        severity: "critical",
        project,
        title: `Unavailable Git Source for ${project}`,
        message: "No commit or mirror available to project roadmap and backlog."
      });
    }
  }

  // 3. Proof Issues
  for (const issue of issues) {
    items.push({
      id: `att-issue-${project}-${issue.code}-${issue.objectId || "doc"}`,
      type: "proof_issue",
      severity: issue.scope === "document" ? "critical" : "warning",
      project,
      title: `Planning Format Issue: ${issue.code}`,
      message: issue.message,
      objectId: issue.objectId
    });
  }

  return items;
}
