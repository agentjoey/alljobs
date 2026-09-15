import { randomUUID } from "node:crypto";
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
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureAuditEventSchema } from "../domain/schemas";
import type { CaptureAuditEvent } from "../domain/types";
import {
  captureReceivedEventId,
  FilesystemCaptureAuditLog
} from "./audit-log";
import { syncDirectory } from "./local-objects";

const FIXTURE_PREFIX = "alljobs-caphub-audit-";
const SENTINEL_NAME = ".caphub-audit-test-owner.json";
const DIGEST = "b".repeat(64);

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

function event(
  captureDigit = "3",
  occurredAt = "2026-09-16T01:02:03.000+08:00"
): CaptureAuditEvent {
  const captureId = `cap_${captureDigit.repeat(32)}`;
  const eventIds: Record<string, string> = {
    "3": "evt_582408050ba236d0e6d3dfde4d61a807",
    "4": "evt_5c48775bc26631403372688a4d9faf2d",
    "5": "evt_b76dec7747fd5b8595dee7d4673631ad"
  };
  return {
    schema_version: 1,
    event_id: eventIds[captureDigit],
    capture_id: captureId,
    type: "capture.received",
    actor: "web:user",
    occurred_at: occurredAt,
    object_digest: DIGEST
  };
}

function readNdjson(path: string): unknown[] {
  const raw = readFileSync(path, "utf8");
  expect(raw.endsWith("\n")).toBe(true);
  return raw.trimEnd().split("\n").map((line) => JSON.parse(line));
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
    throw new Error(`Refusing to remove unsafe Caphub audit fixture: ${fixture.root}`);
  }
  const owner = JSON.parse(readFileSync(sentinelPath, "utf8")) as {
    token?: string;
    ownerPid?: number;
  };
  if (owner.token !== fixture.token || owner.ownerPid !== process.pid) {
    throw new Error(`Refusing to remove unowned Caphub audit fixture: ${fixture.root}`);
  }
  rmSync(fixture.root, { recursive: true, force: true });
}

afterEach(() => {
  while (ownedFixtures.length > 0) {
    removeOwnedFixture(ownedFixtures.pop() as OwnedFixture);
  }
});

describe("FilesystemCaptureAuditLog", () => {
  it("derives the fixed capture.received event ID from the Capture ID", () => {
    expect(captureReceivedEventId(`cap_${"3".repeat(32)}`)).toBe(
      "evt_582408050ba236d0e6d3dfde4d61a807"
    );
  });

  it("appends exactly one strict durable NDJSON event", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const input = event();

    await expect(new FilesystemCaptureAuditLog(root).ensure(input)).resolves.toBe("appended");

    const events = readNdjson(join(root, "events", "2026-09.jsonl"));
    expect(events).toEqual([input]);
    expect(captureAuditEventSchema.parse(events[0])).toEqual(input);
  });

  it("partitions events by the calendar month encoded in occurred_at", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const audit = new FilesystemCaptureAuditLog(root);
    const september = event("3", "2026-09-30T23:30:00.000-07:00");
    const october = event("4", "2026-10-01T00:30:00.000+08:00");

    await audit.ensure(september);
    await audit.ensure(october);

    expect(readNdjson(join(root, "events", "2026-09.jsonl"))).toEqual([september]);
    expect(readNdjson(join(root, "events", "2026-10.jsonl"))).toEqual([october]);
  });

  it("serializes concurrent ensure calls and appends the event only once", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const audit = new FilesystemCaptureAuditLog(root);
    const input = event();

    const results = await Promise.all(Array.from({ length: 12 }, () => audit.ensure(input)));

    expect(results.filter((result) => result === "appended")).toHaveLength(1);
    expect(results.filter((result) => result === "existing")).toHaveLength(11);
    expect(readNdjson(join(root, "events", "2026-09.jsonl"))).toEqual([input]);
  });

  it("repairs an interrupted first append before retrying the deterministic event", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const input = event();
    let attempts = 0;
    const audit = new FilesystemCaptureAuditLog(root, {
      async append(handle: FileHandle, bytes: Uint8Array) {
        attempts += 1;
        if (attempts === 1) {
          await handle.write(bytes.subarray(0, Math.floor(bytes.byteLength / 2)));
          throw new Error("injected interrupted audit append");
        }
        let offset = 0;
        while (offset < bytes.byteLength) {
          const { bytesWritten } = await handle.write(bytes.subarray(offset));
          offset += bytesWritten;
        }
      }
    });

    await expect(audit.ensure(input)).rejects.toThrow("injected interrupted audit append");
    await expect(audit.ensure(input)).resolves.toBe("appended");

    expect(attempts).toBe(2);
    expect(readNdjson(join(root, "events", "2026-09.jsonl"))).toEqual([input]);
  });

  it.each(["file", "parent"] as const)(
    "flushes a complete event and its parent again before returning existing after %s sync failure",
    async (failurePoint) => {
      const fixture = createOwnedFixture();
      const root = createCaphubRoot(fixture);
      const input = event();
      let fileSyncAttempts = 0;
      let parentSyncAttempts = 0;
      const audit = new FilesystemCaptureAuditLog(root, {
        async syncFile(handle: FileHandle) {
          fileSyncAttempts += 1;
          if (failurePoint === "file" && fileSyncAttempts === 1) {
            throw new Error("injected audit file sync failure");
          }
          await handle.sync();
        },
        async syncParent(path: string) {
          parentSyncAttempts += 1;
          if (failurePoint === "parent" && parentSyncAttempts === 1) {
            throw new Error("injected audit parent sync failure");
          }
          await syncDirectory(path);
        }
      });

      await expect(audit.ensure(input)).rejects.toThrow(
        `injected audit ${failurePoint} sync failure`
      );
      expect(readNdjson(join(root, "events", "2026-09.jsonl"))).toEqual([input]);

      await expect(audit.ensure(input)).resolves.toBe("existing");
      expect(fileSyncAttempts).toBe(2);
      expect(parentSyncAttempts).toBe(failurePoint === "file" ? 1 : 2);
      expect(readNdjson(join(root, "events", "2026-09.jsonl"))).toEqual([input]);
    }
  );

  it("rejects invalid, unknown-key, and non-deterministic events without appending", async () => {
    const fixture = createOwnedFixture();
    const root = createCaphubRoot(fixture);
    const audit = new FilesystemCaptureAuditLog(root);

    await expect(
      audit.ensure({ ...event(), unexpected: true } as CaptureAuditEvent)
    ).rejects.toThrow();
    await expect(
      audit.ensure({ ...event(), event_id: `evt_${"f".repeat(32)}` })
    ).rejects.toThrow(/deterministic/i);
    expect(() => lstatSync(join(root, "events", "2026-09.jsonl"))).toThrow();
  });

  it("rejects unsafe event directory permissions and symlinks at append time", async () => {
    const permissionFixture = createOwnedFixture();
    const permissionRoot = createCaphubRoot(permissionFixture);
    const events = join(permissionRoot, "events");
    mkdirSync(events, { mode: 0o700 });
    chmodSync(events, 0o722);

    await expect(new FilesystemCaptureAuditLog(permissionRoot).ensure(event())).rejects.toThrow(
      /group or other writable/i
    );

    const symlinkFixture = createOwnedFixture();
    const symlinkRoot = createCaphubRoot(symlinkFixture);
    const outside = join(symlinkFixture.root, "outside-events");
    mkdirSync(outside, { mode: 0o700 });
    symlinkSync(outside, join(symlinkRoot, "events"), "dir");

    await expect(new FilesystemCaptureAuditLog(symlinkRoot).ensure(event())).rejects.toThrow(
      /symlink/i
    );
  });
});
