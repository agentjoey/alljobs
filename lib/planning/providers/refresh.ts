import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ControlHostResolvedPaths } from "../config";
import type { ProjectRegistryEntry } from "../domain/types";
import { withProjectLock } from "../native/lock";
import type { NativePlanningStore } from "../native/store";
import type { ExternalProjection } from "./contracts";
import { GitMarkdownProvider } from "./git-markdown";
import type { GitResult, GitRunner } from "./git-runner";

export async function getCachedProjection(
  slug: string,
  cacheDir: string
): Promise<ExternalProjection | null> {
  const cachePath = resolve(cacheDir, `${slug}.json`);
  if (!existsSync(cachePath)) return null;

  try {
    const raw = await readFile(cachePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveCachedProjection(
  projection: ExternalProjection,
  cacheDir: string
): Promise<void> {
  const cachePath = resolve(cacheDir, `${projection.project}.json`);
  await writeFile(cachePath, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
}

export async function refreshProject(
  project: ProjectRegistryEntry,
  options: {
    paths: ControlHostResolvedPaths;
    gitRunner: GitRunner;
    store: NativePlanningStore;
  }
): Promise<ExternalProjection> {
  const { paths, gitRunner } = options;

  if (project.type !== "code") {
    // Business projects have no external git projection
    return {
      project: project.slug,
      revision: "native",
      fetchedAt: new Date().toISOString(),
      freshness: "fresh",
      roadmap: [],
      backlog: [],
      tasks: [],
      issues: [],
      provenance: []
    };
  }

  return withProjectLock(
    project.slug,
    async () => {
      const mirrorPath = resolve(paths.mirrorsDir, `${project.slug}.git`);
    const provider = new GitMarkdownProvider(gitRunner);
    const branch = project.git_branch || "main";

    // 1. Initialize bare mirror if absent
    if (!existsSync(mirrorPath)) {
      // Try git_remote first, then fall back to trusted_path if the remote
      // is unusable (e.g. not a valid URL) but the local path exists
      const sources: string[] = [];
      if (project.git_remote) sources.push(project.git_remote);
      if (project.trusted_path && project.trusted_path !== project.git_remote) {
        sources.push(project.trusted_path);
      }

      if (sources.length === 0) {
        return {
          project: project.slug,
          revision: "unknown",
          fetchedAt: new Date().toISOString(),
          freshness: "unavailable",
          roadmap: [],
          backlog: [],
          tasks: [],
          issues: [
            {
              scope: "document",
              code: "NO_GIT_SOURCE",
              sourcePath: "",
              message: `Project "${project.slug}" has neither git_remote nor trusted_path configured`
            }
          ],
          provenance: []
        };
      }

      let cloneRes: GitResult | null = null;
      let cloneSource = "";
      for (const source of sources) {
        if (source === project.trusted_path && !existsSync(source)) continue;
        const attempt = await gitRunner.run([
          "clone",
          "--bare",
          "--no-checkout",
          "--",
          source,
          mirrorPath
        ]);
        cloneRes = attempt;
        cloneSource = source;
        if (attempt.exitCode === 0) break;
        // A failed clone may leave a partial mirror behind; clean before retry
        await rm(mirrorPath, { recursive: true, force: true });
      }

      if (!cloneRes || cloneRes.exitCode !== 0) {
        return {
          project: project.slug,
          revision: "unknown",
          fetchedAt: new Date().toISOString(),
          freshness: "unavailable",
          roadmap: [],
          backlog: [],
          tasks: [],
          issues: [
            {
              scope: "document",
              code: "GIT_CLONE_FAILED",
              sourcePath: cloneSource,
              message: `Failed to initialize bare mirror for "${project.slug}": ${cloneRes?.stderr || "no usable source"}`
            }
          ],
          provenance: []
        };
      }
    } else if (project.git_remote) {
      // 2. Fetch updates if remote is configured
      const fetchRes = await gitRunner.run(
        ["fetch", "--no-tags", "origin", `+refs/heads/${branch}:refs/heads/${branch}`],
        { cwd: mirrorPath }
      );

      if (fetchRes.exitCode !== 0) {
        // Fetch failed: preserve last success cache if available
        const lastCache = await getCachedProjection(project.slug, paths.cacheDir);
        if (lastCache) {
          return {
            ...lastCache,
            freshness: "stale",
            issues: [
              ...lastCache.issues,
              {
                scope: "document",
                code: "FETCH_FAILED_USING_STALE_CACHE",
                sourcePath: mirrorPath,
                message: `Git fetch failed; using last successful commit (${lastCache.revision.slice(0, 7)})`
              }
            ]
          };
        }
      }
    }

    // 3. Project Roadmap and Backlog from mirror
    const projection = await provider.projectRoadmap(project, {
      mirrorPath,
      ref: `refs/heads/${branch}`
    });

    // 4. Save cache if fresh
    if (projection.freshness === "fresh") {
      await saveCachedProjection(projection, paths.cacheDir);
    }

    return projection;
    },
    paths.homeDir
  );
}

export async function refreshAllProjects(options: {
  paths: ControlHostResolvedPaths;
  gitRunner: GitRunner;
  store: NativePlanningStore;
}): Promise<Map<string, ExternalProjection>> {
  const { store } = options;
  const projects = await store.listProjects();
  const results = new Map<string, ExternalProjection>();

  for (const project of projects) {
    if (project.archived) continue;
    try {
      const projection = await refreshProject(project, options);
      results.set(project.slug, projection);
    } catch (err: any) {
      results.set(project.slug, {
        project: project.slug,
        revision: "error",
        fetchedAt: new Date().toISOString(),
        freshness: "unavailable",
        roadmap: [],
        backlog: [],
        tasks: [],
        issues: [
          {
            scope: "document",
            code: "REFRESH_ERROR",
            sourcePath: project.slug,
            message: err.message
          }
        ],
        provenance: []
      });
    }
  }

  return results;
}
