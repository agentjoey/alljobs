import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NativePlanningStore } from "../native/store";
import { getProjectDetail } from "./project";

describe("getProjectDetail", () => {
  let tempHome: string;
  let store: NativePlanningStore;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "alljobs-home-"));
    store = new NativePlanningStore(tempHome);

    await store.createProject({
      slug: "biz-project",
      name: "Business Project",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    await store.createRoadmapItem("biz-project", {
      id: "m-1",
      title: "Launch v1",
      kind: "milestone",
      status: "active",
      order: 10,
      focus: "primary"
    });

    await store.createTask("biz-project", {
      id: "T-1",
      title: "Task 1",
      project: "biz-project",
      status: "doing",
      roadmap_item: "m-1",
      source: { provider: "native" }
    });
  });

  afterEach(async () => {
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
  });

  it("loads business project detail with roadmap, tasks, attention, and metrics", async () => {
    const detail = await getProjectDetail("biz-project", { root: tempHome });
    expect(detail).not.toBeNull();
    if (!detail) return;

    expect(detail.project.slug).toBe("biz-project");
    expect(detail.roadmap.length).toBe(1);
    expect(detail.tasks.length).toBe(1);
    expect(detail.metrics.activeTasks).toBe(1);
    expect(detail.metrics.doneCount).toBe(0);
  });
});
