import { z } from "zod";

export const projectTypeSchema = z.enum(["code", "business"]);
export const workModeSchema = z.enum(["implementation", "operations"]);
export const roadmapItemKindSchema = z.enum(["phase", "milestone"]);
export const roadmapItemStatusSchema = z.enum(["planned", "active", "paused", "done", "cancelled"]);
export const backlogStatusSchema = z.enum(["idea", "ready", "doing", "blocked", "done", "cancelled"]);
export const prioritySchema = z.enum(["P0", "P1", "P2"]);
export const taskStatusSchema = z.enum(["todo", "doing", "waiting", "blocked", "done", "cancelled"]);

// IDs become markdown headings (`## id: title`) and file anchors, so they are
// restricted to a safe single-line charset (consistent with paths.ts slug rules).
const idSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    "ID must start with a letter or digit and contain only letters, digits, hyphens, and underscores"
  );

// Titles are rendered into `## id: title` headings; a line break would inject
// new sections or code fences into the document.
const titleSchema = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .regex(/^[^\r\n]+$/, `${label} must be a single line (no CR/LF)`);

export const taskSourceSchema = z.object({
  provider: z.string().min(1),
  ref: z.string().optional()
}).default({ provider: "native" });

export const roadmapItemSchema = z.object({
  id: idSchema,
  title: titleSchema("RoadmapItem title"),
  kind: roadmapItemKindSchema,
  status: roadmapItemStatusSchema,
  order: z.number().int(),
  focus: z.enum(["primary", "normal"]).optional(),
  start: z.string().optional(),
  target: z.string().optional(),
  summary: z.string().optional()
});

export const backlogItemSchema = z.object({
  id: idSchema,
  title: titleSchema("BacklogItem title"),
  work_mode: workModeSchema,
  phase: z.string().optional(),
  status: backlogStatusSchema,
  priority: prioritySchema,
  rank: z.number().int().positive().optional(),
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
  id: idSchema,
  title: titleSchema("Task title"),
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
