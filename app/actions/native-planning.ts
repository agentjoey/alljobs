"use server";

import { revalidatePath } from "next/cache";
import type { Task, RoadmapItem, TaskStatus, WorkMode } from "@/lib/planning/domain/types";
import { NativePlanningStore } from "@/lib/planning/native/store";
import { errorResult, successResult, type ActionResult } from "./action-result";

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
    return errorResult(result.message, result.code);
  }

  revalidatePath("/");
  revalidatePath("/tasks");
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
  const store = new NativePlanningStore();

  const result = await store.updateTask({
    project,
    taskId,
    patch,
    expectedDigest
  });

  if (!result.ok) {
    return errorResult(result.message, result.code);
  }

  revalidatePath("/");
  revalidatePath("/tasks");
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
    return errorResult(result.message, result.code);
  }

  revalidatePath(`/projects/${project}`);

  return successResult(result.value, `Milestone "${id}" created successfully`);
}
