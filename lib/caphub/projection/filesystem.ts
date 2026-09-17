import { createHash } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { P4ErrorCode, ProjectionEntry } from "../packages/types";
import { parseObsidianDocument } from "./markers";
import { ProjectionPathError, resolveSafeDescendant, type ValidatedTargetRoot } from "./paths";
import type { ProjectionDocumentInput } from "./planner";
import { renderObsidianDocument } from "./render";

const LOCK_DIRECTORY = ".caphub-projection.lock";
const RECOVERY_FILE = ".caphub-projection-recovery.json";

export class ProjectionApplyError extends Error {
  constructor(
    readonly code: P4ErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "ProjectionApplyError";
  }
}

export interface ApplyHooks {
  beforeWrite?(relativePath: string): Promise<void>;
  afterWrite?(relativePath: string): Promise<void>;
}

export interface ApplyInput {
  root: ValidatedTargetRoot;
  plan: {
    entries: ProjectionEntry[];
    postimage_digest: string;
  };
  documents: ProjectionDocumentInput[];
  /** Injectable lease liveness/staleness for recovery tests. */
  lock?: import("../deployments/recovery").AcquireLeaseOptions;
  hooks?: ApplyHooks;
}

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function acquireLock(root: string, operationId: string, options?: import("../deployments/recovery").AcquireLeaseOptions): Promise<() => Promise<void>> {
  const { acquireLeaseLock } = await import("../deployments/recovery");
  return acquireLeaseLock(root, LOCK_DIRECTORY, operationId, options);
}

async function readRecovery(root: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(join(root, RECOVERY_FILE), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeRecovery(root: string, record: unknown): Promise<void> {
  const { open, rename } = await import("node:fs/promises");
  const path = join(root, RECOVERY_FILE);
  const temporary = join(root, `.caphub-projection-recovery.json.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

async function fsyncDirectory(directory: string): Promise<void> {
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

async function writeFileAtomic(targetPath: string, content: string, mode: number | null): Promise<void> {
  const directory = dirname(targetPath);
  const temporary = join(directory, `.${targetPath.split("/").pop() ?? "file"}.caphub-tmp-${process.pid}-${Math.random().toString(16).slice(2)}`);
  const handle = await open(temporary, "wx", mode ?? 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (mode !== null) {
    await chmod(temporary, mode);
  }
  await rename(temporary, targetPath);
  await fsyncDirectory(directory);
}

async function entryContent(root: ValidatedTargetRoot, document: ProjectionDocumentInput): Promise<string> {
  return renderObsidianDocument({
    record_id: document.record_id,
    record_version: document.record_version,
    record_digest: document.record_digest,
    managed_markdown: document.managed_markdown,
    human_content: document.human_content
  }).content;
}

async function applyOne(
  root: ValidatedTargetRoot,
  entry: ProjectionEntry,
  document: ProjectionDocumentInput,
  hooks: ApplyHooks | undefined
): Promise<"written" | "skipped"> {
  const targetPath = await resolveSafeDescendant(root, entry.relative_path);
  const content = await entryContent(root, document);
  const renderedDigest = createHash("sha256").update(content, "utf8").digest("hex");
  if (renderedDigest !== entry.postimage_digest) {
    throw new ProjectionApplyError("STALE_PREIMAGE", "document content no longer matches the planned postimage");
  }

  const existing = await readFile(targetPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  });

  if (existing !== null) {
    const currentDigest = sha256Hex(existing);
    if (currentDigest === entry.postimage_digest) return "skipped";
    if (entry.preimage_digest === null || currentDigest !== entry.preimage_digest) {
      let owned = false;
      try {
        const parsed = parseObsidianDocument(existing.toString("utf8"));
        owned = parsed.record_id === entry.record_id;
      } catch {
        owned = false;
      }
      throw new ProjectionApplyError(
        owned ? "STALE_PREIMAGE" : "PROJECTION_CONFLICT",
        owned ? "planned file changed after planning" : "refusing to overwrite a foreign file"
      );
    }
  } else if (entry.preimage_digest !== null) {
    throw new ProjectionApplyError("STALE_PREIMAGE", "planned file disappeared before apply");
  }

  await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
  let mode: number | null = null;
  if (existing !== null) {
    mode = (await stat(targetPath)).mode & 0o777;
  }
  await hooks?.beforeWrite?.(entry.relative_path);
  await writeFileAtomic(targetPath, content, mode);
  await hooks?.afterWrite?.(entry.relative_path);
  return "written";
}

export async function applyProjectionPlan(input: ApplyInput): Promise<{ applied: number }> {
  const recovery = await readRecovery(input.root.root);
  if (recovery !== null) {
    throw new ProjectionApplyError("PUBLISH_RECOVERY_REQUIRED", "an interrupted apply must be reconciled first");
  }
  const releaseLock = await acquireLock(input.root.root, input.plan.postimage_digest, input.lock);
  let applied = 0;
  try {
    const documentsByPath = new Map(input.documents.map((document) => [document.relative_path, document]));
    for (const entry of input.plan.entries) {
      if (entry.action === "unchanged" || entry.action === "orphan") continue;
      if (entry.action === "conflict") {
        throw new ProjectionApplyError("PROJECTION_CONFLICT", entry.conflict_reason ?? "planned conflict");
      }
      const document = documentsByPath.get(entry.relative_path);
      if (!document) {
        throw new ProjectionApplyError("STALE_PREIMAGE", `missing document for ${entry.relative_path}`);
      }
      const outcome = await applyOne(input.root, entry, document, input.hooks);
      if (outcome === "written") applied += 1;
    }
    return { applied };
  } catch (error) {
    if (!(error instanceof ProjectionApplyError) && !(error instanceof ProjectionPathError)) {
      await writeRecovery(input.root.root, {
        schema_version: 1,
        plan_postimage_digest: input.plan.postimage_digest,
        code: "PUBLISH_RECOVERY_REQUIRED",
        detail: error instanceof Error ? error.message : String(error),
        occurred_at: new Date().toISOString()
      });
      throw new ProjectionApplyError(
        "PUBLISH_RECOVERY_REQUIRED",
        error instanceof Error ? error.message : "apply failed and must be reconciled"
      );
    }
    await writeRecovery(input.root.root, {
      schema_version: 1,
      plan_postimage_digest: input.plan.postimage_digest,
      code: error.code,
      occurred_at: new Date().toISOString()
    });
    throw error;
  } finally {
    await releaseLock();
  }
}

export async function reconcileProjection(input: ApplyInput): Promise<{ applied: number }> {
  const recovery = await readRecovery(input.root.root);
  if (recovery === null) return { applied: 0 };
  const record = recovery as { plan_postimage_digest?: unknown };
  if (record.plan_postimage_digest !== input.plan.postimage_digest) {
    throw new ProjectionApplyError("PUBLISH_RECOVERY_REQUIRED", "recovery record does not match the supplied plan");
  }
  await rm(join(input.root.root, RECOVERY_FILE), { force: true });
  const result = await applyProjectionPlan(input);
  return result;
}
