import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTasksDocument } from "./tasks";

describe("parseTasksDocument", () => {
  it("parses valid native Tasks fixture", () => {
    const fixturePath = resolve(process.cwd(), "tests/fixtures/planning/native/tasks.md");
    const content = readFileSync(fixturePath, "utf-8");
    const result = parseTasksDocument(content, "native/tasks.md", "sea-launch");

    expect(result.issues).toEqual([]);
    expect(result.valid.length).toBe(2);
    expect(result.valid[0].id).toBe("AJ-T-118");
    expect(result.valid[0].status).toBe("waiting");
    expect(result.valid[0].waiting_on).toBe("Northstar Trading");
    expect(result.valid[1].id).toBe("AJ-T-119");
    expect(result.valid[1].status).toBe("doing");
  });
});
