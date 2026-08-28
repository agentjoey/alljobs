import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { parseProjectRegistry, parseRoadmapItem, parseTask } from "../domain/schemas";
import type {
  ProjectRegistryEntry,
  ProofIssue,
  RoadmapItem,
  Task
} from "../domain/types";
import { appendSection, replaceSection } from "../markdown/section-document";
import { parseRoadmapDocument } from "../markdown/roadmap";
import { parseTasksDocument } from "../markdown/tasks";
import { renderRoadmapItem, renderTask } from "../markdown/render";
import {
  getNativeRoadmapFilePath,
  getNativeTasksFilePath,
  getProjectFilePath,
  getProjectsDir,
  resolveDataRoot
} from "../paths";
import { recordActivity } from "./activity";
import { computeDigest } from "./digest";
import { withProjectLockGuard } from "./lock";

export type MutationResult<T> =
  | { ok: true; value: T; digest: string }
  | {
      ok: false;
      code:
        | "VALIDATION_ERROR"
        | "STALE_WRITE"
        | "NOT_FOUND"
        | "READ_ONLY_SOURCE"
        | "ARCHIVED_PROJECT"
        | "LOCKED"
        | "FILESYSTEM_ERROR";
      message: string;
      issues?: ProofIssue[];
    };

export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp.${randomUUID()}`;
  try {
    await writeFile(tmpPath, content, "utf8");
    await rename(tmpPath, filePath);
  } catch (err) {
    try {
      await unlink(tmpPath);
    } catch {
      // Ignore cleanup error
    }
    throw err;
  }
}

/**
 * Collects ids from valid items AND from sections dropped at parse time
 * (their ids surface as issue.objectId), so a malformed section carrying a
 * duplicate id cannot be silently shadowed by a new entry.
 */
function collectExistingIds(parsed: {
  valid: { id: string }[];
  issues: ProofIssue[];
}): Set<string> {
  const ids = new Set(parsed.valid.map(item => item.id));
  for (const issue of parsed.issues) {
    if (issue.objectId) ids.add(issue.objectId);
  }
  return ids;
}

export class NativePlanningStore {
  constructor(private readonly customRoot?: string) {}

  /** Resolved data root backing this store (see resolveDataRoot). */
  get root(): string {
    return resolveDataRoot(this.customRoot);
  }

  // -------------------------------------------------------------
  // Project Registry
  // -------------------------------------------------------------

  async createProject(
    entry: ProjectRegistryEntry
  ): Promise<MutationResult<ProjectRegistryEntry>> {
    let parsed: ProjectRegistryEntry;
    try {
      parsed = parseProjectRegistry(entry);
    } catch (err: any) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: err.message
      };
    }

    const filePath = getProjectFilePath(parsed.slug, this.customRoot);
    if (existsSync(filePath)) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `Project "${parsed.slug}" already exists`
      };
    }

    return withProjectLockGuard(
      parsed.slug,
      async () => {
        const jsonContent = JSON.stringify(parsed, null, 2);
        try {
          await atomicWriteFile(filePath, `${jsonContent}\n`);
          const digest = computeDigest(jsonContent);

          await recordActivity(
            {
              type: "PROJECT_CREATED",
              project: parsed.slug,
              details: { type: parsed.type, name: parsed.name }
            },
            this.customRoot
          );

          return { ok: true, value: parsed, digest };
        } catch (err: any) {
          return {
            ok: false,
            code: "FILESYSTEM_ERROR",
            message: `Failed to write project registry: ${err.message}`
          };
        }
      },
      this.customRoot
    );
  }

  /**
   * Removes a project registry entry. Best-effort compensation for
   * failed registration flows; missing files are ignored.
   */
  async removeProject(slug: string): Promise<void> {
    const filePath = getProjectFilePath(slug, this.customRoot);
    try {
      await unlink(filePath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async getProject(slug: string): Promise<ProjectRegistryEntry | null> {
    const filePath = getProjectFilePath(slug, this.customRoot);
    if (!existsSync(filePath)) return null;

    const content = await readFile(filePath, "utf8");
    try {
      return parseProjectRegistry(JSON.parse(content));
    } catch (err: any) {
      throw new Error(`Project registry "${slug}" at ${filePath} is corrupted: ${err.message}`);
    }
  }

  async listProjects(): Promise<ProjectRegistryEntry[]> {
    const projectsDir = getProjectsDir(this.customRoot);
    const files = await readdir(projectsDir);
    const result: ProjectRegistryEntry[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const slug = file.replace(/\.json$/, "");
        const project = await this.getProject(slug);
        if (project) result.push(project);
      }
    }

    return result.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  // -------------------------------------------------------------
  // Native Tasks
  // -------------------------------------------------------------

  async readTasks(
    slug: string
  ): Promise<{ tasks: Task[]; digest: string; issues: ProofIssue[] }> {
    const filePath = getNativeTasksFilePath(slug, this.customRoot);
    if (!existsSync(filePath)) {
      return { tasks: [], digest: computeDigest(""), issues: [] };
    }

    const content = await readFile(filePath, "utf8");
    const digest = computeDigest(content);
    const parsed = parseTasksDocument(content, filePath, slug);

    return {
      tasks: parsed.valid,
      digest,
      issues: parsed.issues
    };
  }

  async createTask(
    slug: string,
    rawTask: Task
  ): Promise<MutationResult<Task>> {
    const project = await this.getProject(slug);
    if (!project) {
      return { ok: false, code: "NOT_FOUND", message: `Project "${slug}" not found` };
    }
    if (project.archived) {
      return {
        ok: false,
        code: "ARCHIVED_PROJECT",
        message: `Cannot write task to archived project "${slug}"`
      };
    }

    let task: Task;
    try {
      task = parseTask({ ...rawTask, project: slug });
    } catch (err: any) {
      return { ok: false, code: "VALIDATION_ERROR", message: err.message };
    }

    return withProjectLockGuard(
      slug,
      async () => {
        const filePath = getNativeTasksFilePath(slug, this.customRoot);
        const existingContent = existsSync(filePath)
          ? await readFile(filePath, "utf8")
          : `# Tasks — ${project.name}\n`;

        // Check ID uniqueness against valid tasks AND sections dropped at
        // parse time (their ids surface as issue.objectId), so a malformed
        // duplicate section cannot make a new task silently invisible.
        const parsed = parseTasksDocument(existingContent, filePath, slug);
        if (collectExistingIds(parsed).has(task.id)) {
          return {
            ok: false,
            code: "VALIDATION_ERROR",
            message: `Task ID "${task.id}" already exists in project "${slug}"`
          };
        }

        const renderedSection = renderTask(task);
        const newContent = appendSection(existingContent, renderedSection);

        try {
          await atomicWriteFile(filePath, newContent);
          const digest = computeDigest(newContent);

          await recordActivity(
            {
              type: "TASK_CREATED",
              project: slug,
              details: { taskId: task.id, title: task.title, status: task.status }
            },
            this.customRoot
          );

          return { ok: true, value: task, digest };
        } catch (err: any) {
          return {
            ok: false,
            code: "FILESYSTEM_ERROR",
            message: `Failed to write task: ${err.message}`
          };
        }
      },
      this.customRoot
    );
  }

  async updateTask(input: {
    project: string;
    taskId: string;
    patch: Partial<Task>;
    expectedDigest?: string;
  }): Promise<MutationResult<Task>> {
    const { project: slug, taskId, patch, expectedDigest } = input;
    const project = await this.getProject(slug);
    if (!project) {
      return { ok: false, code: "NOT_FOUND", message: `Project "${slug}" not found` };
    }
    if (project.archived) {
      return {
        ok: false,
        code: "ARCHIVED_PROJECT",
        message: `Cannot write task to archived project "${slug}"`
      };
    }

    return withProjectLockGuard(
      slug,
      async () => {
        const filePath = getNativeTasksFilePath(slug, this.customRoot);
        if (!existsSync(filePath)) {
          return { ok: false, code: "NOT_FOUND", message: `Task file not found for "${slug}"` };
        }

        const currentContent = await readFile(filePath, "utf8");
        const currentDigest = computeDigest(currentContent);

        if (expectedDigest && expectedDigest !== currentDigest) {
          return {
            ok: false,
            code: "STALE_WRITE",
            message: `Expected digest "${expectedDigest}" does not match current digest "${currentDigest}"`
          };
        }

        const parsed = parseTasksDocument(currentContent, filePath, slug);
        const existingTask = parsed.valid.find(t => t.id === taskId);
        if (!existingTask) {
          return { ok: false, code: "NOT_FOUND", message: `Task "${taskId}" not found` };
        }

        let updatedTask: Task;
        try {
          updatedTask = parseTask({ ...existingTask, ...patch, id: taskId, project: slug });
        } catch (err: any) {
          return { ok: false, code: "VALIDATION_ERROR", message: err.message };
        }

        const rendered = renderTask(updatedTask);
        let newContent: string;
        try {
          newContent = replaceSection(currentContent, taskId, rendered);
        } catch (err: any) {
          return { ok: false, code: "FILESYSTEM_ERROR", message: err.message };
        }

        try {
          await atomicWriteFile(filePath, newContent);
          const newDigest = computeDigest(newContent);

          await recordActivity(
            {
              type: "TASK_UPDATED",
              project: slug,
              details: { taskId, patch }
            },
            this.customRoot
          );

          return { ok: true, value: updatedTask, digest: newDigest };
        } catch (err: any) {
          return {
            ok: false,
            code: "FILESYSTEM_ERROR",
            message: `Failed to update task file: ${err.message}`
          };
        }
      },
      this.customRoot
    );
  }

  // -------------------------------------------------------------
  // Native Roadmaps
  // -------------------------------------------------------------

  async readRoadmap(
    slug: string
  ): Promise<{ items: RoadmapItem[]; digest: string; issues: ProofIssue[] }> {
    const filePath = getNativeRoadmapFilePath(slug, this.customRoot);
    if (!existsSync(filePath)) {
      return { items: [], digest: computeDigest(""), issues: [] };
    }

    const content = await readFile(filePath, "utf8");
    const digest = computeDigest(content);
    const parsed = parseRoadmapDocument(content, filePath, "milestone");

    return {
      items: parsed.valid,
      digest,
      issues: parsed.issues
    };
  }

  async createRoadmapItem(
    slug: string,
    rawItem: RoadmapItem
  ): Promise<MutationResult<RoadmapItem>> {
    const project = await this.getProject(slug);
    if (!project) {
      return { ok: false, code: "NOT_FOUND", message: `Project "${slug}" not found` };
    }
    if (project.type !== "business") {
      return {
        ok: false,
        code: "READ_ONLY_SOURCE",
        message: `Roadmap for code project "${slug}" is owned by external git repository`
      };
    }
    if (project.archived) {
      return {
        ok: false,
        code: "ARCHIVED_PROJECT",
        message: `Cannot write roadmap to archived project "${slug}"`
      };
    }

    let item: RoadmapItem;
    try {
      item = parseRoadmapItem({ ...rawItem, kind: "milestone" });
    } catch (err: any) {
      return { ok: false, code: "VALIDATION_ERROR", message: err.message };
    }

    return withProjectLockGuard(
      slug,
      async () => {
        const filePath = getNativeRoadmapFilePath(slug, this.customRoot);
        const existingContent = existsSync(filePath)
          ? await readFile(filePath, "utf8")
          : `# Roadmap — ${project.name}\n`;

        const parsed = parseRoadmapDocument(existingContent, filePath, "milestone");
        if (collectExistingIds(parsed).has(item.id)) {
          return {
            ok: false,
            code: "VALIDATION_ERROR",
            message: `Milestone ID "${item.id}" already exists in project "${slug}"`
          };
        }

        let newContent: string;
        try {
          const rendered = renderRoadmapItem(item);
          newContent = appendSection(existingContent, rendered);
        } catch (err: any) {
          return { ok: false, code: "VALIDATION_ERROR", message: err.message };
        }

        try {
          await atomicWriteFile(filePath, newContent);
          const digest = computeDigest(newContent);

          await recordActivity(
            {
              type: "ROADMAP_ITEM_CREATED",
              project: slug,
              details: { itemId: item.id, title: item.title }
            },
            this.customRoot
          );

          return { ok: true, value: item, digest };
        } catch (err: any) {
          return {
            ok: false,
            code: "FILESYSTEM_ERROR",
            message: `Failed to write roadmap item: ${err.message}`
          };
        }
      },
      this.customRoot
    );
  }
}
