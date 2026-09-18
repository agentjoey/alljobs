import { expect, it } from "vitest";
import { selectCanonicalCaptures, resolveBackfillConflicts } from "./backfill";

it("prefers imported evidence over a newer duplicate and surfaces different-content conflicts", () => {
  const a = { id: "old", filename: "X.PNG", digest: "a", createdAt: "2026-09-01", priority: 3 };
  const result = selectCanonicalCaptures([a, { ...a, id: "new", priority: 0, createdAt: "2026-09-18" },
    { ...a, id: "other", filename: "Y.PNG" }, { ...a, id: "conflict", filename: "Y.PNG", digest: "b" }]);
  expect(result.ready).toHaveLength(1);
  expect(result.ready[0].canonical.id).toBe("old");
  expect(result.ready[0].members).toHaveLength(2);
  expect(result.conflicts[0].filenameKey).toBe("y.png");
});

it("binds human selection to the exact conflict group and preserves different contents as versions", () => {
  const a = { id: "old", filename: "X.PNG", digest: "a", createdAt: "2026-09-01", priority: 0 };
  const report = selectCanonicalCaptures([a, { ...a, id: "new", digest: "b" }]);
  const resolution = { filenameKey: "x.png", expectedGroupDigest: report.conflicts[0].groupDigest, currentCaptureId: "old" };
  expect(resolveBackfillConflicts(report, [resolution]).ready.map(row => row.canonical.id)).toEqual(["new", "old"]);
  expect(() => resolveBackfillConflicts(report, [{ ...resolution, expectedGroupDigest: "stale" }])).toThrow("BACKFILL_CONFLICT_STALE");
  expect(() => resolveBackfillConflicts(report, [{ ...resolution, currentCaptureId: "missing" }])).toThrow("BACKFILL_SELECTION_INVALID");
});
