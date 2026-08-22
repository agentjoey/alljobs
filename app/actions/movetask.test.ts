import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { moveTask } from "./movetask";

const originalDataDir = process.env.ALLJOBS_DATA_DIR;

describe("moveTask", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "alljobs-movetask-"));
    mkdirSync(join(dataDir, "tasks"), { recursive: true });
    mkdirSync(join(dataDir, "projects"), { recursive: true });
    writeFileSync(
      join(dataDir, "tasks", "alljobs.md"),
      "---\nproject: alljobs\n---\n\n- [ ] todo task\n- [/] doing task\n- [x] done task\n",
      "utf8",
    );
    // moveTask 校验 slug 对应真实项目（与 appendLogEntry 同一口径），需要该文件存在
    writeFileSync(join(dataDir, "projects", "alljobs.md"), "---\ntitle: AllJobs\nstatus: active\n---\n", "utf8");
    process.env.ALLJOBS_DATA_DIR = dataDir;
    vi.mocked(revalidatePath).mockClear();
  });

  afterEach(() => {
    process.env.ALLJOBS_DATA_DIR = originalDataDir;
  });

  function form(slug: string, line: number, newStatus: string) {
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("line", String(line));
    fd.set("newStatus", newStatus);
    return fd;
  }

  test("moves todo to doing", async () => {
    const result = await moveTask({ status: "idle" }, form("alljobs", 5, "doing"));
    expect(result.status).toBe("success");
    const content = readFileSync(join(dataDir, "tasks", "alljobs.md"), "utf8");
    expect(content).toContain("- [/] todo task");
  });

  test("moves doing to done", async () => {
    const result = await moveTask({ status: "idle" }, form("alljobs", 6, "done"));
    expect(result.status).toBe("success");
    const content = readFileSync(join(dataDir, "tasks", "alljobs.md"), "utf8");
    expect(content).toContain("- [x] doing task");
  });

  test("validation rejects bad status", async () => {
    const result = await moveTask({ status: "idle" }, form("alljobs", 4, "nope"));
    expect(result.status).toBe("validation");
  });

  test("validation rejects out of range line", async () => {
    const result = await moveTask({ status: "idle" }, form("alljobs", 99, "done"));
    expect(result.status).toBe("validation");
  });

  test("validation rejects slug with no matching project (incl. path traversal)", async () => {
    const result = await moveTask({ status: "idle" }, form("../../etc/passwd", 1, "done"));
    expect(result.status).toBe("validation");
  });

  test("validation rejects well-formed slug with no project file", async () => {
    const result = await moveTask({ status: "idle" }, form("no-such-project", 1, "done"));
    expect(result.status).toBe("validation");
  });
});
