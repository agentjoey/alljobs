import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBacklogDocument } from "./backlog";

describe("parseBacklogDocument", () => {
  it("parses valid code Backlog fixture", () => {
    const fixturePath = resolve(process.cwd(), "tests/fixtures/planning/code-valid/docs/BACKLOG.md");
    const content = readFileSync(fixturePath, "utf-8");
    const result = parseBacklogDocument(content, "docs/BACKLOG.md");

    expect(result.issues).toEqual([]);
    expect(result.valid.length).toBe(2);
    expect(result.valid[0].id).toBe("AJ-B-001");
    expect(result.valid[0].priority).toBe("P0");
    expect(result.valid[1].dependencies).toEqual(["AJ-B-001"]);
  });

  it("isolates malformed section while retaining valid siblings", () => {
    const fixturePath = resolve(process.cwd(), "tests/fixtures/planning/code-partial/docs/BACKLOG.md");
    const content = readFileSync(fixturePath, "utf-8");
    const result = parseBacklogDocument(content, "docs/BACKLOG.md");

    expect(result.valid.length).toBe(1);
    expect(result.valid[0].id).toBe("AJ-B-001");

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some(i => i.objectId === "AJ-B-002")).toBe(true);
  });
});
