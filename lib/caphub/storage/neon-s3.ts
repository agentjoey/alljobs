import { createHash, timingSafeEqual } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig
} from "@aws-sdk/client-s3";
import { captureMimeTypeSchema, objectRefSchema } from "../domain/schemas";
import type { CaptureMimeType, ObjectRef } from "../domain/types";
import { ImmutableObjectMismatchError } from "./local-objects";
import type { ReadableCaptureObjectStore } from "./contracts";

export interface S3ImmutableCommandPort {
  head(key: string): Promise<{ bytes: number; metadata: Record<string, string> } | null>;
  putIfAbsent(input: { key: string; bytes: Uint8Array; mimeType: CaptureMimeType; digest: string }): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  list(prefix: string): Promise<string[]>;
}

export interface NeonS3EnvironmentRefs {
  accessKeyIdEnv: string;
  secretAccessKeyEnv: string;
  endpointEnv: string;
  regionEnv: string;
}

export interface NeonS3Environment {
  bucket: "caphub-objects";
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
}

export interface NeonS3CommandPortOptions {
  clientFactory?: (input: S3ClientConfig) => S3Client;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function objectRefFor(bytes: Uint8Array): ObjectRef {
  if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1 || bytes.byteLength === 0) {
    throw new TypeError("immutable object bytes must be a non-empty Uint8Array");
  }
  const value = digest(bytes);
  return objectRefSchema.parse({
    algorithm: "sha256",
    digest: value,
    key: `sha256/${value.slice(0, 2)}/${value}`,
    bytes: bytes.byteLength
  });
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function isPreconditionFailed(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "PreconditionFailed";
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const value = error as { name?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return value.name === "NotFound" || value.name === "NoSuchKey" || value.Code === "NoSuchKey"
    || value.$metadata?.httpStatusCode === 404;
}

function requiredEnvironmentValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string
): string {
  const value = env[name];
  if (!value || value.length > 4_096) throw new Error(`Missing required Object Storage environment reference: ${name}`);
  return value;
}

export function parseNeonS3Environment(input: {
  bucket: "caphub-objects";
  refs: NeonS3EnvironmentRefs;
  env: Readonly<Record<string, string | undefined>>;
}): NeonS3Environment {
  const accessKeyId = requiredEnvironmentValue(input.env, input.refs.accessKeyIdEnv);
  const secretAccessKey = requiredEnvironmentValue(input.env, input.refs.secretAccessKeyEnv);
  const endpoint = requiredEnvironmentValue(input.env, input.refs.endpointEnv);
  const region = requiredEnvironmentValue(input.env, input.refs.regionEnv);
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("Object Storage endpoint must be HTTPS");
  }
  if (parsed.protocol !== "https:" || parsed.origin !== endpoint || parsed.username || parsed.password
    || parsed.hostname.endsWith(".") || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(parsed.hostname)) {
    throw new Error("Object Storage endpoint must be HTTPS");
  }
  if (!/^[a-z]{2,16}(?:-[a-z0-9]{1,32}){1,4}$/.test(region)) {
    throw new Error("Object Storage region is invalid");
  }
  return { bucket: input.bucket, accessKeyId, secretAccessKey, endpoint, region };
}

export function createNeonS3CommandPort(
  environment: NeonS3Environment,
  options: NeonS3CommandPortOptions = {}
): S3ImmutableCommandPort {
  const client = (options.clientFactory ?? ((input) => new S3Client(input)))({
    endpoint: environment.endpoint,
    region: environment.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: environment.accessKeyId,
      secretAccessKey: environment.secretAccessKey
    }
  });
  return {
    async head(key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: environment.bucket, Key: key }));
        const bytes = result.ContentLength;
        if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0) {
          throw new ImmutableObjectMismatchError();
        }
        return { bytes, metadata: result.Metadata ?? {} };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async putIfAbsent(input) {
      await client.send(new PutObjectCommand({
        Bucket: environment.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.mimeType,
        Metadata: { "caphub-sha256": input.digest },
        IfNoneMatch: "*"
      }));
    },
    async get(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: environment.bucket, Key: key }));
      if (!result.Body || typeof result.Body.transformToByteArray !== "function") {
        throw new ImmutableObjectMismatchError();
      }
      return Uint8Array.from(await result.Body.transformToByteArray());
    },
    async list(prefix) {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const result = await client.send(new ListObjectsV2Command({
          Bucket: environment.bucket,
          Prefix: prefix,
          ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken })
        }));
        for (const entry of result.Contents ?? []) {
          if (typeof entry.Key !== "string" || !entry.Key.startsWith(prefix)) {
            throw new ImmutableObjectMismatchError();
          }
          keys.push(entry.Key);
        }
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
        if (result.IsTruncated && !continuationToken) throw new ImmutableObjectMismatchError();
      } while (continuationToken !== undefined);
      return [...new Set(keys)].sort();
    }
  };
}

export class NeonS3CaptureObjectStore implements ReadableCaptureObjectStore {
  constructor(private readonly dependencies: { port: S3ImmutableCommandPort }) {}

  private async verifyRemote(
    ref: ObjectRef,
    expected?: Uint8Array,
    knownHead?: { bytes: number; metadata: Record<string, string> } | null
  ): Promise<Uint8Array> {
    const head = knownHead ?? await this.dependencies.port.head(ref.key);
    if (!head || head.bytes !== ref.bytes || head.metadata["caphub-sha256"] !== ref.digest) {
      throw new ImmutableObjectMismatchError();
    }
    const bytes = await this.dependencies.port.get(ref.key);
    if (bytes.byteLength !== ref.bytes || digest(bytes) !== ref.digest || (expected && !sameBytes(bytes, expected))) {
      throw new ImmutableObjectMismatchError();
    }
    return bytes;
  }

  async putImmutable(input: { bytes: Uint8Array; mimeType: CaptureMimeType }): Promise<ObjectRef> {
    captureMimeTypeSchema.parse(input.mimeType);
    const bytes = Uint8Array.from(input.bytes);
    const ref = objectRefFor(bytes);
    const existing = await this.dependencies.port.head(ref.key);
    if (existing) {
      await this.verifyRemote(ref, bytes, existing);
      return ref;
    }
    try {
      await this.dependencies.port.putIfAbsent({ key: ref.key, bytes, mimeType: input.mimeType, digest: ref.digest });
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
    }
    await this.verifyRemote(ref, bytes);
    return ref;
  }

  async readImmutable(rawRef: ObjectRef): Promise<Uint8Array> {
    const ref = objectRefSchema.parse(rawRef);
    return Uint8Array.from(await this.verifyRemote(ref));
  }

  async listImmutableKeys(prefix: "sha256/"): Promise<string[]> {
    if (prefix !== "sha256/") throw new ImmutableObjectMismatchError();
    const keys = await this.dependencies.port.list(prefix);
    if (keys.some((key) => !/^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(key))) {
      throw new ImmutableObjectMismatchError();
    }
    return keys;
  }
}
