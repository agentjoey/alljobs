import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseBackfillArguments } from "./caphub-automation-backfill";

it("defaults to read-only and accepts only an explicit mutation mode", () => {
  expect(parseBackfillArguments([])).toEqual({ apply: false });
  expect(parseBackfillArguments(["--dry-run"])).toEqual({ apply: false });
  expect(parseBackfillArguments(["--apply", "--resolutions", "/private/tmp/selection.json"])).toEqual({ apply: true, resolutionsPath: "/private/tmp/selection.json" });
  expect(() => parseBackfillArguments(["--resolutions", "x"])).toThrow("Usage");
  expect(() => parseBackfillArguments(["--apply", "--dry-run"])).toThrow("Usage");
});
