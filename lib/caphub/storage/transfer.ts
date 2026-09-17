import { createHash } from "node:crypto";
import { planFilesystemCaptureImport } from "../registry/filesystem-import";
import type { CaptureMimeType, ObjectRef } from "../domain/types";
import type { ReadableCaptureObjectStore } from "./contracts";

export interface ImmutableObjectCatalog extends ReadableCaptureObjectStore {
  listImmutableKeys(prefix: "sha256/"): Promise<string[]>;
}

export interface FilesystemObjectTransferPlan {
  sourceDigest: string;
  objects: Array<{ ref: ObjectRef; mimeType: CaptureMimeType }>;
}

function sameRef(left: ObjectRef, right: ObjectRef): boolean {
  return left.algorithm === right.algorithm && left.digest === right.digest
    && left.key === right.key && left.bytes === right.bytes;
}

function uniqueSortedRefs(manifest: Awaited<ReturnType<typeof planFilesystemCaptureImport>>): FilesystemObjectTransferPlan["objects"] {
  const refs = new Map<string, { ref: ObjectRef; mimeType: CaptureMimeType }>();
  for (const capture of manifest.captures) {
    const ref: ObjectRef = {
      algorithm: "sha256",
      digest: capture.object_digest,
      key: `sha256/${capture.object_digest.slice(0, 2)}/${capture.object_digest}`,
      bytes: capture.object_bytes
    };
    const candidate = { ref, mimeType: capture.object_mime_type };
    const existing = refs.get(ref.digest);
    if (existing && (!sameRef(existing.ref, ref) || existing.mimeType !== candidate.mimeType)) {
      throw new Error("filesystem object manifest has conflicting immutable refs");
    }
    refs.set(ref.digest, candidate);
  }
  if (refs.size !== manifest.counts.objects) throw new Error("filesystem object manifest count is inconsistent");
  return [...refs.values()].sort((left, right) => left.ref.key.localeCompare(right.ref.key));
}

function verifyBytes(ref: ObjectRef, bytes: Uint8Array): void {
  if (bytes.byteLength !== ref.bytes || createHash("sha256").update(bytes).digest("hex") !== ref.digest) {
    throw new Error("immutable object bytes disagree with its manifest ref");
  }
}

export async function planFilesystemObjectTransfer(input: { root: string }): Promise<FilesystemObjectTransferPlan> {
  const manifest = await planFilesystemCaptureImport({ root: input.root });
  return { sourceDigest: manifest.source_digest, objects: uniqueSortedRefs(manifest) };
}

export async function applyFilesystemObjectTransfer(input: {
  root: string;
  expectedSourceDigest: string;
  source: ReadableCaptureObjectStore;
  destination: ImmutableObjectCatalog;
}): Promise<{ sourceDigest: string; objectCount: number; verifiedObjectCount: number }> {
  if (!/^[a-f0-9]{64}$/.test(input.expectedSourceDigest)) throw new Error("expected source digest is invalid");
  const before = await planFilesystemObjectTransfer({ root: input.root });
  if (before.sourceDigest !== input.expectedSourceDigest) {
    throw new Error("filesystem Capture source changed before object transfer");
  }

  for (const { ref, mimeType } of before.objects) {
    const sourceBytes = await input.source.readImmutable(ref);
    verifyBytes(ref, sourceBytes);
    const stored = await input.destination.putImmutable({ bytes: sourceBytes, mimeType });
    if (!sameRef(stored, ref)) throw new Error("remote immutable object ref disagrees with source manifest");
    verifyBytes(ref, await input.destination.readImmutable(ref));
  }

  const after = await planFilesystemObjectTransfer({ root: input.root });
  if (after.sourceDigest !== input.expectedSourceDigest) {
    throw new Error("filesystem Capture source changed during object transfer");
  }
  const remoteKeys = await input.destination.listImmutableKeys("sha256/");
  const expectedKeys = before.objects.map(({ ref }) => ref.key);
  if (remoteKeys.length !== expectedKeys.length
    || remoteKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("remote immutable object set disagrees with source manifest");
  }
  return {
    sourceDigest: before.sourceDigest,
    objectCount: before.objects.length,
    verifiedObjectCount: before.objects.length
  };
}
