import YAML from "yaml";
import type { BacklogItem, RoadmapItem, Task } from "../domain/types";

/**
 * Free-text bodies are appended after the yaml fence; a line starting with
 * `## ` or a code fence would let a body inject new sections or fake
 * metadata blocks into the document.
 */
function assertSafeBody(body: string, label: string): void {
  if (/^##\s/m.test(body) || /^```/m.test(body)) {
    throw new Error(`${label} must not contain markdown section headings or code fences`);
  }
}

export function renderRoadmapItem(item: RoadmapItem): string {
  const metadata: Record<string, unknown> = {
    id: item.id,
    kind: item.kind,
    status: item.status,
    order: item.order
  };
  if (item.focus) metadata.focus = item.focus;
  if (item.start) metadata.start = item.start;
  if (item.target) metadata.target = item.target;

  if (item.summary) assertSafeBody(item.summary, "RoadmapItem summary");

  const yamlStr = YAML.stringify(metadata).trim();
  const summaryStr = item.summary ? `\n\n${item.summary.trim()}` : "";

  return `## ${item.id}: ${item.title}\n\n\`\`\`yaml alljobs\n${yamlStr}\n\`\`\`${summaryStr}`;
}

export function renderBacklogItem(item: BacklogItem): string {
  const metadata: Record<string, unknown> = {
    id: item.id,
    work_mode: item.work_mode,
    status: item.status,
    priority: item.priority
  };
  if (item.phase) metadata.phase = item.phase;
  if (item.owner) metadata.owner = item.owner;
  if (item.dependencies && item.dependencies.length > 0) {
    metadata.dependencies = item.dependencies;
  }
  if (item.done_when) metadata.done_when = item.done_when;

  if (item.body) assertSafeBody(item.body, "BacklogItem body");

  const yamlStr = YAML.stringify(metadata).trim();
  const bodyStr = item.body ? `\n\n${item.body.trim()}` : "";

  return `## ${item.id}: ${item.title}\n\n\`\`\`yaml alljobs\n${yamlStr}\n\`\`\`${bodyStr}`;
}

export function renderTask(task: Task): string {
  const metadata: Record<string, unknown> = {
    id: task.id,
    project: task.project,
    status: task.status
  };
  if (task.work_mode) metadata.work_mode = task.work_mode;
  if (task.backlog) metadata.backlog = task.backlog;
  if (task.roadmap_item) metadata.roadmap_item = task.roadmap_item;
  if (task.waiting_on) metadata.waiting_on = task.waiting_on;
  if (task.follow_up_on) metadata.follow_up_on = task.follow_up_on;
  if (task.blocked_reason) metadata.blocked_reason = task.blocked_reason;
  if (task.due) metadata.due = task.due;
  if (task.owner) metadata.owner = task.owner;
  if (task.executor) metadata.executor = task.executor;
  if (task.source && (task.source.provider !== "native" || task.source.ref)) {
    metadata.source = task.source;
  }

  const yamlStr = YAML.stringify(metadata).trim();
  return `## ${task.id}: ${task.title}\n\n\`\`\`yaml alljobs\n${yamlStr}\n\`\`\``;
}
