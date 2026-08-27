import { z } from "zod";

export const projectTypeSchema = z.enum(["code", "business"]);
export const workModeSchema = z.enum(["implementation", "operations"]);
export const roadmapItemKindSchema = z.enum(["phase", "milestone"]);
export const roadmapItemStatusSchema = z.enum(["planned", "active", "paused", "done", "cancelled"]);
export const backlogStatusSchema = z.enum(["idea", "ready", "doing", "blocked", "done", "cancelled"]);
export const prioritySchema = z.enum(["P0", "P1", "P2"]);
export const taskStatusSchema = z.enum(["todo", "doing", "waiting", "blocked", "done", "cancelled"]);

export const taskSourceSchema = z.object({
  provider: z.string().min(1),
  ref: z.string().optional()
}).default({ provider: "native" });

export const roadmapItemSchema = z.object({
  id: z.string().min(1, "RoadmapItem ID is required"),
  title: z.string().min(1, "RoadmapItem title is required"),
  kind: roadmapItemKindSchema,
  status: roadmapItemStatusSchema,
  order: z.number().int(),
  focus: z.enum(["primary", "normal"]).optional(),
  start: z.string().optional(),
  target: z.string().optional(),
  summary: z.string().optional()
});

export const backlogItemSchema = z.object({
  id: z.string().min(1, "BacklogItem ID is required"),
  title: z.string().min(1, "BacklogItem title is required"),
  work_mode: workModeSchema,
  phase: z.string().optional(),
  status: backlogStatusSchema,
  priority: prioritySchema,
  owner: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  done_when: z.string().optional(),
  body: z.string().optional()
}).superRefine((data, ctx) => {
  if (data.work_mode === "implementation" && !data.phase) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phase"],
      message: "Implementation backlog items must belong to a Phase"
    });
  }
});

export const taskSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
  title: z.string().min(1, "Task title is required"),
  project: z.string().min(1, "Project slug is required"),
  status: taskStatusSchema,
  work_mode: workModeSchema.optional(),
  backlog: z.string().optional(),
  roadmap_item: z.string().optional(),
  waiting_on: z.string().optional(),
  follow_up_on: z.string().optional(),
  blocked_reason: z.string().optional(),
  due: z.string().optional(),
  owner: z.string().optional(),
  executor: z.string().optional(),
  source: taskSourceSchema
}).superRefine((data, ctx) => {
  if (data.backlog && data.roadmap_item) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["backlog"],
      message: "Task relations `backlog` and `roadmap_item` are mutually exclusive"
    });
  }
  if (data.status === "blocked" && !data.blocked_reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["blocked_reason"],
      message: "Blocked tasks require a blocked_reason"
    });
  }
  if (!data.backlog && !data.roadmap_item && !data.work_mode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["work_mode"],
      message: "Project-level tasks must declare work_mode explicitly"
    });
  }
});

export const projectRegistrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase alphanumeric characters and hyphens"),
  name: z.string().min(1, "Project name is required"),
  type: projectTypeSchema,
  work_modes: z.array(workModeSchema).min(1, "Project must declare at least one work_mode"),
  execution_locations: z.array(z.string()).default([]),
  git_remote: z.string().optional(),
  git_branch: z.string().optional(),
  trusted_path: z.string().optional(),
  archived: z.boolean().default(false)
});

export function parseProjectRegistry(data: unknown) {
  return projectRegistrySchema.parse(data);
}

export function parseRoadmapItem(data: unknown) {
  return roadmapItemSchema.parse(data);
}

export function parseBacklogItem(data: unknown) {
  return backlogItemSchema.parse(data);
}

export function parseTask(data: unknown) {
  return taskSchema.parse(data);
}
