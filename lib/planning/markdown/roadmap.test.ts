import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRoadmapDocument } from "./roadmap";

describe("parseRoadmapDocument", () => {
  it("parses valid code Roadmap fixture", () => {
    const fixturePath = resolve(process.cwd(), "tests/fixtures/planning/code-valid/docs/ROADMAP.md");
    const content = readFileSync(fixturePath, "utf-8");
    const result = parseRoadmapDocument(content, "docs/ROADMAP.md", "phase");

    expect(result.issues).toEqual([]);
    expect(result.valid.length).toBe(2);
    expect(result.valid[0].id).toBe("phase-1");
    expect(result.valid[0].focus).toBe("primary");
    expect(result.valid[1].id).toBe("phase-2");
  });

  it("parses native business Roadmap fixture", () => {
    const fixturePath = resolve(process.cwd(), "tests/fixtures/planning/native/roadmap.md");
    const content = readFileSync(fixturePath, "utf-8");
    const result = parseRoadmapDocument(content, "native/roadmap.md", "milestone");

    expect(result.issues).toEqual([]);
    expect(result.valid.length).toBe(2);
    expect(result.valid[0].kind).toBe("milestone");
    expect(result.valid[0].status).toBe("done");
  });
});
