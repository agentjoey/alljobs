import { describe, expect, it } from "vitest";
import { diffRegistryVersions } from "./diff";

describe("Registry version diff", () => {
  it("describes a first version without exposing values", () => {
    expect(diffRegistryVersions(null, { name: "secret value" })).toEqual([
      { kind: "added", path: "$", summary: "New record" }
    ]);
  });

  it("returns deterministic field paths and value-free summaries", () => {
    const diff = diffRegistryVersions(
      { name: "before", nested: { removed: true }, list: [1] },
      { name: "after", nested: { added: true }, list: [1, 2] }
    );
    expect(diff).toEqual([
      { kind: "changed", path: "$.list", summary: "Field changed" },
      { kind: "changed", path: "$.name", summary: "Field changed" },
      { kind: "added", path: "$.nested.added", summary: "Field added" },
      { kind: "removed", path: "$.nested.removed", summary: "Field removed" }
    ]);
    expect(JSON.stringify(diff)).not.toMatch(/before|after/);
  });
});
