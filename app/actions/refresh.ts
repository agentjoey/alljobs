"use server";

import { revalidatePath } from "next/cache";
import { loadControlHostConfig } from "@/lib/planning/config";
import { NativePlanningStore } from "@/lib/planning/native/store";
import { NodeGitRunner } from "@/lib/planning/providers/git-runner";
import { refreshProject } from "@/lib/planning/providers/refresh";
import { errorResult, internalErrorResult, successResult, type ActionResult } from "./action-result";

export async function refreshProjectAction(
  slug: string
): Promise<ActionResult<{ freshness: string }>> {
  let paths;
  try {
    paths = loadControlHostConfig();
  } catch (err: any) {
    return internalErrorResult(err, "CONFIG_ERROR");
  }

  const store = new NativePlanningStore();
  const gitRunner = new NodeGitRunner();

  const project = await store.getProject(slug);
  if (!project) {
    return errorResult(`Project "${slug}" not found`, "NOT_FOUND");
  }
  if (project.archived) {
    return errorResult(`Project "${slug}" is archived; provider refresh is disabled`, "ARCHIVED_PROJECT");
  }

  try {
    const projection = await refreshProject(project, { paths, gitRunner, store });
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath(`/projects/${slug}`);
    return successResult(
      { freshness: projection.freshness },
      `Project "${slug}" refreshed (${projection.freshness})`
    );
  } catch (err: any) {
    return internalErrorResult(err, "REFRESH_ERROR");
  }
}
