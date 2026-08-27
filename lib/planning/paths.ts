import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, normalize, resolve } from "node:path";

function validateSlugOrId(name: string, label: string): string {
  if (!name || typeof name !== "string") {
    throw new Error(`Invalid ${label}: must be a non-empty string`);
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\") || isAbsolute(name)) {
    throw new Error(`Invalid ${label} "${name}": path traversal characters not permitted`);
  }
  return name;
}

export function resolveDataRoot(customRoot?: string): string {
  if (customRoot) {
    return resolve(customRoot);
  }
  if (process.env.ALLJOBS_DATA_ROOT) {
    return resolve(process.env.ALLJOBS_DATA_ROOT);
  }
  if (process.env.NODE_ENV === "test") {
    throw new Error("ALLJOBS_DATA_ROOT or customRoot must be explicitly provided in test environment");
  }
  return resolve(process.cwd(), "data");
}

export function getProjectsDir(root?: string): string {
  const dir = resolve(resolveDataRoot(root), "projects");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getRoadmapsDir(root?: string): string {
  const dir = resolve(resolveDataRoot(root), "roadmaps");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getTasksDir(root?: string): string {
  const dir = resolve(resolveDataRoot(root), "tasks");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLogDir(root?: string): string {
  const dir = resolve(resolveDataRoot(root), "log");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLocksDir(root?: string): string {
  const dir = resolve(resolveDataRoot(root), "locks");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getProjectFilePath(slug: string, root?: string): string {
  const validSlug = validateSlugOrId(slug, "project slug");
  return resolve(getProjectsDir(root), `${validSlug}.json`);
}

export function getNativeRoadmapFilePath(slug: string, root?: string): string {
  const validSlug = validateSlugOrId(slug, "project slug");
  return resolve(getRoadmapsDir(root), `${validSlug}.md`);
}

export function getNativeTasksFilePath(slug: string, root?: string): string {
  const validSlug = validateSlugOrId(slug, "project slug");
  return resolve(getTasksDir(root), `${validSlug}.md`);
}
