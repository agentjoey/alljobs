import { expect, it } from "vitest";
import { parseRetentionArgs } from "./caphub-retention";
it("requires explicit apply and defaults to no deletion", () => {
  expect(parseRetentionArgs([])).toEqual({ dryRun: true });
  expect(parseRetentionArgs(["--apply"])).toEqual({ dryRun: false });
  expect(() => parseRetentionArgs(["--apply", "--force"])).toThrow("Usage");
});
