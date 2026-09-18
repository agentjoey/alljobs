import { createHash } from "node:crypto";
import { DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import type { CaptureMimeType } from "../domain/types";
import { ImmutableObjectMismatchError } from "./local-objects";
import {
  NeonS3CaptureObjectStore,
  createNeonS3CommandPort,
  createNeonS3DeletionPort,
  parseNeonS3Environment,
  type S3ImmutableCommandPort
} from "./neon-s3";

interface StoredObject {
  bytes: Uint8Array;
  digest: string;
  mimeType: CaptureMimeType;
}

class FakeS3Port implements S3ImmutableCommandPort {
  readonly objects = new Map<string, StoredObject>();
  readonly operations: string[] = [];

  async head(key: string) {
    this.operations.push("head");
    const value = this.objects.get(key);
    return value === undefined ? null : {
      bytes: value.bytes.byteLength,
      metadata: { "caphub-sha256": value.digest }
    };
  }

  async putIfAbsent(input: { key: string; bytes: Uint8Array; mimeType: CaptureMimeType; digest: string }) {
    this.operations.push("put-if-absent");
    if (this.objects.has(input.key)) {
      const error = new Error("precondition failed") as Error & { code: string };
      error.code = "PreconditionFailed";
      throw error;
    }
    this.objects.set(input.key, {
      bytes: Uint8Array.from(input.bytes), digest: input.digest, mimeType: input.mimeType
    });
  }

  async get(key: string) {
    this.operations.push("get");
    const value = this.objects.get(key);
    if (value === undefined) throw new Error("not found");
    return Uint8Array.from(value.bytes);
  }

  async list(prefix: string) {
    this.operations.push("list");
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("NeonS3CaptureObjectStore", () => {
  it("deletes only an exact digest key and treats an already absent object as success", async () => {
    const commands: DeleteObjectCommand[] = [];
    const port = createNeonS3DeletionPort({ bucket: "caphub-objects", accessKeyId: "test", secretAccessKey: "test", endpoint: "https://storage.example.test", region: "aws-ap-southeast-1" }, {
      clientFactory: () => ({ send: async (command: DeleteObjectCommand) => { commands.push(command); throw Object.assign(new Error("missing"), { name: "NoSuchKey" }); } }) as unknown as S3Client
    });
    const ref = { algorithm: "sha256" as const, digest: "a".repeat(64), key: `sha256/aa/${"a".repeat(64)}`, bytes: 1 };
    await port.deleteExactObject(ref);
    expect(commands[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(commands[0].input).toEqual({ Bucket: "caphub-objects", Key: ref.key });
    await expect(port.deleteExactObject({ ...ref, key: "sha256/" })).rejects.toThrow();
    expect(commands).toHaveLength(1);
  });
  it("accepts only an exact configured Object Storage hostname before credentials reach the client", () => {
    const refs = {
      accessKeyIdEnv: "CAPHUB_S3_ACCESS_KEY_ID",
      secretAccessKeyEnv: "CAPHUB_S3_SECRET_ACCESS_KEY",
      endpointEnv: "CAPHUB_S3_ENDPOINT",
      regionEnv: "CAPHUB_S3_REGION",
      managedEndpointHosts: ["storage.example.test"]
    } as never;
    const env = {
      CAPHUB_S3_ACCESS_KEY_ID: "test-access-key",
      CAPHUB_S3_SECRET_ACCESS_KEY: "test-secret-key",
      CAPHUB_S3_ENDPOINT: "https://storage.example.test",
      CAPHUB_S3_REGION: "aws-ap-southeast-1"
    };
    expect(parseNeonS3Environment({ bucket: "caphub-objects", refs, env }).endpoint)
      .toBe("https://storage.example.test");
    expect(() => parseNeonS3Environment({
      bucket: "caphub-objects",
      refs,
      env: { ...env, CAPHUB_S3_ENDPOINT: "https://attacker.example.test" }
    })).toThrow(/approved/i);
  });

  it("constructs an explicit path-style S3 client rather than ambient credentials", () => {
    const options: Array<Record<string, unknown>> = [];
    const port = createNeonS3CommandPort({
      bucket: "caphub-objects",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      endpoint: "https://storage.example.test",
      region: "aws-ap-southeast-1"
    }, {
      clientFactory: (input) => {
        options.push(input as Record<string, unknown>);
        return { send: async () => ({}) } as unknown as S3Client;
      }
    });

    expect(port).toBeDefined();
    expect(options).toEqual([{
      endpoint: "https://storage.example.test",
      region: "aws-ap-southeast-1",
      forcePathStyle: true,
      credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" }
    }]);
  });

  it("writes a new object only at its digest key and re-reads it before success", async () => {
    const port = new FakeS3Port();
    const bytes = new TextEncoder().encode("immutable screenshot");
    const store = new NeonS3CaptureObjectStore({ port });

    await expect(store.putImmutable({ bytes, mimeType: "image/png" })).resolves.toEqual({
      algorithm: "sha256",
      digest: digest(bytes),
      key: `sha256/${digest(bytes).slice(0, 2)}/${digest(bytes)}`,
      bytes: bytes.byteLength
    });
    expect(port.operations).toEqual(["head", "put-if-absent", "head", "get"]);
  });

  it("deduplicates a matching immutable key without an overwrite", async () => {
    const port = new FakeS3Port();
    const bytes = new TextEncoder().encode("already present");
    const valueDigest = digest(bytes);
    port.objects.set(`sha256/${valueDigest.slice(0, 2)}/${valueDigest}`, {
      bytes, digest: valueDigest, mimeType: "image/jpeg"
    });
    const store = new NeonS3CaptureObjectStore({ port });

    await expect(store.putImmutable({ bytes, mimeType: "image/png" })).resolves.toMatchObject({ digest: valueDigest });
    expect(port.operations).toEqual(["head", "get"]);
  });

  it("re-reads a concurrent SDK-shaped 412 write instead of treating it as a failed upload", async () => {
    const bytes = new TextEncoder().encode("sdk precondition race");
    const valueDigest = digest(bytes);
    const key = `sha256/${valueDigest.slice(0, 2)}/${valueDigest}`;
    let present = false;
    const port: S3ImmutableCommandPort = {
      head: async () => present ? { bytes: bytes.byteLength, metadata: { "caphub-sha256": valueDigest } } : null,
      putIfAbsent: async () => {
        present = true;
        const error = Object.assign(new Error("precondition failed"), {
          name: "PreconditionFailed",
          $metadata: { httpStatusCode: 412 }
        });
        throw error;
      },
      get: async () => Uint8Array.from(bytes),
      list: async () => [key]
    };
    await expect(new NeonS3CaptureObjectStore({ port }).putImmutable({ bytes, mimeType: "image/png" }))
      .resolves.toMatchObject({ digest: valueDigest, key });
  });

  it("rejects a remote object whose bytes disagree with its immutable address", async () => {
    const port = new FakeS3Port();
    const expected = new TextEncoder().encode("expected bytes");
    const expectedDigest = digest(expected);
    const altered = Uint8Array.from(expected);
    altered[0] ^= 0x01;
    port.objects.set(`sha256/${expectedDigest.slice(0, 2)}/${expectedDigest}`, {
      bytes: altered, digest: expectedDigest, mimeType: "image/png"
    });
    const store = new NeonS3CaptureObjectStore({ port });

    await expect(store.putImmutable({ bytes: expected, mimeType: "image/png" }))
      .rejects.toBeInstanceOf(ImmutableObjectMismatchError);
    expect(port.operations).toEqual(["head", "get"]);
  });

  it("lists only the immutable sha256 key namespace for migration verification", async () => {
    const port = new FakeS3Port();
    const bytes = new TextEncoder().encode("catalogued object");
    const store = new NeonS3CaptureObjectStore({ port });
    const ref = await store.putImmutable({ bytes, mimeType: "image/png" });

    await expect(store.listImmutableKeys("sha256/")).resolves.toEqual([ref.key]);
  });

  it("accepts only explicit HTTPS S3 environment values and never uses an ambient credential chain", () => {
    expect(parseNeonS3Environment({
      bucket: "caphub-objects",
      refs: {
        accessKeyIdEnv: "CAPHUB_S3_ACCESS_KEY_ID",
        secretAccessKeyEnv: "CAPHUB_S3_SECRET_ACCESS_KEY",
        endpointEnv: "CAPHUB_S3_ENDPOINT",
        regionEnv: "CAPHUB_S3_REGION",
        managedEndpointHosts: ["storage.example.test"]
      },
      env: {
        CAPHUB_S3_ACCESS_KEY_ID: "test-access-key",
        CAPHUB_S3_SECRET_ACCESS_KEY: "test-secret-key",
        CAPHUB_S3_ENDPOINT: "https://storage.example.test",
        CAPHUB_S3_REGION: "aws-ap-southeast-1"
      }
    })).toEqual({
      bucket: "caphub-objects",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      endpoint: "https://storage.example.test",
      region: "aws-ap-southeast-1"
    });

    expect(() => parseNeonS3Environment({
      bucket: "caphub-objects",
      refs: {
        accessKeyIdEnv: "CAPHUB_S3_ACCESS_KEY_ID",
        secretAccessKeyEnv: "CAPHUB_S3_SECRET_ACCESS_KEY",
        endpointEnv: "CAPHUB_S3_ENDPOINT",
        regionEnv: "CAPHUB_S3_REGION",
        managedEndpointHosts: ["storage.example.test"]
      },
      env: {
        CAPHUB_S3_ACCESS_KEY_ID: "test-access-key",
        CAPHUB_S3_SECRET_ACCESS_KEY: "test-secret-key",
        CAPHUB_S3_ENDPOINT: "http://storage.example.test",
        CAPHUB_S3_REGION: "aws-ap-southeast-1"
      }
    })).toThrow("HTTPS");
  });
});
