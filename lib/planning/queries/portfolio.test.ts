import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NativePlanningStore } from "../native/store";
import { getPortfolioOverview } from "./portfolio";

describe("getPortfolioOverview", () => {
  let tempHome: string;
  let store: NativePlanningStore;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "alljobs-home-"));
    store = new NativePlanningStore(tempHome);

    await store.createProject({
      slug: "biz-1",
      name: "Biz One",
      type: "business",
      work_modes: ["operations"],
      execution_locations: [],
      archived: false
    });

    await store.createTask("biz-1", {
      id: "T-1",
      title: "Active Task",
      project: "biz-1",
      status: "doing",
      work_mode: "operations",
      source: { provider: "native" }
    });
  });

  afterEach(async () => {
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
  });

  it("aggregates active projects and ongoing tasks into portfolio view", async () => {
    const portfolio = await getPortfolioOverview({ root: tempHome });

    expect(portfolio.projects.length).toBe(1);
    expect(portfolio.ongoingTasks.length).toBe(1);
    expect(portfolio.kpis.activeProjects).toBe(1);
    expect(portfolio.kpis.ongoingWork).toBe(1);
  });

  it("counts only completions from the last 30 days", async () => {
    // Completed now → counted
    await store.createTask("biz-1", {
      id: "T-2",
      title: "Done Now",
      project: "biz-1",
      status: "done",
      work_mode: "operations",
      source: { provider: "native" }
    });

    // Completed 60 days ago → not counted
    const oldEvent = {
      timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      type: "TASK_UPDATED",
      project: "biz-1",
      details: { taskId: "T-0", patch: { status: "done" } }
    };
    await appendFile(join(tempHome, "log", "activity.jsonl"), `${JSON.stringify(oldEvent)}\n`, "utf8");

    const portfolio = await getPortfolioOverview({ root: tempHome });
    expect(portfolio.kpis.completedRecent).toBe(1);
  });
});
