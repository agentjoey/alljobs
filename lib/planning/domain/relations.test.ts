import { describe, expect, it } from "vitest";
import { validateProjectRelations } from "./relations";
import type { ProjectRegistryEntry } from "./types";

const codeProject: ProjectRegistryEntry = {
  slug: "alljobs",
  name: "AllJobs",
  type: "code",
  work_modes: ["implementation", "operations"],
  execution_locations: [],
  archived: false
};

const businessProject: ProjectRegistryEntry = {
  slug: "sea-launch",
  name: "SEA Launch",
  type: "business",
  work_modes: ["operations"],
  execution_locations: [],
  archived: false
};

describe("validateProjectRelations", () => {
  it("validates healthy code project relations", () => {
    const result = validateProjectRelations({
      project: codeProject,
      roadmapItems: [
        { id: "phase-1", title: "Core", kind: "phase", status: "active", order: 10, focus: "primary" },
        { id: "phase-2", title: "Scale", kind: "phase", status: "planned", order: 20 }
      ],
      backlogItems: [
        { id: "AJ-B-1", title: "Parser", work_mode: "implementation", phase: "phase-1", status: "ready", priority: "P0", dependencies: [] },
        { id: "AJ-B-2", title: "Store", work_mode: "implementation", phase: "phase-1", status: "ready", priority: "P1", dependencies: ["AJ-B-1"] }
      ],
      tasks: [
        { id: "AJ-T-1", title: "Implement parser", project: "alljobs", status: "doing", backlog: "AJ-B-1", source: { provider: "native" } }
      ]
    });

    expect(result.issues).toEqual([]);
    expect(result.valid[0].roadmapItems.length).toBe(2);
    expect(result.valid[0].backlogItems.length).toBe(2);
    expect(result.valid[0].tasks.length).toBe(1);
  });

  it("detects duplicate roadmap order", () => {
    const result = validateProjectRelations({
      project: codeProject,
      roadmapItems: [
        { id: "p1", title: "Phase 1", kind: "phase", status: "active", order: 10 },
        { id: "p2", title: "Phase 2", kind: "phase", status: "planned", order: 10 }
      ],
      backlogItems: [],
      tasks: []
    });

    expect(result.issues.some(i => i.code === "DUPLICATE_ROADMAP_ORDER")).toBe(true);
  });

  it("detects multiple primary focus items", () => {
    const result = validateProjectRelations({
      project: codeProject,
      roadmapItems: [
        { id: "p1", title: "Phase 1", kind: "phase", status: "active", order: 10, focus: "primary" },
        { id: "p2", title: "Phase 2", kind: "phase", status: "active", order: 20, focus: "primary" }
      ],
      backlogItems: [],
      tasks: []
    });

    expect(result.issues.some(i => i.code === "MULTIPLE_PRIMARY_FOCUS")).toBe(true);
  });

  it("rejects backlog items in business project", () => {
    const result = validateProjectRelations({
      project: businessProject,
      roadmapItems: [
        { id: "m1", title: "Milestone 1", kind: "milestone", status: "active", order: 10 }
      ],
      backlogItems: [
        { id: "BL-1", title: "Illegal Backlog", work_mode: "operations", status: "idea", priority: "P1", dependencies: [] }
      ],
      tasks: []
    });

    expect(result.issues.some(i => i.code === "BUSINESS_BACKLOG_REJECTED")).toBe(true);
  });

  it("detects missing phase reference in backlog item", () => {
    const result = validateProjectRelations({
      project: codeProject,
      roadmapItems: [
        { id: "phase-1", title: "Phase 1", kind: "phase", status: "active", order: 10 }
      ],
      backlogItems: [
        { id: "AJ-B-1", title: "Orphaned", work_mode: "implementation", phase: "phase-nonexistent", status: "ready", priority: "P0", dependencies: [] }
      ],
      tasks: []
    });

    expect(result.issues.some(i => i.code === "MISSING_PHASE_REFERENCE")).toBe(true);
  });

  it("detects self-dependency and dependency cycle in backlog", () => {
    const selfDepResult = validateProjectRelations({
      project: codeProject,
      roadmapItems: [{ id: "p1", title: "P1", kind: "phase", status: "active", order: 10 }],
      backlogItems: [
        { id: "B1", title: "Self", work_mode: "implementation", phase: "p1", status: "ready", priority: "P0", dependencies: ["B1"] }
      ],
      tasks: []
    });
    expect(selfDepResult.issues.some(i => i.code === "SELF_DEPENDENCY")).toBe(true);

    const cycleResult = validateProjectRelations({
      project: codeProject,
      roadmapItems: [{ id: "p1", title: "P1", kind: "phase", status: "active", order: 10 }],
      backlogItems: [
        { id: "B1", title: "Item 1", work_mode: "implementation", phase: "p1", status: "ready", priority: "P0", dependencies: ["B2"] },
        { id: "B2", title: "Item 2", work_mode: "implementation", phase: "p1", status: "ready", priority: "P0", dependencies: ["B1"] }
      ],
      tasks: []
    });
    expect(cycleResult.issues.some(i => i.code === "DEPENDENCY_CYCLE")).toBe(true);
  });

  it("detects missing task backlog and roadmap targets", () => {
    const result = validateProjectRelations({
      project: codeProject,
      roadmapItems: [{ id: "p1", title: "P1", kind: "phase", status: "active", order: 10 }],
      backlogItems: [{ id: "B1", title: "B1", work_mode: "implementation", phase: "p1", status: "ready", priority: "P0", dependencies: [] }],
      tasks: [
        { id: "T1", title: "T1", project: "alljobs", status: "todo", backlog: "B-MISSING", source: { provider: "native" } },
        { id: "T2", title: "T2", project: "alljobs", status: "todo", roadmap_item: "P-MISSING", source: { provider: "native" } }
      ]
    });

    expect(result.issues.some(i => i.code === "MISSING_TASK_BACKLOG_TARGET")).toBe(true);
    expect(result.issues.some(i => i.code === "MISSING_TASK_ROADMAP_TARGET")).toBe(true);
  });

  it("filters valid objects by (collection, id), not id alone (L4)", () => {
    const result = validateProjectRelations({
      project: codeProject,
      roadmapItems: [{ id: "T1", title: "Phase One", kind: "phase", status: "active", order: 10 }],
      backlogItems: [],
      tasks: [
        // Task issue with objectId equal to the roadmap item's id must not
        // exclude that roadmap item from the valid set
        { id: "T1", title: "Broken task", project: "alljobs", status: "todo", roadmap_item: "P-MISSING", source: { provider: "native" } }
      ]
    });

    expect(result.issues.some(i => i.code === "MISSING_TASK_ROADMAP_TARGET")).toBe(true);
    expect(result.valid[0].roadmapItems.length).toBe(1);
    expect(result.valid[0].roadmapItems[0].id).toBe("T1");
    expect(result.valid[0].tasks.length).toBe(0);
  });
});
