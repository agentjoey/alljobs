import { describe, expect, it } from "vitest";
import { patchBacklogFields } from "./patcher";

const source = [
  "# Backlog",
  "",
  "## AJ-B-001: Preserve every byte",
  "",
  "```yaml alljobs",
  "id: AJ-B-001",
  "work_mode: implementation",
  "phase: phase-1",
  "status: ready",
  "priority: \"P0\" # owner-set",
  "dependencies: []",
  "```",
  "",
  "Unicode body: 你好，preserve me exactly.",
  "",
  "## AJ-B-002: Unchanged neighbour",
  "",
  "```yaml alljobs",
  "id: AJ-B-002",
  "work_mode: implementation",
  "phase: phase-1",
  "status: ready",
  "priority: P1",
  "rank: 200",
  "dependencies: []",
  "```",
  "",
  "Second body."
].join("\r\n") + "\r\n";

describe("patchBacklogFields", () => {
  it("replaces only the quoted priority scalar and inserts a CRLF rank after its line", () => {
    const result = patchBacklogFields(source, [
      { itemId: "AJ-B-001", priority: "P1", rank: 150 }
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain('priority: "P1" # owner-set');
    expect(result.content).toContain("rank: 150\r\n");
    expect(result.content.replace('priority: "P1"', 'priority: "P0"').replace("rank: 150\r\n", ""))
      .toBe(source);
    expect(result.changes).toEqual([{ itemId: "AJ-B-001", priority: "P1", rank: 150 }]);
    expect(result.ranges).toHaveLength(2);
  });

  it("updates an existing rank without disturbing a neighbouring section", () => {
    const result = patchBacklogFields(source, [
      { itemId: "AJ-B-002", priority: "P0", rank: 125 }
    ]);

    expect(result).toMatchObject({ ok: true, changes: [{ itemId: "AJ-B-002", priority: "P0", rank: 125 }] });
    if (!result.ok) return;
    expect(result.content).toContain("priority: P0\r\nrank: 125\r\n");
    expect(result.content).toContain("Unicode body: 你好，preserve me exactly.\r\n");
  });

  it("permits a priority-only patch without rewriting an existing rank", () => {
    const result = patchBacklogFields(source, [{ itemId: "AJ-B-002", priority: "P2" }]);

    expect(result).toMatchObject({ ok: true, changes: [{ itemId: "AJ-B-002", priority: "P2" }] });
    if (!result.ok) return;
    expect(result.content).toContain("priority: P2\r\nrank: 200\r\n");
  });

  it.each([
    ["duplicate keys", source.replace('priority: "P0" # owner-set', 'priority: P2\r\npriority: "P0" # owner-set')],
    ["flow map", source.replace("id: AJ-B-001", "{ id: AJ-B-001, priority: P0 }")],
    ["anchor", source.replace('priority: "P0" # owner-set', "priority: &primary P0")],
    ["alias", source.replace('priority: "P0" # owner-set', "priority: *primary")],
    ["merge key", source.replace('priority: "P0" # owner-set', "<<: { priority: P0 }")],
    ["multiline priority", source.replace('priority: "P0" # owner-set', "priority: |\r\n  P0")],
    ["conflict marker", source.replace("Unicode body", "<<<<<<< HEAD\r\nUnicode body")]
  ])("fails closed for %s", (_label, unsafeSource) => {
    expect(patchBacklogFields(unsafeSource, [{ itemId: "AJ-B-001", priority: "P1", rank: 150 }])).toMatchObject({ ok: false });
  });

  it("rejects duplicate section IDs, missing targets, and runtime fields outside priority/rank", () => {
    expect(patchBacklogFields(source.replace("AJ-B-002: Unchanged neighbour", "AJ-B-001: Duplicate"), [
      { itemId: "AJ-B-001", priority: "P1" }
    ])).toMatchObject({ ok: false, code: "INVALID_BACKLOG" });
    expect(patchBacklogFields(source, [{ itemId: "AJ-B-404", priority: "P1" }])).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(patchBacklogFields(source, [{ itemId: "AJ-B-001", priority: "P1", title: "unsafe" } as any]))
      .toMatchObject({ ok: false, code: "FIELD_NOT_PATCHABLE" });
  });
});
