import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { digestCanonicalJson } from "../analysis/digest";
import type { DeploymentPlan, PackageFile, P4ErrorCode } from "../packages/types";
import type { RegistryExportStore } from "../registry/contracts";
import { PostgresExportStoreError } from "../registry/postgres/exports";
import type { RegistryLineageEdge, RegistryVersion } from "../registry/types";
import { ProjectionPathError, resolveSafeDescendant, type ValidatedTargetRoot } from "../projection/paths";
import type { CurrentPointer } from "./plan";
import {
  DEPLOYMENT_LOCK_DIRECTORY,
  listIncompleteOperations,
  readOperation,
  writeOperation,
  type OperationRecord
} from "./recovery";

export class PublishError extends Error {
  constructor(
    readonly code: P4ErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "PublishError";
  }
}

const CURRENT_POINTER_FILE = "current.json";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function readTargetPointer(root: ValidatedTargetRoot): Promise<CurrentPointer | null> {
  try {
    return JSON.parse(await readFile(join(root.root, CURRENT_POINTER_FILE), "utf8")) as CurrentPointer;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeCurrentPointer(root: ValidatedTargetRoot, pointer: CurrentPointer): Promise<void> {
  const path = join(root.root, CURRENT_POINTER_FILE);
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(pointer, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
  try {
    const handle = await open(root.root, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Best-effort directory durability.
  }
}

function pointerFor(deploymentId: string, plan: DeploymentPlan): CurrentPointer {
  const base = {
    deployment_id: deploymentId,
    release_id: plan.release.record_id,
    release_version: plan.release.version,
    release_digest: plan.release.digest
  };
  return {
    ...base,
    pointer_digest: sha256Hex(digestCanonicalJson({ schema_version: 1, pointer: base }))
  };
}

function manifestDigestFor(files: PackageFile[]): string {
  return digestCanonicalJson({
    schema_version: 1,
    files: files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))
  });
}

async function acquireLock(root: string): Promise<() => Promise<void>> {
  try {
    await mkdir(join(root, DEPLOYMENT_LOCK_DIRECTORY));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PublishError("PUBLISH_RECOVERY_REQUIRED", "another publish holds the target lock");
    }
    throw error;
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await rm(join(root, DEPLOYMENT_LOCK_DIRECTORY), { recursive: true, force: true });
  };
}

async function versionDirectory(root: ValidatedTargetRoot, plan: DeploymentPlan): Promise<string> {
  const relative = `versions/${plan.release.record_id}/${plan.release.version}/${plan.preview_manifest_digest}`;
  return resolveSafeDescendant(root, relative);
}

async function writeVersionFiles(
  root: ValidatedTargetRoot,
  plan: DeploymentPlan,
  files: PackageFile[]
): Promise<"written" | "existing"> {
  const directory = await versionDirectory(root, plan);
  const marker = join(directory, ".caphub-version.json");
  const existing = await readFile(marker).then((raw) => JSON.parse(raw.toString("utf8")), () => null);
  if (existing) {
    if (existing.manifest_digest !== plan.preview_manifest_digest || existing.action !== plan.action) {
      throw new PublishError("PACKAGE_DIGEST_CONFLICT", "version directory already holds different content");
    }
    return "existing";
  }
  for (const file of files) {
    const targetPath = await resolveSafeDescendant(root, `${directory.slice(root.root.length + 1)}/${file.path}`);
    await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
    const handle = await open(targetPath, "wx", 0o600);
    try {
      await handle.writeFile(file.content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    const digest = createHash("sha256").update(file.content, "utf8").digest("hex");
    if (digest !== file.sha256) {
      throw new PublishError("PACKAGE_DIGEST_CONFLICT", `file ${file.path} failed digest verification during write`);
    }
  }
  const manifest = {
    schema_version: 1,
    action: plan.action,
    release: plan.release,
    manifest_digest: plan.preview_manifest_digest,
    files: files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))
  };
  await writeFile(marker, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return "written";
}

export interface PublishInput {
  root: ValidatedTargetRoot;
  plan: DeploymentPlan;
  files: PackageFile[];
  exports: RegistryExportStore;
  deploymentRecordId: string;
  planApprovalDecisionId: string;
  hooks?: {
    afterVersionFinalization?(): Promise<void>;
    afterRegistryDeployment?(): Promise<void>;
    beforePointerReplace?(): Promise<void>;
    afterPointerReplace?(): Promise<void>;
  };
  clock?: () => string;
}

function deploymentRecord(input: PublishInput, priorPointer: CurrentPointer | null): RegistryVersion {
  const createdAt = input.clock?.() ?? new Date().toISOString();
  const payload = {
    schema_version: 1,
    action: input.plan.action,
    target: input.plan.target,
    target_alias: input.plan.target_alias,
    release: input.plan.release,
    plan: {
      record_id: derivePlanId(input.plan),
      version: 1,
      digest: digestCanonicalJson(input.plan)
    },
    prior_pointer: priorPointer,
    created_at: createdAt
  } as RegistryVersion["payload"];
  return {
    record_id: input.deploymentRecordId,
    kind: "deployment",
    version: 1,
    schema_version: 1,
    payload,
    payload_digest: digestCanonicalJson(payload),
    previous_version: null,
    created_at: createdAt
  };
}

import { derivePlanRecordId } from "./plan";

function derivePlanId(plan: DeploymentPlan): string {
  return derivePlanRecordId(plan);
}

function lineageFor(input: PublishInput): RegistryLineageEdge[] {
  const planId = derivePlanId(input.plan);
  const planDigest = digestCanonicalJson(input.plan);
  const deployment = deploymentRecord(input, input.plan.expected_current_pointer);
  return [
    {
      schema_version: 1,
      from_record_id: planId,
      from_kind: "deployment_plan",
      from_version: 1,
      from_digest: planDigest,
      relationship: "realized_as",
      to_record_id: deployment.record_id,
      to_kind: "deployment",
      to_version: 1,
      to_digest: deployment.payload_digest,
      created_at: deployment.created_at
    },
    {
      schema_version: 1,
      from_record_id: input.plan.release.record_id,
      from_kind: "release",
      from_version: input.plan.release.version,
      from_digest: input.plan.release.digest,
      relationship: "deployed_as",
      to_record_id: deployment.record_id,
      to_kind: "deployment",
      to_version: 1,
      to_digest: deployment.payload_digest,
      created_at: deployment.created_at
    }
  ];
}

async function revalidate(input: PublishInput): Promise<CurrentPointer | null> {
  const actual = await readTargetPointer(input.root);
  const expected = input.plan.expected_current_pointer;
  const same = (left: CurrentPointer | null, right: CurrentPointer | null): boolean => {
    if (left === null || right === null) return left === right;
    return left.deployment_id === right.deployment_id
      && left.release_id === right.release_id
      && left.release_version === right.release_version
      && left.release_digest === right.release_digest
      && left.pointer_digest === right.pointer_digest;
  };
  if (!same(actual, expected)) {
    throw new PublishError("STALE_DEPLOYMENT", "current target pointer does not match the approved plan");
  }
  if (manifestDigestFor(input.files) !== input.plan.preview_manifest_digest) {
    throw new PublishError("STALE_DEPLOYMENT", "preview files no longer reproduce the approved manifest digest");
  }
  if (input.plan.action === "rollback") {
    const directory = await versionDirectory(input.root, input.plan);
    await readFile(join(directory, ".caphub-version.json")).catch(() => {
      throw new PublishError("STALE_DEPLOYMENT", "rollback target version directory is missing");
    });
  }
  return actual;
}

export async function publishToTarget(input: PublishInput): Promise<{ pointer: CurrentPointer }> {
  const planDigest = digestCanonicalJson(input.plan);
  const incomplete = (await listIncompleteOperations(input.root.root))
    .filter((operation) => operation.deployment_id !== input.deploymentRecordId);
  if (incomplete.length > 0) {
    throw new PublishError("PUBLISH_RECOVERY_REQUIRED", "an interrupted publish must be reconciled first");
  }
  const existingOperation = await readOperation(input.root.root, input.deploymentRecordId);
  if (existingOperation?.stage === "completed" && existingOperation.plan_digest === planDigest) {
    const pointer = await readTargetPointer(input.root);
    const matches = pointer !== null
      && pointer.deployment_id === input.deploymentRecordId
      && pointer.release_id === existingOperation.release.record_id
      && pointer.release_version === existingOperation.release.version
      && pointer.release_digest === existingOperation.release.digest;
    if (!matches) {
      throw new PublishError("STALE_DEPLOYMENT", "completed operation no longer matches the materialized pointer");
    }
    return { pointer };
  }
  const releaseLock = await acquireLock(input.root.root);
  try {
    const priorPointer = await revalidate(input);

    if (input.plan.action === "publish") {
      await writeVersionFiles(input.root, input.plan, input.files);
    }
    await input.hooks?.afterVersionFinalization?.();

    const record = deploymentRecord(input, priorPointer);
    if (!existingOperation || existingOperation.stage === "versioned") {
      if (!existingOperation) {
        await writeOperation(input.root.root, {
          schema_version: 1,
          deployment_id: input.deploymentRecordId,
          plan_digest: planDigest,
          action: input.plan.action,
          stage: "versioned",
          release: input.plan.release,
          manifest_digest: input.plan.preview_manifest_digest,
          created_at: record.created_at
        });
      }
      try {
        const status = await input.exports.realizeDeployment({
          deployment: record,
          planApprovalDecisionId: input.planApprovalDecisionId,
          lineage: lineageFor(input)
        });
        if (status === "created" || status === "existing") {
          await writeOperation(input.root.root, {
            schema_version: 1,
            deployment_id: input.deploymentRecordId,
            plan_digest: planDigest,
            action: input.plan.action,
            stage: "realized",
            release: input.plan.release,
            manifest_digest: input.plan.preview_manifest_digest,
            created_at: record.created_at
          });
        }
      } catch (error) {
        if (error instanceof PostgresExportStoreError) {
          throw new PublishError(error.code as P4ErrorCode, error.message);
        }
        throw error;
      }
    }
    await input.hooks?.afterRegistryDeployment?.();

    await input.hooks?.beforePointerReplace?.();
    const pointer = pointerFor(input.deploymentRecordId, input.plan);
    await writeCurrentPointer(input.root, pointer);
    await input.hooks?.afterPointerReplace?.();
    await writeOperation(input.root.root, {
      schema_version: 1,
      deployment_id: input.deploymentRecordId,
      plan_digest: planDigest,
      action: input.plan.action,
      stage: "completed",
      release: input.plan.release,
      manifest_digest: input.plan.preview_manifest_digest,
      created_at: record.created_at
    });
    return { pointer };
  } catch (error) {
    if (error instanceof PublishError) throw error;
    if (error instanceof ProjectionPathError) {
      throw new PublishError(error.code, error.message);
    }
    throw new PublishError(
      "PUBLISH_RECOVERY_REQUIRED",
      error instanceof Error ? error.message : "publish failed and must be reconciled"
    );
  } finally {
    await releaseLock();
  }
}

export async function reconcileDeployment(input: PublishInput): Promise<{ pointer: CurrentPointer }> {
  const operation = await readOperation(input.root.root, input.deploymentRecordId);
  if (!operation || operation.stage === "completed") {
    const pointer = await readTargetPointer(input.root);
    if (!pointer) throw new PublishError("PUBLISH_RECOVERY_REQUIRED", "nothing to reconcile");
    return { pointer };
  }
  if (operation.plan_digest !== digestCanonicalJson(input.plan)) {
    throw new PublishError("PUBLISH_RECOVERY_REQUIRED", "recovery operation does not match the supplied plan");
  }
  await rm(join(input.root.root, DEPLOYMENT_LOCK_DIRECTORY), { recursive: true, force: true });
  return publishToTarget(input);
}
