import { expect, it } from "vitest";
import { parseWorkerArgs } from "./caphub-worker";
it("is dry-run by default and rejects ambiguous worker modes", () => {
  expect(parseWorkerArgs([])).toBe("dry-run");
  expect(parseWorkerArgs(["--once"])).toBe("once");
  expect(parseWorkerArgs(["--daemon"])).toBe("daemon");
  expect(() => parseWorkerArgs(["--once", "--daemon"])).toThrow("Usage");
});
