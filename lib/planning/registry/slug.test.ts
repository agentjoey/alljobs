import { describe, expect, it } from "vitest";
import { createSlugFieldState, slugifyProjectName, updateSlugFromName, updateSlugManually } from "./slug";

describe("slugifyProjectName", () => {
  it("normalizes names into lowercase hyphenated slugs", () => {
    expect(slugifyProjectName("  AllJobs___Planning / Core!  ")).toBe("alljobs-planning-core");
  });
});

describe("project slug field state", () => {
  it("follows the project name until the slug has been edited manually", () => {
    const generated = updateSlugFromName(createSlugFieldState(), "AllJobs Planning Core");
    const manuallyEdited = updateSlugManually(generated, "alljobs-v1");

    expect(updateSlugFromName(generated, "AllJobs Registry")).toEqual({ value: "alljobs-registry", isManual: false });
    expect(updateSlugFromName(manuallyEdited, "AllJobs Registry")).toEqual({ value: "alljobs-v1", isManual: true });
  });
});
