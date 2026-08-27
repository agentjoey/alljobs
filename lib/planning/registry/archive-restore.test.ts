import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ControlHostConfig } from "../config";
import { NativePlanningStore } from "../native/store";
import { applyArchive, proposeArchive } from "./archive";
import { applyRestore, proposeRestore } from "./restore";

describe("archive and restore state machine", () => {
  let tempHome: string;
  let store: NativePlanningStore;
  const config: ControlHostConfig = {
    trustedCodeRoots: ["/tmp"],
    refreshIntervalSeconds: 300
  };

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
  });

  afterEach(async () => {
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
  });

  it("proposes and applies project archive", async () => {
    const proposal = await proposeArchive("biz-project", store);
    expect(proposal.blockers).toEqual([]);
    expect(proposal.proposalDigest).toBeDefined();

    const result = await applyArchive("biz-project", proposal.proposalDigest, store, tempHome);
    expect(result.ok).toBe(true);

    const project = await store.getProject("biz-project");
    expect(project?.archived).toBe(true);
  });

  it("proposes and applies project restore", async () => {
    // Archive first
    const archiveProp = await proposeArchive("biz-project", store);
    await applyArchive("biz-project", archiveProp.proposalDigest, store, tempHome);

    // Propose restore
    const restoreProp = await proposeRestore("biz-project", store, config);
    expect(restoreProp.blockers).toEqual([]);

    const restoreResult = await applyRestore("biz-project", restoreProp.proposalDigest, {
      store,
      config,
      root: tempHome
    });
    expect(restoreResult.ok).toBe(true);

    const project = await store.getProject("biz-project");
    expect(project?.archived).toBe(false);
  });
});
