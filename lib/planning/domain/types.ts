import type { z } from "zod";
import type {
  backlogItemSchema,
  backlogStatusSchema,
  prioritySchema,
  projectRegistrySchema,
  projectTypeSchema,
  roadmapItemKindSchema,
  roadmapItemSchema,
  roadmapItemStatusSchema,
  taskSchema,
  taskSourceSchema,
  taskStatusSchema,
  workModeSchema
} from "./schemas";

export interface ProofIssue {
  scope: "document" | "object" | "relation";
  code: string;
  sourcePath?: string;
  objectId?: string;
  field?: string;
  message: string;
}

export interface ValidationResult<T> {
  valid: T[];
  issues: ProofIssue[];
}

export type ProjectType = z.infer<typeof projectTypeSchema>;
export type WorkMode = z.infer<typeof workModeSchema>;
export type RoadmapItemKind = z.infer<typeof roadmapItemKindSchema>;
export type RoadmapItemStatus = z.infer<typeof roadmapItemStatusSchema>;
export type RoadmapItem = z.infer<typeof roadmapItemSchema>;

export type BacklogStatus = z.infer<typeof backlogStatusSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type BacklogItem = z.infer<typeof backlogItemSchema>;

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskSource = z.infer<typeof taskSourceSchema>;
export type Task = z.infer<typeof taskSchema>;

export type ProjectRegistryEntry = z.infer<typeof projectRegistrySchema>;
