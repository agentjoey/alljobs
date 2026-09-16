import { randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CaptureRecord } from "../domain/types";
import { defineCaptureStoreContract } from "../registry/contract-suite";
import { idempotencyRecordPath } from "./paths";
import { FilesystemCaptureStore } from "./filesystem";

const FIXTURE_PREFIX = "alljobs-caphub-metadata-";
const SENTINEL_NAME = ".caphub-metadata-test-owner.json";
const DIGEST = "a".repeat(64);
const KEY = "capture.request-20260916:metadata-a";

interface OwnedFixture {
  root: string;
  token: string;
}

const ownedFixtures: OwnedFixture[] = [];

function createOwnedFixture(): OwnedFixture {
  const temporaryParent = realpathSync(tmpdir());
  const root = realpathSync(mkdtempSync(join(temporaryParent, FIXTURE_PREFIX)));
  const fixture = { root, token: randomUUID() };
  writeFileSync(
    join(root, SENTINEL_NAME),
    JSON.stringify({ token: fixture.token, ownerPid: process.pid }),
    { flag: "wx", mode: 0o600 }
  );
  ownedFixtures.push(fixture);
  return fixture;
}

function createCaphubRoot(fixture: OwnedFixture): string {
  const root = join(fixture.root, "home", "state", "caphub");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  return realpathSync(root);
}

function record(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    schema_version: 1,
    id: `cap_${"1".repeat(32)}`,
    source: {
      kind: "web",
      original_filename: "complete-production-shape.png",
      source_url: "https://example.com/source"
    },
    note: "Human-supplied capture note",
    mime_type: "image/png",
    object: {
      algorithm: "sha256",
      digest: DIGEST,
      key: `sha256/aa/${DIGEST}`,
      bytes: 42
    },
    idempotency_key: KEY,
    status: "received",
    human_review_required: true,
    created_at: "2026-09-16T00:15:00.000+08:00",
    ...overrides
  };
}

function removeOwnedFixture(fixture: OwnedFixture): void {
  const temporaryParent = realpathSync(tmpdir());
  const sentinelPath = join(fixture.root, SENTINEL_NAME);
  const rootStat = lstatSync(fixture.root);
  const sentinelStat = lstatSync(sentinelPath);
  if (
    dirname(fixture.root) !== temporaryParent ||
    !basename(fixture.root).startsWith(FIXTURE_PREFIX) ||
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    realpathSync(fixture.root) !== fixture.root ||
    !sentinelStat.isFile() ||
    sentinelStat.isSymbolicLink() ||
    realpathSync(sentinelPath) !== sentinelPath
  ) {
    throw new Error(`Refusing to remove unsafe Caphub metadata fixture: ${fixture.root}`);
  }
  const owner = JSON.parse(readFileSync(sentinelPath, "utf8")) as {
    token?: string;
    ownerPid?: number;
  };
  if (owner.token !== fixture.token || owner.ownerPid !== process.pid) {
    throw new Error(`Refusing to remove unowned Caphub metadata fixture: ${fixture.root}`);
  }
  rmSync(fixture.root, { recursive: true, force: true });
}

afterEach(() => {
  while (ownedFixtures.length > 0) {
    removeOwnedFixture(ownedFixtures.pop() as OwnedFixture);
  }
});

describe("FilesystemCaptureStore", () => {
  it("returns null for missing capture and idempotency records", async () => {
    const fixture = createOwnedFixture();
    const store = new FilesystemCaptureStore(createCaphubRoot(fixture));

    await expect(store.get(`cap_${"f".repeat(32)}`)).resolves.toBeNull();
    await expect(store.findByIdempotencyKey(KEY)).resolves.toBeNull();
  });

  it("creates immutable Capture JSON and an exact minimal hashed idempotency index", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const store = new FilesystemCaptureStore(root);
    const input = record();

    await expect(store.create(input)).resolves.toBe("created");
    await expect(store.get(input.id)).resolves.toEqual(input);
    await expect(store.findByIdempotencyKey(input.idempotency_key)).resolves.toEqual(input);

    const index = JSON.parse(readFileSync(idempotencyRecordPath(root, KEY), "utf8"));
    expect(index).toEqual({
      schema_version: 1,
      idempotency_key: KEY,
      capture_id: input.id
    });
    expect(Object.keys(index)).toEqual(["schema_version", "idempotency_key", "capture_id"]);
  });

  it("strictly rejects malformed, unknown-key, and mismatched idempotency JSON on read", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const store = new FilesystemCaptureStore(root);
    const input = record();
    await store.create(input);
    const capturePath = join(root, "records", "captures", `${input.id}.json`);
    writeFileSync(capturePath, JSON.stringify({ ...input, unexpected: true }), { mode: 0o600 });

    await expect(store.get(input.id)).rejects.toThrow();

    const secondFixture = createOwnedFixture();
    const secondRoot = createCaphubRoot(secondFixture);
    const secondStore = new FilesystemCaptureStore(secondRoot);
    const indexPath = idempotencyRecordPath(secondRoot, KEY);
    mkdirSync(dirname(indexPath), { recursive: true, mode: 0o700 });
    writeFileSync(
      indexPath,
      JSON.stringify({ schema_version: 1, idempotency_key: "capture.request-20260916:different", capture_id: input.id }),
      { flag: "wx", mode: 0o600 }
    );

    await expect(secondStore.findByIdempotencyKey(KEY)).rejects.toThrow(/idempotency/i);
  });

  it("allows exactly one concurrent create for an idempotency key", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const store = new FilesystemCaptureStore(root);
    const first = record();
    const second = record({ id: `cap_${"2".repeat(32)}`, note: "different contender" });

    const results = await Promise.all([store.create(first), store.create(second)]);

    expect(results.sort()).toEqual(["conflict", "created"]);
    const winner = await store.findByIdempotencyKey(KEY);
    expect([first, second]).toContainEqual(winner);
    expect(readdirSync(join(root, "records", "captures"))).toEqual([`${winner?.id}.json`]);
  });

  it("leaves no final or partial JSON after an injected temp-write failure", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const input = record();
    let attempts = 0;
    const store = new FilesystemCaptureStore(root, {
      async writeTemp(handle: FileHandle, bytes: Uint8Array) {
        attempts += 1;
        await handle.write(bytes, 0, Math.floor(bytes.byteLength / 2), 0);
        throw new Error("injected interrupted metadata write");
      }
    });

    await expect(store.create(input)).rejects.toThrow("injected interrupted metadata write");
    expect(attempts).toBe(1);
    await expect(store.get(input.id)).resolves.toBeNull();
    await expect(store.findByIdempotencyKey(input.idempotency_key)).resolves.toBeNull();
    expect(readdirSync(join(root, "records", "captures"))).toEqual([]);
  });

  it("rejects unsafe record directory permissions and symlinks during create", async () => {
    const permissionFixture = createOwnedFixture();
    const permissionRoot = createCaphubRoot(permissionFixture);
    const captures = join(permissionRoot, "records", "captures");
    mkdirSync(captures, { recursive: true, mode: 0o700 });
    chmodSync(captures, 0o707);

    await expect(new FilesystemCaptureStore(permissionRoot).create(record())).rejects.toThrow(
      /group or other writable/i
    );

    const symlinkFixture = createOwnedFixture();
    const symlinkRoot = createCaphubRoot(symlinkFixture);
    const outside = join(symlinkFixture.root, "outside-records");
    mkdirSync(outside, { mode: 0o700 });
    symlinkSync(outside, join(symlinkRoot, "records"), "dir");

    await expect(new FilesystemCaptureStore(symlinkRoot).create(record())).rejects.toThrow(
      /symlink/i
    );
  });
});

defineCaptureStoreContract("filesystem", () => {
  const fixture = createOwnedFixture();
  return {
    store: new FilesystemCaptureStore(createCaphubRoot(fixture)),
    record
  };
});
