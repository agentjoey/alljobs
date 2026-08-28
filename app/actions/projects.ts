"use server";

import { revalidatePath } from "next/cache";
import { loadControlHostConfig } from "@/lib/planning/config";
import type { WorkMode } from "@/lib/planning/domain/types";
import { NativePlanningStore } from "@/lib/planning/native/store";
import { NodeGitRunner } from "@/lib/planning/providers/git-runner";
import { applyRegistration } from "@/lib/planning/registry/apply";
import { applyArchive } from "@/lib/planning/registry/archive";
import { inspectCandidate } from "@/lib/planning/registry/inspect";
import type { LifecycleProposal, RegistrationProposal } from "@/lib/planning/registry/proposal";
import { applyRestore, proposeRestore } from "@/lib/planning/registry/restore";
import { listTrustedWorkspaces, type TrustedWorkspace } from "@/lib/planning/registry/trusted-workspaces";
import { errorResult, internalErrorResult, mutationErrorResult, successResult, type ActionResult } from "./action-result";

export async function listTrustedWorkspacesAction(): Promise<ActionResult<TrustedWorkspace[]>> {
  try {
    const paths = loadControlHostConfig();
    return successResult(listTrustedWorkspaces(paths.config), "Trusted workspaces loaded");
  } catch (err: unknown) {
    return internalErrorResult(err, "CONFIG_ERROR");
  }
}

export async function inspectProjectAction(
  formData: FormData
): Promise<ActionResult<RegistrationProposal>> {
  const slug = formData.get("slug")?.toString().trim() || "";
  const name = formData.get("name")?.toString().trim() || "";
  const type = (formData.get("type")?.toString().trim() || "code") as "code" | "business";
  const candidatePath = formData.get("candidatePath")?.toString().trim() || undefined;
  const gitRemote = formData.get("gitRemote")?.toString().trim() || undefined;
  const gitBranch = formData.get("gitBranch")?.toString().trim() || "main";
  const workModes = formData.getAll("workModes").map(m => m.toString()) as WorkMode[];

  if (!slug || !name) {
    return errorResult("Slug and Name are required", "VALIDATION_ERROR", {
      slug: !slug ? ["Slug is required"] : [],
      name: !name ? ["Name is required"] : []
    });
  }

  let paths;
  try {
    paths = loadControlHostConfig();
  } catch (err: any) {
    return internalErrorResult(err, "CONFIG_ERROR");
  }

  const store = new NativePlanningStore();
  const gitRunner = new NodeGitRunner();

  try {
    const proposal = await inspectCandidate({
      slug,
      name,
      type,
      workModes: workModes.length > 0 ? workModes : ["implementation"],
      candidatePath,
      gitRemote,
      gitBranch,
      config: paths.config,
      store,
      gitRunner
    });

    return successResult(proposal, "Candidate inspected successfully");
  } catch (err: any) {
    return internalErrorResult(err, "INSPECT_ERROR");
  }
}

export async function applyRegistrationAction(
  proposalJson: string,
  expectedDigest: string,
  confirmationSlug: string
): Promise<ActionResult<{ slug: string }>> {
  let proposal: RegistrationProposal;
  try {
    proposal = JSON.parse(proposalJson);
  } catch {
    return errorResult("Invalid proposal JSON payload", "INVALID_PAYLOAD");
  }

  if (proposal.project.slug !== confirmationSlug) {
    return errorResult(
      `Confirmation slug "${confirmationSlug}" does not match proposal "${proposal.project.slug}"`,
      "CONFIRMATION_MISMATCH"
    );
  }

  let paths;
  try {
    paths = loadControlHostConfig();
  } catch (err: any) {
    return internalErrorResult(err, "CONFIG_ERROR");
  }

  const store = new NativePlanningStore();
  const gitRunner = new NodeGitRunner();

  const result = await applyRegistration(proposal, expectedDigest, {
    paths,
    store,
    gitRunner
  });

  if (!result.ok) {
    return mutationErrorResult(result);
  }

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${result.value.slug}`);

  return successResult({ slug: result.value.slug }, `Project "${result.value.name}" registered successfully`);
}

export async function archiveProjectAction(
  slug: string,
  expectedDigest: string,
  confirmationSlug: string
): Promise<ActionResult<{ slug: string }>> {
  if (slug !== confirmationSlug) {
    return errorResult("Confirmation slug mismatch", "CONFIRMATION_MISMATCH");
  }

  const store = new NativePlanningStore();
  const result = await applyArchive(slug, expectedDigest, store);

  if (!result.ok) {
    return mutationErrorResult(result);
  }

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/archived");

  return successResult({ slug }, `Project "${slug}" archived successfully`);
}

export async function proposeRestoreAction(
  slug: string
): Promise<ActionResult<LifecycleProposal>> {
  let paths;
  try {
    paths = loadControlHostConfig();
  } catch (err: any) {
    return internalErrorResult(err, "CONFIG_ERROR");
  }

  const store = new NativePlanningStore();
  try {
    const proposal = await proposeRestore(slug, store, paths.config);
    return successResult(proposal, "Restore proposal prepared");
  } catch (err: any) {
    return internalErrorResult(err, "PROPOSE_ERROR");
  }
}

export async function restoreProjectAction(
  slug: string,
  expectedDigest: string,
  confirmationSlug: string
): Promise<ActionResult<{ slug: string }>> {
  if (slug !== confirmationSlug) {
    return errorResult("Confirmation slug mismatch", "CONFIRMATION_MISMATCH");
  }

  let paths;
  try {
    paths = loadControlHostConfig();
  } catch (err: any) {
    return internalErrorResult(err, "CONFIG_ERROR");
  }

  const store = new NativePlanningStore();
  const result = await applyRestore(slug, expectedDigest, {
    store,
    config: paths.config
  });

  if (!result.ok) {
    return mutationErrorResult(result);
  }

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/archived");

  return successResult({ slug }, `Project "${slug}" restored successfully`);
}
