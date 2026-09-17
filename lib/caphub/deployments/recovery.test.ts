import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireLeaseLock, listIncompleteOperations, readOperation, writeOperation, type OperationRecord } from "./recovery";

let created: string[] = [];

async function freshRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "caphub-recovery-")));
  created.push(root);
  return root;
}

afterEach(async () => {
  for (const root of created) {
    await rm(root, { recursive: true, force: true });
  }
  created = [];
});

function record(deploymentId: string, stage: OperationRecord["stage"]): OperationRecord {
  return {
    schema_version: 1,
    deployment_id: deploymentId,
    plan_digest: "a".repeat(64),
    action: "publish",
    stage,
    release: { record_id: `rel_${"1".repeat(32)}`, version: 1, digest: "b".repeat(64) },
    manifest_digest: "c".repeat(64),
    created_at: "2026-09-16T09:00:00.000Z"
  };
}

describe("operation records", () => {
  it("writes and reads a durable operation record", async () => {
    const root = await freshRoot();
    await writeOperation(root, record(`dep_${"1".repeat(32)}`, "versioned"));
    const read = await readOperation(root, `dep_${"1".repeat(32)}`);
    expect(read?.stage).toBe("versioned");
    expect(read?.schema_version).toBe(1);
  });

  it("returns null for missing operations", async () => {
    const root = await freshRoot();
    expect(await readOperation(root, `dep_${"2".repeat(32)}`)).toBeNull();
  });

  it("lists only incomplete operations in stable order", async () => {
    const root = await freshRoot();
    await writeOperation(root, record(`dep_${"3".repeat(32)}`, "completed"));
    await writeOperation(root, record(`dep_${"1".repeat(32)}`, "versioned"));
    await writeOperation(root, record(`dep_${"2".repeat(32)}`, "realized"));
    const incomplete = await listIncompleteOperations(root);
    expect(incomplete.map((item) => item.deployment_id)).toEqual([
      `dep_${"1".repeat(32)}`,
      `dep_${"2".repeat(32)}`
    ]);
  });

  it("ignores unreadable operation payloads instead of guessing", async () => {
    const root = await freshRoot();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(root, "operations"), { recursive: true });
    await writeFile(join(root, "operations", `dep_${"9".repeat(32)}.json`), "not json", "utf8");
    expect(await listIncompleteOperations(root)).toEqual([]);
  });
});

describe("lease lock ownership", () => {
  function leaseOptions(overrides: { alive?: boolean; staleMs?: number } = {}) {
    return {
      isProcessAlive: () => overrides.alive ?? true,
      staleMs: overrides.staleMs ?? 0,
      now: () => Date.parse("2026-09-17T00:00:00.000Z")
    };
  }

  it("refuses to take over a live lock and leaves it untouched", async () => {
    const root = await freshRoot();
    const first = await acquireLeaseLock(root, ".test-lock", "op-a", leaseOptions({ alive: true }));
    await expect(acquireLeaseLock(root, ".test-lock", "op-a", leaseOptions({ alive: true })))
      .rejects.toMatchObject({ code: "PUBLISH_RECOVERY_REQUIRED" });
    const owner = JSON.parse(await readFile(join(root, ".test-lock", "owner.json"), "utf8"));
    expect(owner.operation_id).toBe("op-a");
    await first();
  });

  it("takes over only a proven-stale lock for the same operation", async () => {
    const root = await freshRoot();
    const release = await acquireLeaseLock(root, ".test-lock", "op-a", leaseOptions({ alive: false }));
    await release();
    // Simulate a crashed holder: lock dir remains with a dead pid.
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(root, ".test-lock"), { recursive: true });
    await writeFile(join(root, ".test-lock", "owner.json"), JSON.stringify({
      schema_version: 1, operation_id: "op-a", pid: 999999, acquired_at: "2026-09-16T23:00:00.000Z"
    }));
    const takeover = await acquireLeaseLock(root, ".test-lock", "op-a", leaseOptions({ alive: false }));
    const owner = JSON.parse(await readFile(join(root, ".test-lock", "owner.json"), "utf8"));
    expect(owner.operation_id).toBe("op-a");
    await takeover();
  });

  it("never takes over a stale lock belonging to a different operation", async () => {
    const root = await freshRoot();
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(root, ".test-lock"), { recursive: true });
    await writeFile(join(root, ".test-lock", "owner.json"), JSON.stringify({
      schema_version: 1, operation_id: "op-other", pid: 999999, acquired_at: "2026-09-16T23:00:00.000Z"
    }));
    await expect(acquireLeaseLock(root, ".test-lock", "op-a", leaseOptions({ alive: false })))
      .rejects.toMatchObject({ code: "PUBLISH_RECOVERY_REQUIRED" });
  });
});
