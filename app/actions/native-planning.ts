"use server";

import { revalidatePath } from "next/cache";
import type { Task, RoadmapItem, TaskStatus, WorkMode } from "@/lib/planning/domain/types";
import { NativePlanningStore } from "@/lib/planning/native/store";
import { errorResult, mutationErrorResult, successResult, type ActionResult } from "./action-result";

// Fields a client may patch on an existing task — everything else (notably
// `source`, which would flip a native task to read-only) is stripped.
const TASK_PATCH_WHITELIST = new Set([
  "status",
  "title",
  "due",
  "waiting_on",
  "blocked_reason",
  "work_mode",
  "backlog",
  "roadmap_item"
]);

export async function createTaskAction(
  formData: FormData
): Promise<ActionResult<Task>> {
  const project = formData.get("project")?.toString().trim() || "";
  const id = formData.get("id")?.toString().trim() || "";
  const title = formData.get("title")?.toString().trim() || "";
  const status = (formData.get("status")?.toString().trim() || "todo") as TaskStatus;
  const workMode = formData.get("work_mode")?.toString().trim() as WorkMode | undefined;
  const backlog = formData.get("backlog")?.toString().trim() || undefined;
  const roadmapItem = formData.get("roadmap_item")?.toString().trim() || undefined;
  const waitingOn = formData.get("waiting_on")?.toString().trim() || undefined;
  const blockedReason = formData.get("blocked_reason")?.toString().trim() || undefined;
  const due = formData.get("due")?.toString().trim() || undefined;

  if (!project || !id || !title) {
    return errorResult("Project, Task ID, and Title are required", "VALIDATION_ERROR");
  }

  const store = new NativePlanningStore();
  const result = await store.createTask(project, {
    id,
    title,
    project,
    status,
    work_mode: workMode,
    backlog,
    roadmap_item: roadmapItem,
    waiting_on: waitingOn,
    blocked_reason: blockedReason,
    due,
    source: { provider: "native" }
  });

  if (!result.ok) {
    return mutationErrorResult(result);
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath(`/projects/${project}`);

  return successResult(result.value, `Task "${id}" created successfully`);
}

export async function updateTaskAction(input: {
  project: string;
  taskId: string;
  patch: Partial<Task>;
  expectedDigest?: string;
}): Promise<ActionResult<Task>> {
  const { project, taskId, patch, expectedDigest } = input;
  const safePatch = Object.fromEntries(
    Object.entries(patch).filter(([key]) => TASK_PATCH_WHITELIST.has(key))
  ) as Partial<Task>;
  const store = new NativePlanningStore();

  const result = await store.updateTask({
    project,
    taskId,
    patch: safePatch,
    expectedDigest
  });

  if (!result.ok) {
    return mutationErrorResult(result);
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath(`/projects/${project}`);

  return successResult(result.value, `Task "${taskId}" updated successfully`);
}

export async function createRoadmapItemAction(
  formData: FormData
): Promise<ActionResult<RoadmapItem>> {
  const project = formData.get("project")?.toString().trim() || "";
  const id = formData.get("id")?.toString().trim() || "";
  const title = formData.get("title")?.toString().trim() || "";
  const order = parseInt(formData.get("order")?.toString().trim() || "10", 10);
  const status = (formData.get("status")?.toString().trim() || "planned") as any;
  const focus = formData.get("focus")?.toString().trim() as any;

  if (!project || !id || !title) {
    return errorResult("Project, Milestone ID, and Title are required", "VALIDATION_ERROR");
  }

  const store = new NativePlanningStore();
  const result = await store.createRoadmapItem(project, {
    id,
    title,
    kind: "milestone",
    status,
    order,
    focus: focus === "primary" ? "primary" : undefined
  });

  if (!result.ok) {
    return mutationErrorResult(result);
  }

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${project}`);

  return successResult(result.value, `Milestone "${id}" created successfully`);
}
