import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listIncompleteOperations, readOperation, writeOperation, type OperationRecord } from "./recovery";

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
