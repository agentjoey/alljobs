import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getNativeTasksFilePath, getProjectFilePath } from "../paths";
import { NativePlanningStore } from "./store";

describe("NativePlanningStore", () => {
  let testRoot: string;
  let store: NativePlanningStore;

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), "alljobs-store-test-"));
    store = new NativePlanningStore(testRoot);
  });

  afterEach(async () => {
    if (testRoot) {
      await rm(testRoot, { recursive: true, force: true });
    }
  });

  it("creates and retrieves a project registry entry", async () => {
    const created = await store.createProject({
      slug: "sea-launch",
      name: "Southeast Asia Launch",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.slug).toBe("sea-launch");
    expect(created.digest).toBeDefined();

    const fetched = await store.getProject("sea-launch");
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Southeast Asia Launch");

    const list = await store.listProjects();
    expect(list.length).toBe(1);
    expect(list[0].slug).toBe("sea-launch");
  });

  it("creates and updates native tasks with digest protection", async () => {
    await store.createProject({
      slug: "sea-launch",
      name: "Southeast Asia Launch",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    const taskResult = await store.createTask("sea-launch", {
      id: "AJ-T-001",
      title: "Draft pilot note",
      project: "sea-launch",
      status: "todo",
      work_mode: "operations",
      source: { provider: "native" }
    });

    expect(taskResult.ok).toBe(true);
    if (!taskResult.ok) return;
    expect(taskResult.value.id).toBe("AJ-T-001");

    const { tasks, digest: initialDigest } = await store.readTasks("sea-launch");
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe("AJ-T-001");
    expect(initialDigest).toBeDefined();

    // Successful update with matching digest
    const updateResult = await store.updateTask({
      project: "sea-launch",
      taskId: "AJ-T-001",
      patch: { status: "doing" },
      expectedDigest: initialDigest
    });

    expect(updateResult.ok).toBe(true);
    if (!updateResult.ok) return;
    expect(updateResult.value.status).toBe("doing");
    expect(updateResult.digest).not.toBe(initialDigest);

    // Stale update with previous digest fails with STALE_WRITE
    const staleResult = await store.updateTask({
      project: "sea-launch",
      taskId: "AJ-T-001",
      patch: { status: "done" },
      expectedDigest: initialDigest
    });

    expect(staleResult.ok).toBe(false);
    if (staleResult.ok) return;
    expect(staleResult.code).toBe("STALE_WRITE");

    // Verify task is still doing, not overwritten
    const { tasks: finalTasks } = await store.readTasks("sea-launch");
    expect(finalTasks[0].status).toBe("doing");
  });

  it("creates business roadmap items and rejects code roadmap writes", async () => {
    await store.createProject({
      slug: "sea-launch",
      name: "SEA Launch",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    await store.createProject({
      slug: "alljobs",
      name: "AllJobs",
      type: "code",
      work_modes: ["implementation"],
      execution_locations: [],
      archived: false
    });

    // Business roadmap write succeeds
    const bizResult = await store.createRoadmapItem("sea-launch", {
      id: "m-01",
      title: "Market Frame",
      kind: "milestone",
      status: "active",
      order: 10
    });
    expect(bizResult.ok).toBe(true);

    const { items } = await store.readRoadmap("sea-launch");
    expect(items.length).toBe(1);
    expect(items[0].id).toBe("m-01");

    // Code roadmap write fails with READ_ONLY_SOURCE
    const codeResult = await store.createRoadmapItem("alljobs", {
      id: "phase-1",
      title: "Core",
      kind: "phase",
      status: "active",
      order: 10
    });
    expect(codeResult.ok).toBe(false);
    if (codeResult.ok) return;
    expect(codeResult.code).toBe("READ_ONLY_SOURCE");
  });

  it("rejects createTask when a malformed section already carries the id (M2)", async () => {
    await store.createProject({
      slug: "sea-launch",
      name: "SEA Launch",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    // Two schema-invalid sections (missing `status`) sharing the same id:
    // both are dropped from parsed.valid, leaving only parse issues behind.
    const filePath = getNativeTasksFilePath("sea-launch", testRoot);
    await writeFile(
      filePath,
      [
        "# Tasks",
        "",
        "## dup-id: First Broken",
        "",
        "```yaml alljobs",
        "id: dup-id",
        "project: sea-launch",
        "```",
        "",
        "## dup-id: Second Broken",
        "",
        "```yaml alljobs",
        "id: dup-id",
        "project: sea-launch",
        "```",
        ""
      ].join("\n"),
      "utf8"
    );

    const { tasks, issues } = await store.readTasks("sea-launch");
    expect(tasks).toEqual([]);
    expect(issues.some(i => i.code === "INVALID_TASK_SCHEMA")).toBe(true);

    const result = await store.createTask("sea-launch", {
      id: "dup-id",
      title: "Fresh Task",
      project: "sea-launch",
      status: "todo",
      work_mode: "operations",
      source: { provider: "native" }
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.message).toContain("already exists");

    // And nothing was appended
    const after = await store.readTasks("sea-launch");
    expect(after.tasks).toEqual([]);
  });

  it("throws on corrupted project registry instead of returning null (L2)", async () => {
    await store.createProject({
      slug: "sea-launch",
      name: "SEA Launch",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    await writeFile(getProjectFilePath("sea-launch", testRoot), "{ not json", "utf8");

    await expect(store.getProject("sea-launch")).rejects.toThrowError(/corrupted/);
    await expect(store.getProject("missing-project")).resolves.toBeNull();
  });
});
