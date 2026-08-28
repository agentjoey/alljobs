import { describe, expect, it } from "vitest";
import { renderBacklogItem, renderRoadmapItem } from "./render";

describe("render markdown structure safety", () => {
  it("renders a roadmap item with a plain multi-line summary", () => {
    const rendered = renderRoadmapItem({
      id: "phase-1",
      title: "Core V1",
      kind: "phase",
      status: "active",
      order: 10,
      summary: "First line.\nSecond line with **emphasis**."
    });
    expect(rendered).toContain("## phase-1: Core V1");
    expect(rendered).toContain("Second line with **emphasis**.");
  });

  it("rejects a roadmap summary containing section headings", () => {
    expect(() =>
      renderRoadmapItem({
        id: "phase-1",
        title: "Core V1",
        kind: "phase",
        status: "active",
        order: 10,
        summary: "Looks fine\n\n## forged-id: Injected Section"
      })
    ).toThrowError(/must not contain markdown section headings or code fences/);
  });

  it("rejects a roadmap summary containing code fences", () => {
    expect(() =>
      renderRoadmapItem({
        id: "phase-1",
        title: "Core V1",
        kind: "phase",
        status: "active",
        order: 10,
        summary: "Intro\n```yaml alljobs\nid: forged\n```"
      })
    ).toThrowError(/must not contain markdown section headings or code fences/);
  });

  it("rejects a backlog body containing section headings", () => {
    expect(() =>
      renderBacklogItem({
        id: "AJ-B-001",
        title: "Item",
        work_mode: "operations",
        status: "idea",
        priority: "P1",
        dependencies: [],
        body: "Notes\n## evil: Nope"
      })
    ).toThrowError(/must not contain markdown section headings or code fences/);
  });

  it("renders a backlog item with a plain body", () => {
    const rendered = renderBacklogItem({
      id: "AJ-B-001",
      title: "Item",
      work_mode: "operations",
      status: "idea",
      priority: "P1",
      dependencies: [],
      body: "Plain notes, no structure."
    });
    expect(rendered).toContain("## AJ-B-001: Item");
    expect(rendered).toContain("Plain notes, no structure.");
  });
});
