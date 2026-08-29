import { describe, expect, it } from "vitest";
import { parseBacklogItem } from "../domain/schemas";
import type { BacklogItem } from "../domain/types";
import {
  analyzeBacklogOrdering,
  initializeBacklogOrdering,
  planBacklogOrderingChange
} from "./ordering";

function item(overrides: Partial<BacklogItem> & Pick<BacklogItem, "id">): BacklogItem {
  return parseBacklogItem({
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    work_mode: "implementation",
    phase: overrides.phase ?? "phase-1",
    status: overrides.status ?? "ready",
    priority: overrides.priority ?? "P1",
    rank: overrides.rank,
    dependencies: overrides.dependencies ?? []
  });
}

describe("Backlog ordering", () => {
  it("detects legacy unranked active items while excluding history", () => {
    const result = analyzeBacklogOrdering([
      item({ id: "AJ-B-001" }),
      item({ id: "AJ-B-002", status: "done" })
    ]);

    expect(result).toEqual({ state: "uninitialized", missingIds: ["AJ-B-001"], conflictingIds: [] });
  });

  it("detects duplicate ranks only within an active Phase + Priority lane", () => {
    const result = analyzeBacklogOrdering([
      item({ id: "AJ-B-001", rank: 100 }),
      item({ id: "AJ-B-002", rank: 100 }),
      item({ id: "AJ-B-003", rank: 100, priority: "P0" }),
      item({ id: "AJ-B-004", rank: 100, status: "cancelled" })
    ]);

    expect(result).toEqual({ state: "repair-required", missingIds: [], conflictingIds: ["AJ-B-001", "AJ-B-002"] });
  });

  it("initializes active items in source order at 100-point intervals by lane", () => {
    const changes = initializeBacklogOrdering([
      item({ id: "AJ-B-001", priority: "P1" }),
      item({ id: "AJ-B-002", priority: "P0" }),
      item({ id: "AJ-B-003", priority: "P1" }),
      item({ id: "AJ-B-004", priority: "P1", status: "done" })
    ]);

    expect(changes).toEqual([
      { itemId: "AJ-B-001", priority: "P1", rank: 100 },
      { itemId: "AJ-B-002", priority: "P0", rank: 100 },
      { itemId: "AJ-B-003", priority: "P1", rank: 200 }
    ]);
  });

  it("allows a priority-only change before rank initialization", () => {
    expect(planBacklogOrderingChange([item({ id: "AJ-B-001" })], {
      kind: "change-priority", itemId: "AJ-B-001", targetPriority: "P0"
    })).toEqual({ ok: true, changes: [{ itemId: "AJ-B-001", priority: "P0" }], renumbered: false });
  });

  it("assigns a midpoint for a move within a rank gap without changing other ranks", () => {
    const items = [
      item({ id: "AJ-B-001", rank: 100 }),
      item({ id: "AJ-B-002", rank: 300 }),
      item({ id: "AJ-B-003", rank: 500 })
    ];

    expect(planBacklogOrderingChange(items, {
      kind: "move", itemId: "AJ-B-003", targetPriority: "P1", beforeId: "AJ-B-002"
    })).toEqual({ ok: true, changes: [{ itemId: "AJ-B-003", priority: "P1", rank: 200 }], renumbered: false });
  });

  it("moves across priority lanes without compacting the source lane", () => {
    const items = [
      item({ id: "AJ-B-001", priority: "P0", rank: 100 }),
      item({ id: "AJ-B-002", priority: "P0", rank: 200 }),
      item({ id: "AJ-B-003", priority: "P1", rank: 100 })
    ];

    expect(planBacklogOrderingChange(items, {
      kind: "change-priority", itemId: "AJ-B-003", targetPriority: "P0"
    })).toEqual({ ok: true, changes: [{ itemId: "AJ-B-003", priority: "P0", rank: 300 }], renumbered: false });
  });

  it("renumbers only a crowded target lane", () => {
    const items = [
      item({ id: "AJ-B-001", priority: "P0", rank: 100 }),
      item({ id: "AJ-B-002", priority: "P0", rank: 101 }),
      item({ id: "AJ-B-003", priority: "P1", rank: 100 })
    ];

    expect(planBacklogOrderingChange(items, {
      kind: "move", itemId: "AJ-B-003", targetPriority: "P0", afterId: "AJ-B-001", beforeId: "AJ-B-002"
    })).toEqual({
      ok: true,
      changes: [
        { itemId: "AJ-B-001", priority: "P0", rank: 100 },
        { itemId: "AJ-B-003", priority: "P0", rank: 200 },
        { itemId: "AJ-B-002", priority: "P0", rank: 300 }
      ],
      renumbered: true
    });
  });

  it("rejects a target neighbour from a different Phase", () => {
    const result = planBacklogOrderingChange([
      item({ id: "AJ-B-001", rank: 100, phase: "phase-1" }),
      item({ id: "AJ-B-002", rank: 100, phase: "phase-2" })
    ], {
      kind: "move", itemId: "AJ-B-001", targetPriority: "P1", beforeId: "AJ-B-002"
    });

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("repairs a selected lane without changing other lanes", () => {
    const result = planBacklogOrderingChange([
      item({ id: "AJ-B-001", rank: 100 }),
      item({ id: "AJ-B-002", rank: 100 }),
      item({ id: "AJ-B-003", priority: "P0", rank: 100 })
    ], { kind: "repair", phase: "phase-1", priority: "P1" });

    expect(result).toEqual({
      ok: true,
      changes: [
        { itemId: "AJ-B-001", priority: "P1", rank: 100 },
        { itemId: "AJ-B-002", priority: "P1", rank: 200 }
      ],
      renumbered: true
    });
  });
});
