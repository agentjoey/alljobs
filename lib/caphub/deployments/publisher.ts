import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { digestCanonicalJson } from "../analysis/digest";
import type { DeploymentPlan, PackageFile, P4ErrorCode } from "../packages/types";
import type { RegistryExportStore } from "../registry/contracts";
import { PostgresExportStoreError } from "../registry/postgres/exports";
import type { RegistryLineageEdge, RegistryVersion } from "../registry/types";
import { ProjectionPathError, resolveSafeDescendant, type ValidatedTargetRoot } from "../projection/paths";
import type { CurrentPointer } from "./plan";
import { derivePlanRecordId } from "./plan";
import {
  acquireLeaseLock,
  DEPLOYMENT_LOCK_DIRECTORY,
  listIncompleteOperations,
  readOperation,
  writeOperation,
  type AcquireLeaseOptions,
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
const VERSION_MARKER = ".caphub-version.json";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function expectedPointerDigest(pointer: Omit<CurrentPointer, "pointer_digest">): string {
  return sha256Hex(digestCanonicalJson({ schema_version: 1, pointer }));
}

/** Parse target-controlled pointer JSON instead of casting to trusted types. */
function parsePointerJson(raw: string): CurrentPointer | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.deployment_id !== "string" || !/^dep_[a-f0-9]{32}$/.test(record.deployment_id)
    || typeof record.release_id !== "string" || !/^rel_[a-f0-9]{32}$/.test(record.release_id)
    || !Number.isInteger(record.release_version) || (record.release_version as number) <= 0
    || typeof record.release_digest !== "string" || !/^[a-f0-9]{64}$/.test(record.release_digest)
    || typeof record.pointer_digest !== "string" || !/^[a-f0-9]{64}$/.test(record.pointer_digest)) {
    return null;
  }
  const pointer = {
    deployment_id: record.deployment_id,
    release_id: record.release_id,
    release_version: record.release_version as number,
    release_digest: record.release_digest
  };
  if (record.pointer_digest !== expectedPointerDigest(pointer)) return null;
  return { ...pointer, pointer_digest: record.pointer_digest };
}

export async function readTargetPointer(root: ValidatedTargetRoot): Promise<CurrentPointer | null> {
  let raw: string;
  try {
    raw = await readFile(join(root.root, CURRENT_POINTER_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return parsePointerJson(raw);
}

async function writeCurrentPointer(root: ValidatedTargetRoot, pointer: CurrentPointer): Promise<void> {
  await writeFileDurable(join(root.root, CURRENT_POINTER_FILE), `${JSON.stringify(pointer, null, 2)}\n`, 0o600);
  await fsyncDirectoryBestEffort(root.root);
}

/** Same-directory exclusive temp file, file fsync, atomic rename. Mandatory for
 * every small durable record; directory fsync stays best-effort. */
async function writeFileDurable(path: string, content: string, mode: number): Promise<void> {
  const directory = dirname(path);
  const temporary = join(directory, `.${path.split("/").pop() ?? "file"}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`);
  const handle = await open(temporary, "wx", mode);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

async function fsyncDirectoryBestEffort(directory: string): Promise<void> {
  try {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Best effort durability for directory entries; file fsync is mandatory.
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
    pointer_digest: expectedPointerDigest(base)
  };
}

function samePointer(left: CurrentPointer | null, right: CurrentPointer | null): boolean {
  if (left === null || right === null) return left === right;
  return left.deployment_id === right.deployment_id
    && left.release_id === right.release_id
    && left.release_version === right.release_version
    && left.release_digest === right.release_digest
    && left.pointer_digest === right.pointer_digest;
}

type ManifestEntry = Pick<PackageFile, "path" | "sha256" | "bytes">;

function manifestDigestForEntries(files: ManifestEntry[]): string {
  return digestCanonicalJson({
    schema_version: 1,
    files: files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))
  });
}

function manifestDigestFor(files: PackageFile[]): string {
  return manifestDigestForEntries(files);
}

async function acquireLock(root: string, operationId: string, options?: AcquireLeaseOptions): Promise<() => Promise<void>> {
  return acquireLeaseLock(root, DEPLOYMENT_LOCK_DIRECTORY, operationId, options);
}

interface VersionMarker {
  schema_version: 1;
  action: "publish" | "rollback";
  release: DeploymentPlan["release"];
  manifest_digest: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

function parseVersionMarker(raw: string): VersionMarker | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const release = record.release as Record<string, unknown> | undefined;
  if (record.schema_version !== 1
    || (record.action !== "publish" && record.action !== "rollback")
    || !release
    || typeof release.record_id !== "string"
    || !Number.isInteger(release.version)
    || typeof release.digest !== "string"
    || typeof record.manifest_digest !== "string"
    || !/^[a-f0-9]{64}$/.test(record.manifest_digest)
    || !Array.isArray(record.files)) {
    return null;
  }
  for (const file of record.files as Array<Record<string, unknown>>) {
    if (typeof file?.path !== "string" || typeof file.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isInteger(file.bytes)) {
      return null;
    }
  }
  return record as unknown as VersionMarker;
}

/** Recursively list regular files below the version directory. Symlinks and
 * any non-regular file fail closed. */
async function listVersionFiles(directory: string, relative = ""): Promise<string[]> {
  const output: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = join(directory, entry.name);
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      throw new PublishError("UNSAFE_TARGET_ROOT", `version directory contains a symlink at ${JSON.stringify(rel)}`);
    }
    if (entry.isDirectory()) {
      output.push(...await listVersionFiles(full, rel));
    } else if (entry.isFile()) {
      output.push(rel);
    } else {
      throw new PublishError("UNSAFE_TARGET_ROOT", `version directory contains a non-regular file at ${JSON.stringify(rel)}`);
    }
  }
  return output;
}

/** Fully verify a materialized version directory against an exact expected
 * file set: paths, byte counts, SHA-256 digests, no missing files, no
 * unexpected files, no symlinks. Never repairs or overwrites. */
async function verifyVersionDirectory(root: ValidatedTargetRoot, relativeDir: string, expected: VersionMarker): Promise<void> {
  if (manifestDigestForEntries(expected.files) !== expected.manifest_digest) {
    throw new PublishError("PACKAGE_DIGEST_CONFLICT", "version marker file manifest does not reproduce its claimed digest");
  }
  const expectedPaths = new Set(expected.files.map((file) => file.path));
  const actualFiles = await listVersionFiles(join(root.root, relativeDir));
  for (const actual of actualFiles) {
    if (actual === VERSION_MARKER) continue;
    if (!expectedPaths.has(actual)) {
      throw new PublishError("PACKAGE_DIGEST_CONFLICT", `unexpected managed file ${JSON.stringify(actual)} in version directory`);
    }
  }
  for (const file of expected.files) {
    const targetPath = await resolveSafeDescendant(root, `${relativeDir}/${file.path}`);
    const metadata = await lstat(targetPath).catch(() => null);
    if (!metadata || metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new PublishError("PACKAGE_DIGEST_CONFLICT", `managed file ${JSON.stringify(file.path)} is missing or unsafe`);
    }
    const raw = await readFile(targetPath);
    if (raw.byteLength !== file.bytes) {
      throw new PublishError("PACKAGE_DIGEST_CONFLICT", `managed file ${JSON.stringify(file.path)} has ${raw.byteLength} bytes, expected ${file.bytes}`);
    }
    if (createHash("sha256").update(raw).digest("hex") !== file.sha256) {
      throw new PublishError("PACKAGE_DIGEST_CONFLICT", `managed file ${JSON.stringify(file.path)} digest mismatch`);
    }
  }
}

async function versionDirectory(root: ValidatedTargetRoot, plan: DeploymentPlan): Promise<string> {
  const relative = `versions/${plan.release.record_id}/${plan.release.version}/${plan.preview_manifest_digest}`;
  return resolveSafeDescendant(root, relative);
}

/** Read and fully verify the active version directory named by a validated
 * operation record, returning its preimage contribution. */
async function verifiedManifestState(
  root: ValidatedTargetRoot,
  pointer: CurrentPointer,
  operation: OperationRecord
): Promise<{ marker: VersionMarker; relativeDir: string }> {
  if (operation.release.record_id !== pointer.release_id
    || operation.release.version !== pointer.release_version
    || operation.release.digest !== pointer.release_digest) {
    throw new PublishError("STALE_DEPLOYMENT", "operation record does not match the active pointer");
  }
  const relativeDir = `versions/${pointer.release_id}/${pointer.release_version}/${operation.manifest_digest}`;
  const directory = await resolveSafeDescendant(root, relativeDir);
  const markerRaw = await readFile(join(directory, VERSION_MARKER), "utf8").catch(() => null);
  if (markerRaw === null) {
    throw new PublishError("STALE_DEPLOYMENT", "active version directory has no marker");
  }
  const marker = parseVersionMarker(markerRaw);
  if (!marker
    || marker.manifest_digest !== operation.manifest_digest
    || marker.action !== "publish"
    || marker.release.record_id !== pointer.release_id
    || marker.release.version !== pointer.release_version
    || marker.release.digest !== pointer.release_digest) {
    throw new PublishError("STALE_DEPLOYMENT", "active version marker does not match the operation record");
  }
  await verifyVersionDirectory(root, relativeDir, marker);
  return { marker, relativeDir: directory };
}

/** Read and validate the active pointer and its operation record, returning
 * the exact active manifest directory. Shared by publish revalidation, dry-run
 * previews, and tests so the preimage path convention stays identical. */
export async function readManifestDirectoryForPointer(rootDir: string, pointer: CurrentPointer): Promise<{
  pointer: CurrentPointer;
  operation: OperationRecord;
  directory: string;
}> {
  const operation = await readOperation(rootDir, pointer.deployment_id);
  if (!operation) {
    throw new PublishError("STALE_DEPLOYMENT", "pointer has no operation record");
  }
  if (operation.stage !== "completed"
    || operation.release.record_id !== pointer.release_id
    || operation.release.version !== pointer.release_version
    || operation.release.digest !== pointer.release_digest) {
    throw new PublishError("STALE_DEPLOYMENT", "completed operation record does not match the pointer");
  }
  return {
    pointer,
    operation,
    directory: join(rootDir, "versions", pointer.release_id, String(pointer.release_version), operation.manifest_digest)
  };
}

export async function readActiveManifestDirectory(rootDir: string): Promise<{
  pointer: CurrentPointer;
  operation: OperationRecord;
  directory: string;
} | null> {
  const pointerRaw = await readFile(join(rootDir, CURRENT_POINTER_FILE), "utf8").catch(() => null);
  if (pointerRaw === null) return null;
  const pointer = parsePointerJson(pointerRaw);
  if (!pointer) {
    throw new PublishError("STALE_DEPLOYMENT", "current.json is not a valid pointer");
  }
  return readManifestDirectoryForPointer(rootDir, pointer);
}

/** Reproduce the digest over the currently materialized target state. Files
 * are named relative to the active manifest directory. */
export async function computeTargetPreimage(root: ValidatedTargetRoot): Promise<string> {
  const active = await readActiveManifestDirectory(root.root);
  if (active === null) {
    return digestCanonicalJson({ schema_version: 1, pointer: null, files: [] });
  }
  const directory = await resolveSafeDescendant(root, active.directory.slice(root.root.length + 1));
  const markerRaw = await readFile(join(directory, VERSION_MARKER), "utf8").catch(() => null);
  if (markerRaw === null) {
    throw new PublishError("STALE_DEPLOYMENT", "active version directory has no marker");
  }
  const marker = parseVersionMarker(markerRaw);
  if (!marker || marker.manifest_digest !== active.operation.manifest_digest) {
    throw new PublishError("STALE_DEPLOYMENT", "active version marker does not match the operation record");
  }
  await verifyVersionDirectory(root, active.directory.slice(root.root.length + 1), marker);
  return digestCanonicalJson({
    schema_version: 1,
    pointer: active.pointer,
    files: marker.files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))
  });
}

async function writeVersionFiles(
  root: ValidatedTargetRoot,
  plan: DeploymentPlan,
  files: PackageFile[]
): Promise<"written" | "existing"> {
  const directory = await versionDirectory(root, plan);
  const relativeDir = directory.slice(root.root.length + 1);
  const markerPath = join(directory, VERSION_MARKER);
  const markerRaw = await readFile(markerPath, "utf8").catch(() => null);
  if (markerRaw !== null) {
    const marker = parseVersionMarker(markerRaw);
    if (!marker
      || marker.manifest_digest !== plan.preview_manifest_digest
      || marker.action !== plan.action
      || marker.release.record_id !== plan.release.record_id
      || marker.release.version !== plan.release.version
      || marker.release.digest !== plan.release.digest) {
      throw new PublishError("PACKAGE_DIGEST_CONFLICT", "version directory already holds different content");
    }
    // The marker is target state: verify the exact bytes it declares.
    await verifyVersionDirectory(root, relativeDir, marker);
    return "existing";
  }
  // Resume-safe materialization. Any pre-existing file that is not part of
  // the approved plan fails closed; matching planned files are verified.
  const plannedPaths = new Set(files.map((file) => file.path));
  const preexisting = await listVersionFiles(directory).catch(() => [] as string[]);
  for (const actual of preexisting) {
    if (!plannedPaths.has(actual)) {
      throw new PublishError("PACKAGE_DIGEST_CONFLICT", `unexpected file ${JSON.stringify(actual)} in version directory`);
    }
  }
  for (const file of files) {
    const targetPath = await resolveSafeDescendant(root, `${relativeDir}/${file.path}`);
    const present = await readFile(targetPath).catch(() => null);
    if (present !== null) {
      if (present.byteLength !== file.bytes
        || createHash("sha256").update(present).digest("hex") !== file.sha256) {
        throw new PublishError("PACKAGE_DIGEST_CONFLICT", `file ${file.path} exists with different content`);
      }
      continue;
    }
    await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
    await writeFileDurable(targetPath, file.content, 0o600);
    const digest = createHash("sha256").update(file.content, "utf8").digest("hex");
    if (digest !== file.sha256) {
      throw new PublishError("PACKAGE_DIGEST_CONFLICT", `file ${file.path} failed digest verification during write`);
    }
  }
  const manifest: VersionMarker = {
    schema_version: 1,
    action: plan.action,
    release: plan.release,
    manifest_digest: plan.preview_manifest_digest,
    files: files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))
  };
  await writeFileDurable(markerPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o600);
  await fsyncDirectoryBestEffort(directory);
  return "written";
}

export interface PublishInput {
  root: ValidatedTargetRoot;
  plan: DeploymentPlan;
  files: PackageFile[];
  exports: RegistryExportStore;
  deploymentRecordId: string;
  planApprovalDecisionId: string;
  /** Mandatory spec §9.2 apply-time authority revalidation. Must throw a P4
   * coded error on any mismatch; the publish fails closed when absent. The
   * implementation must reproduce the preview diff digest and adapter
   * identity/digests; the publisher passes its own reproduced evidence. */
  assertAuthority: (plan: DeploymentPlan, evidence: ApplyEvidence) => Promise<void>;
  /** Injectable lease liveness/staleness for recovery tests. */
  lock?: AcquireLeaseOptions;
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
      record_id: derivePlanRecordId(input.plan),
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

function lineageFor(input: PublishInput): RegistryLineageEdge[] {
  const planId = derivePlanRecordId(input.plan);
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

export interface ApplyEvidence {
  manifestDigest: string;
  /** Null while the target preimage is still being reproduced. */
  preimageDigest: string | null;
}

async function runAuthority(input: PublishInput, evidence: ApplyEvidence): Promise<void> {
  if (typeof input.assertAuthority !== "function") {
    throw new PublishError("DEPLOYMENT_NOT_APPROVED", "apply-time authority revalidation is mandatory");
  }
  try {
    await input.assertAuthority(input.plan, evidence);
  } catch (error) {
    if (error instanceof PublishError) throw error;
    const code = error && typeof error === "object" && "code" in error
      && typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code as P4ErrorCode
      : "DEPLOYMENT_NOT_APPROVED";
    throw new PublishError(code, error instanceof Error ? error.message : "authority revalidation failed");
  }
}

/** Strict pre-state revalidation: authority, pointer shape + expectation,
 * target preimage reproduction, and preview manifest reproduction. */
async function fullRevalidate(input: PublishInput): Promise<CurrentPointer | null> {
  if (manifestDigestFor(input.files) !== input.plan.preview_manifest_digest) {
    throw new PublishError("STALE_DEPLOYMENT", "preview files no longer reproduce the approved manifest digest");
  }
  await runAuthority(input, { manifestDigest: input.plan.preview_manifest_digest, preimageDigest: null });
  const actual = await readTargetPointer(input.root);
  if (!samePointer(actual, input.plan.expected_current_pointer)) {
    throw new PublishError("STALE_DEPLOYMENT", "current target pointer does not match the approved plan");
  }
  const preimage = await computeTargetPreimage(input.root);
  if (preimage !== input.plan.target_preimage_digest) {
    throw new PublishError("STALE_DEPLOYMENT", "target state no longer reproduces the approved preimage digest");
  }
  if (input.plan.action === "rollback") {
    const directory = await versionDirectory(input.root, input.plan);
    const markerRaw = await readFile(join(directory, VERSION_MARKER), "utf8").catch(() => {
      throw new PublishError("STALE_DEPLOYMENT", "rollback target version directory is missing");
    });
    const marker = parseVersionMarker(markerRaw);
    if (!marker
      || marker.action !== "publish"
      || marker.manifest_digest !== input.plan.preview_manifest_digest
      || marker.release.record_id !== input.plan.release.record_id
      || marker.release.version !== input.plan.release.version
      || marker.release.digest !== input.plan.release.digest) {
      throw new PublishError("STALE_DEPLOYMENT", "rollback target marker does not match the approved release");
    }
    await verifyVersionDirectory(input.root, directory.slice(input.root.root.length + 1), marker);
  }
  return actual;
}

export async function publishToTarget(input: PublishInput): Promise<{ pointer: CurrentPointer }> {
  const planDigest = digestCanonicalJson(input.plan);
  const resultPointer = pointerFor(input.deploymentRecordId, input.plan);
  const incomplete = (await listIncompleteOperations(input.root.root))
    .filter((operation) => operation.deployment_id !== input.deploymentRecordId);
  if (incomplete.length > 0) {
    throw new PublishError("PUBLISH_RECOVERY_REQUIRED", "an interrupted publish must be reconciled first");
  }
  const existingOperation = await readOperation(input.root.root, input.deploymentRecordId);

  // Idempotent replay is anchored on a validated completed operation for this
  // exact plan/deployment, a valid pointer, and fully verified durable
  // version bytes — never on current.json alone.
  if (existingOperation && existingOperation.stage === "completed" && existingOperation.plan_digest === planDigest) {
    const pointer = await readTargetPointer(input.root);
    if (!samePointer(pointer, resultPointer)) {
      throw new PublishError("STALE_DEPLOYMENT", "completed operation no longer matches the materialized pointer");
    }
    await verifiedManifestState(input.root, pointer!, existingOperation);
    await runAuthority(input, {
      manifestDigest: existingOperation.manifest_digest,
      preimageDigest: input.plan.target_preimage_digest
    });
    return { pointer: pointer! };
  }

  const releaseLock = await acquireLock(input.root.root, input.deploymentRecordId, input.lock);
  try {
    const currentPointer = await readTargetPointer(input.root);

    // Crash-after-pointer convergence: a realized operation for this exact
    // plan plus the resulting pointer plus verified versions may complete.
    if (existingOperation && existingOperation.plan_digest === planDigest
      && existingOperation.stage === "realized"
      && samePointer(currentPointer, resultPointer)) {
      await verifiedManifestState(input.root, currentPointer!, existingOperation);
      await runAuthority(input, {
        manifestDigest: existingOperation.manifest_digest,
        preimageDigest: input.plan.target_preimage_digest
      });
      await writeOperation(input.root.root, {
        schema_version: 1,
        deployment_id: input.deploymentRecordId,
        plan_digest: planDigest,
        action: input.plan.action,
        stage: "completed",
        release: input.plan.release,
        manifest_digest: input.plan.preview_manifest_digest,
        created_at: existingOperation.created_at
      });
      return { pointer: currentPointer! };
    }

    const priorPointer = await fullRevalidate(input);

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
    await writeCurrentPointer(input.root, resultPointer);
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
    return { pointer: resultPointer };
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
  return publishToTarget(input);
}
