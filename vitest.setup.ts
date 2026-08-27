import "@testing-library/jest-dom/vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.ALLJOBS_DATA_ROOT) {
  const tempDir = mkdtempSync(join(tmpdir(), "alljobs-vitest-"));
  process.env.ALLJOBS_DATA_ROOT = tempDir;
  process.env.ALLJOBS_HOME = tempDir;
}
