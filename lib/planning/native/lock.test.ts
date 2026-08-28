import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLocksDir } from "../paths";
import { ProjectLockError, withProjectLock } from "./lock";
import { NativePlanningStore } from "./store";

describe("withProjectLock", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), "alljobs-lock-test-"));
  });

  afterEach(async () => {
    if (testRoot) {
      await rm(testRoot, { recursive: true, force: true });
    }
  });

  it("throws ProjectLockError on contention with a live lock", async () => {
    await withProjectLock(
      "proj",
      async () => {
        await expect(
          withProjectLock("proj", async () => "inner", testRoot)
        ).rejects.toBeInstanceOf(ProjectLockError);
      },
      testRoot
    );
  });

  it("store mutations surface contention as LOCKED instead of throwing", async () => {
    const store = new NativePlanningStore(testRoot);
    await store.createProject({
      slug: "proj",
      name: "Proj",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    await withProjectLock(
      "proj",
      async () => {
        const result = await store.createTask("proj", {
          id: "T-1",
          title: "Contended",
          project: "proj",
          status: "todo",
          work_mode: "operations",
          source: { provider: "native" }
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("LOCKED");
      },
      testRoot
    );
  });

  it("reclaims a lock whose holder process is dead", async () => {
    const lockFile = resolve(getLocksDir(testRoot), "proj.lock");
    // 999999 exceeds macOS's max pid, so it is guaranteed not to exist
    await writeFile(lockFile, `999999\n${Date.now()}\n`, "utf8");

    const value = await withProjectLock("proj", async () => "reclaimed", testRoot);
    expect(value).toBe("reclaimed");
  });

  it("reclaims a lock older than the stale threshold", async () => {
    const lockFile = resolve(getLocksDir(testRoot), "proj.lock");
    const oldTimestamp = Date.now() - 11 * 60 * 1000;
    await writeFile(lockFile, `${process.pid}\n${oldTimestamp}\n`, "utf8");

    const value = await withProjectLock("proj", async () => "reclaimed", testRoot);
    expect(value).toBe("reclaimed");
  });
});
