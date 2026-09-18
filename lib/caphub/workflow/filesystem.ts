import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  open,
  readdir,
  rename,
  unlink,
  type FileHandle
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  analysisJobSchema,
  modelCallAuditEventSchema,
  stageArtifactSchema
} from "../analysis/schemas";
import type {
  AnalysisJob,
  AnalysisStage,
  ModelCallAuditEvent,
  StageArtifact
} from "../analysis/types";
import { canonicalJson } from "../analysis/digest";
import { objectRefSchema } from "../domain/schemas";
import {
  assertSecureDirectoryChain,
  assertSecureFileHandle,
  ensureSecureDirectoryChain,
  syncDirectory
} from "../storage/local-objects";
import {
  analysisArtifactRecordPath,
  analysisJobRecordPath,
  modelCallEventsPath,
  objectPath,
  resolveCaphubRoot
} from "../storage/paths";
import { deterministicModelCallIds } from "./audit";
import type {
  AnalysisJobStore,
  CreateStageArtifactInput,
  ReadableModelCallAuditStore,
  StageArtifactStore
} from "./contracts";

const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const MAX_JOB_BYTES = 64 * 1024;
const MAX_ARTIFACT_RECORD_BYTES = 64 * 1024;
const MAX_ARTIFACT_PAYLOAD_BYTES = 8 * 1024 * 1024;
const MAX_AUDIT_BYTES = 16 * 1024 * 1024;
const MAX_ARTIFACT_RECORDS = 10_000;
const chains = new Map<string, Promise<void>>();

export class ImmutableWorkflowRecordError extends Error {
  readonly code = "immutable_workflow_record_conflict" as const;

  constructor(message = "immutable workflow record has conflicting bytes") {
    super(message);
    this.name = "ImmutableWorkflowRecordError";
  }
}

export interface AnalysisJobFileOperations {
  beforeReplace(tempPath: string, finalPath: string): Promise<void>;
}

async function serializeByPath<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = chains.get(path) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  const marker = run.then(() => undefined, () => undefined);
  chains.set(path, marker);
  try {
    return await run;
  } finally {
    if (chains.get(path) === marker) chains.delete(path);
  }
}

async function writeAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, offset);
    if (bytesWritten <= 0) throw new Error("unable to make progress writing workflow bytes");
    offset += bytesWritten;
  }
}

async function appendAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes.subarray(offset));
    if (bytesWritten <= 0) throw new Error("unable to make progress appending workflow bytes");
    offset += bytesWritten;
  }
}

async function readAll(handle: FileHandle, size: number): Promise<Buffer> {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return bytes.subarray(0, offset);
}

async function assertExactFileMode(handle: FileHandle): Promise<void> {
  await assertSecureFileHandle(handle);
  if (((await handle.stat()).mode & 0o777) !== FILE_MODE) {
    throw new Error("workflow files must use mode 0600");
  }
}

async function assertExactDirectoryMode(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== DIRECTORY_MODE) {
    throw new Error("workflow directories must use mode 0700 and must not be symlinks");
  }
}

async function ensureWorkflowParent(root: string, parent: string): Promise<void> {
  await ensureSecureDirectoryChain(root, parent);
  await assertSecureDirectoryChain(root, parent);
  let current = root;
  const relative = parent.slice(root.length).split("/").filter(Boolean);
  await assertExactDirectoryMode(current);
  for (const segment of relative) {
    current = join(current, segment);
    await assertExactDirectoryMode(current);
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

async function readOptional(root: string, path: string, maximumBytes: number): Promise<Buffer | null> {
  const parent = dirname(path);
  try {
    await assertSecureDirectoryChain(root, parent);
    await assertExactDirectoryMode(parent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (/unable to inspect required Caphub directory/.test(String((error as Error).message))) return null;
    throw error;
  }
  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    await assertExactFileMode(handle);
    await assertSecureDirectoryChain(root, parent);
    const stat = await handle.stat();
    if (stat.size > maximumBytes) throw new Error("workflow record exceeds its bounded size");
    return await readAll(handle, stat.size);
  } finally {
    await handle.close();
  }
}

async function atomicCreate(root: string, finalPath: string, bytes: Uint8Array): Promise<boolean> {
  const parent = dirname(finalPath);
  await ensureWorkflowParent(root, parent);
  const tempPath = join(parent, `.${basename(finalPath)}.${randomUUID()}.tmp`);
  const handle = await open(
    tempPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
    FILE_MODE
  );
  try {
    await assertExactFileMode(handle);
    await writeAll(handle, bytes);
    await handle.sync();
    const staged = await readAll(handle, bytes.byteLength);
    if (!equalBytes(staged, bytes)) throw new Error("staged workflow bytes changed before publish");
    try {
      await link(tempPath, finalPath);
      await syncDirectory(parent);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  } finally {
    await handle.close();
    try {
      await unlink(tempPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function atomicReplace(
  root: string,
  finalPath: string,
  bytes: Uint8Array,
  operations: AnalysisJobFileOperations
): Promise<void> {
  const parent = dirname(finalPath);
  await ensureWorkflowParent(root, parent);
  const tempPath = join(parent, `.${basename(finalPath)}.${randomUUID()}.tmp`);
  const handle = await open(
    tempPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
    FILE_MODE
  );
  try {
    await assertExactFileMode(handle);
    await writeAll(handle, bytes);
    await handle.sync();
    if (!equalBytes(await readAll(handle, bytes.byteLength), bytes)) {
      throw new Error("staged analysis job changed before replacement");
    }
    await operations.beforeReplace(tempPath, finalPath);
    await assertSecureDirectoryChain(root, parent);
    await rename(tempPath, finalPath);
    await syncDirectory(parent);
  } finally {
    await handle.close();
    try {
      await unlink(tempPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function decodeJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`invalid ${label} JSON`, { cause: error });
  }
}

export class FilesystemAnalysisJobStore implements AnalysisJobStore {
  private readonly root: string;
  private readonly operations: AnalysisJobFileOperations;

  constructor(root: string, operations: Partial<AnalysisJobFileOperations> = {}) {
    this.root = resolveCaphubRoot(root);
    this.operations = { beforeReplace: operations.beforeReplace ?? (async () => undefined) };
  }

  async get(id: string): Promise<AnalysisJob | null> {
    const path = analysisJobRecordPath(this.root, id);
    const bytes = await readOptional(this.root, path, MAX_JOB_BYTES);
    return bytes === null ? null : analysisJobSchema.parse(decodeJson(bytes, "analysis job"));
  }

  async put(job: AnalysisJob): Promise<void> {
    const parsed = analysisJobSchema.parse(job);
    const path = analysisJobRecordPath(this.root, parsed.id);
    const bytes = new TextEncoder().encode(`${canonicalJson(parsed)}\n`);
    await serializeByPath(path, () => atomicReplace(this.root, path, bytes, this.operations));
  }
}

export class FilesystemStageArtifactStore implements StageArtifactStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolveCaphubRoot(root);
  }

  async get(id: string): Promise<StageArtifact | null> {
    const path = analysisArtifactRecordPath(this.root, id);
    const bytes = await readOptional(this.root, path, MAX_ARTIFACT_RECORD_BYTES);
    return bytes === null ? null : stageArtifactSchema.parse(decodeJson(bytes, "stage artifact"));
  }

  async create(input: CreateStageArtifactInput): Promise<StageArtifact> {
    const serialized = canonicalJson(input.payload);
    const payloadBytes = new TextEncoder().encode(serialized);
    if (payloadBytes.byteLength > MAX_ARTIFACT_PAYLOAD_BYTES) {
      throw new Error("stage artifact payload exceeds its bounded size");
    }
    const outputDigest = createHash("sha256").update(payloadBytes).digest("hex");
    const ref = objectRefSchema.parse({
      algorithm: "sha256",
      digest: outputDigest,
      key: `sha256/${outputDigest.slice(0, 2)}/${outputDigest}`,
      bytes: payloadBytes.byteLength
    });
    const artifact = stageArtifactSchema.parse({
      schema_version: 1,
      id: `art_${outputDigest}`,
      job_id: input.jobId,
      capture_id: input.captureId,
      stage: input.stage,
      input_digest: input.inputDigest,
      output_digest: outputDigest,
      payload_schema_version: 1,
      object: ref,
      created_at: input.createdAt
    });

    const payloadPath = objectPath(this.root, outputDigest);
    const createdPayload = await atomicCreate(this.root, payloadPath, payloadBytes);
    if (!createdPayload) {
      const existing = await readOptional(this.root, payloadPath, MAX_ARTIFACT_PAYLOAD_BYTES);
      if (existing === null || !equalBytes(existing, payloadBytes)) throw new ImmutableWorkflowRecordError();
    }

    const recordPath = analysisArtifactRecordPath(this.root, artifact.id);
    const recordBytes = new TextEncoder().encode(`${canonicalJson(artifact)}\n`);
    const createdRecord = await atomicCreate(this.root, recordPath, recordBytes);
    if (!createdRecord) {
      const existing = await readOptional(this.root, recordPath, MAX_ARTIFACT_RECORD_BYTES);
      if (existing === null || !equalBytes(existing, recordBytes)) throw new ImmutableWorkflowRecordError();
    }
    return artifact;
  }

  async readPayload(id: string): Promise<unknown | null> {
    const artifact = await this.get(id);
    if (!artifact) return null;
    const bytes = await readOptional(this.root, objectPath(this.root, artifact.output_digest), MAX_ARTIFACT_PAYLOAD_BYTES);
    if (bytes === null || createHash("sha256").update(bytes).digest("hex") !== artifact.output_digest) {
      throw new ImmutableWorkflowRecordError("stage artifact payload does not match its digest");
    }
    return decodeJson(bytes, "stage artifact payload");
  }

  async findByJobStage(jobId: string, stage: AnalysisStage): Promise<StageArtifact | null> {
    const probe = analysisArtifactRecordPath(this.root, `art_${"0".repeat(64)}`);
    const directory = dirname(probe);
    try {
      await assertSecureDirectoryChain(this.root, directory);
      await assertExactDirectoryMode(directory);
    } catch (error) {
      if (/unable to inspect required Caphub directory/.test(String((error as Error).message))) return null;
      throw error;
    }
    const entries = await readdir(directory);
    if (entries.length > MAX_ARTIFACT_RECORDS) throw new Error("too many stage artifact records");
    let match: StageArtifact | null = null;
    for (const entry of entries.sort()) {
      if (!/^art_[a-f0-9]{64}\.json$/.test(entry)) {
        throw new Error("unexpected file in stage artifact directory");
      }
      const artifact = await this.get(entry.slice(0, -5));
      if (artifact?.job_id === jobId && artifact.stage === stage) {
        if (match && match.id !== artifact.id) {
          throw new ImmutableWorkflowRecordError("multiple immutable artifacts exist for one job stage");
        }
        match = artifact;
      }
    }
    return match;
  }
}

function parseAuditPrefix(bytes: Buffer): ModelCallAuditEvent[] {
  const lastNewline = bytes.lastIndexOf(0x0a);
  if (lastNewline < 0) return [];
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, lastNewline + 1));
  return text.split("\n").filter(Boolean).map((line) => modelCallAuditEventSchema.parse(JSON.parse(line)));
}

function assertDeterministicAuditId(event: ModelCallAuditEvent): void {
  const ids = deterministicModelCallIds({
    jobId: event.job_id,
    captureId: event.capture_id,
    stage: event.stage,
    provider: event.provider,
    model: event.model,
    attempt: event.attempt,
    inputDigest: event.input_digest,
    ...(event.operation ? { operation: event.operation } : {})
  }, event.type);
  if (event.call_id !== ids.callId || event.event_id !== ids.eventId) {
    throw new Error("model-call audit identifiers must be deterministic");
  }
}

export class FilesystemModelCallAuditStore implements ReadableModelCallAuditStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolveCaphubRoot(root);
  }

  async list(jobId: string): Promise<ModelCallAuditEvent[]> {
    const path = modelCallEventsPath(this.root, jobId);
    const bytes = await readOptional(this.root, path, MAX_AUDIT_BYTES);
    if (bytes === null) return [];
    const events = parseAuditPrefix(bytes);
    for (const event of events) {
      if (event.job_id !== jobId) throw new ImmutableWorkflowRecordError("audit event is stored under another job");
      assertDeterministicAuditId(event);
    }
    return events;
  }

  async append(event: ModelCallAuditEvent): Promise<void> {
    const parsed = modelCallAuditEventSchema.parse(event);
    assertDeterministicAuditId(parsed);
    const path = modelCallEventsPath(this.root, parsed.job_id);
    await serializeByPath(path, async () => {
      const parent = dirname(path);
      await ensureWorkflowParent(this.root, parent);
      const existingBytes = await readOptional(this.root, path, MAX_AUDIT_BYTES);
      const existing = existingBytes === null ? [] : parseAuditPrefix(existingBytes);
      const matching = existing.find((candidate) => candidate.event_id === parsed.event_id);
      if (matching) {
        if (canonicalJson(matching) !== canonicalJson(parsed)) throw new ImmutableWorkflowRecordError();
        return;
      }
      if (existingBytes && existingBytes.length > 0 && existingBytes.at(-1) !== 0x0a) {
        const completeLength = existingBytes.lastIndexOf(0x0a) + 1;
        const repair = await open(path, constants.O_WRONLY | constants.O_NOFOLLOW);
        try {
          await assertExactFileMode(repair);
          await repair.truncate(completeLength);
          await repair.sync();
        } finally {
          await repair.close();
        }
      }
      const bytes = new TextEncoder().encode(`${canonicalJson(parsed)}\n`);
      const handle = await open(
        path,
        constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW,
        FILE_MODE
      );
      try {
        await assertExactFileMode(handle);
        await appendAll(handle, bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await syncDirectory(parent);
    });
  }
}
