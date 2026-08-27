import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBacklogDocument } from "../lib/planning/markdown/backlog";
import { parseRoadmapDocument } from "../lib/planning/markdown/roadmap";
import { parseTasksDocument } from "../lib/planning/markdown/tasks";

describe("alljobs-planning skill examples", () => {
  it("parses ROADMAP.md example cleanly", () => {
    const p = resolve(process.cwd(), "skills/alljobs-planning/examples/ROADMAP.md");
    const content = readFileSync(p, "utf8");
    const result = parseRoadmapDocument(content, "examples/ROADMAP.md", "phase");

    expect(result.issues).toEqual([]);
    expect(result.valid.length).toBe(2);
    expect(result.valid[0].id).toBe("phase-1");
  });

  it("parses BACKLOG.md example cleanly", () => {
    const p = resolve(process.cwd(), "skills/alljobs-planning/examples/BACKLOG.md");
    const content = readFileSync(p, "utf8");
    const result = parseBacklogDocument(content, "examples/BACKLOG.md");

    expect(result.issues).toEqual([]);
    expect(result.valid.length).toBe(1);
    expect(result.valid[0].id).toBe("AJ-B-001");
  });

  it("parses TASKS.md example cleanly", () => {
    const p = resolve(process.cwd(), "skills/alljobs-planning/examples/TASKS.md");
    const content = readFileSync(p, "utf8");
    const result = parseTasksDocument(content, "examples/TASKS.md", "alljobs");

    expect(result.issues).toEqual([]);
    expect(result.valid.length).toBe(1);
    expect(result.valid[0].id).toBe("AJ-T-001");
  });
});
