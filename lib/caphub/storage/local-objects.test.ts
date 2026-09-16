import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalCaptureObjectStore } from "./local-objects";

const FIXTURE_PREFIX = "alljobs-caphub-objects-";
const SENTINEL_NAME = ".caphub-objects-test-owner.json";

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
    throw new Error(`Refusing to remove unsafe Caphub object fixture: ${fixture.root}`);
  }
  const owner = JSON.parse(readFileSync(sentinelPath, "utf8")) as {
    token?: string;
    ownerPid?: number;
  };
  if (owner.token !== fixture.token || owner.ownerPid !== process.pid) {
    throw new Error(`Refusing to remove unowned Caphub object fixture: ${fixture.root}`);
  }
  rmSync(fixture.root, { recursive: true, force: true });
}

afterEach(() => {
  while (ownedFixtures.length > 0) {
    removeOwnedFixture(ownedFixtures.pop() as OwnedFixture);
  }
});

describe("LocalCaptureObjectStore", () => {
  it("stores exact bytes at their sharded SHA-256 address", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const bytes = new Uint8Array([0, 255, 17, 34, 128, 10]);
    const digest = createHash("sha256").update(bytes).digest("hex");

    const store = new LocalCaptureObjectStore(root);
    const result = await store.putImmutable({
      bytes,
      mimeType: "image/png"
    });

    expect(result).toEqual({
      algorithm: "sha256",
      digest,
      key: `sha256/${digest.slice(0, 2)}/${digest}`,
      bytes: 6
    });
    expect(readFileSync(join(root, "objects", result.key))).toEqual(Buffer.from(bytes));
    await expect(store.readImmutable(result)).resolves.toEqual(bytes);
  });

  it("deduplicates identical bytes without changing the durable object", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const bytes = new TextEncoder().encode("same immutable payload");
    const store = new LocalCaptureObjectStore(root);
    const first = await store.putImmutable({ bytes, mimeType: "image/webp" });
    const objectFile = join(root, "objects", first.key);
    const before = lstatSync(objectFile);

    const second = await store.putImmutable({ bytes, mimeType: "image/webp" });
    const after = lstatSync(objectFile);

    expect(second).toEqual(first);
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(readFileSync(objectFile)).toEqual(Buffer.from(bytes));
  });

  it("rejects a pre-existing payload whose bytes do not match its digest address", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const bytes = new TextEncoder().encode("expected payload");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const objectFile = join(root, "objects", "sha256", digest.slice(0, 2), digest);
    mkdirSync(dirname(objectFile), { recursive: true, mode: 0o700 });
    writeFileSync(objectFile, "different payload", { flag: "wx", mode: 0o600 });

    await expect(
      new LocalCaptureObjectStore(root).putImmutable({ bytes, mimeType: "image/jpeg" })
    ).rejects.toThrow(/immutable object mismatch/i);
    expect(readFileSync(objectFile, "utf8")).toBe("different payload");
  });

  it("publishes through a sibling temporary file and refuses to overwrite a late different winner", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const bytes = new TextEncoder().encode("candidate bytes");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const finalPath = join(root, "objects", "sha256", digest.slice(0, 2), digest);
    let observedTempPath = "";

    const store = new LocalCaptureObjectStore(root, {
      async beforePublish(tempPath, requestedFinalPath) {
        observedTempPath = tempPath;
        expect(requestedFinalPath).toBe(finalPath);
        expect(dirname(tempPath)).toBe(dirname(finalPath));
        expect(lstatSync(tempPath).isFile()).toBe(true);
        writeFileSync(finalPath, "late different winner", { flag: "wx", mode: 0o600 });
      }
    });

    await expect(store.putImmutable({ bytes, mimeType: "image/png" })).rejects.toThrow(
      /immutable object mismatch/i
    );
    expect(basename(observedTempPath)).toMatch(/^\.[a-f0-9]{64}\.[0-9a-f-]+\.tmp$/);
    expect(readFileSync(finalPath, "utf8")).toBe("late different winner");
    expect(() => lstatSync(observedTempPath)).toThrow();
  });

  it("rejects group-writable and symlinked object parents at the real write boundary", async () => {
    const permissionFixture = createOwnedFixture();
    const permissionRoot = createCaphubRoot(permissionFixture);
    chmodSync(permissionRoot, 0o720);

    await expect(
      new LocalCaptureObjectStore(permissionRoot).putImmutable({
        bytes: new Uint8Array([1]),
        mimeType: "image/png"
      })
    ).rejects.toThrow(/group or other writable/i);

    const symlinkFixture = createOwnedFixture();
    const symlinkRoot = createCaphubRoot(symlinkFixture);
    const outside = join(symlinkFixture.root, "outside-objects");
    mkdirSync(outside, { mode: 0o700 });
    symlinkSync(outside, join(symlinkRoot, "objects"), "dir");

    await expect(
      new LocalCaptureObjectStore(symlinkRoot).putImmutable({
        bytes: new Uint8Array([2]),
        mimeType: "image/png"
      })
    ).rejects.toThrow(/symlink/i);
    expect(readFileSync(join(symlinkFixture.root, SENTINEL_NAME), "utf8")).toContain(
      symlinkFixture.token
    );
  });
});
