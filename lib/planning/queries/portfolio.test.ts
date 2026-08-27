import { mkdtemp, rm } from "node:fs/promises";
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
});
