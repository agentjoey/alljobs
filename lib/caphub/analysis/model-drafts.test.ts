import { describe, expect, it } from "vitest";
import {
  assessmentDraftSchema,
  criticDraftSchema,
  researchDraftSchema
} from "./model-drafts";

describe("model-owned analysis drafts", () => {
  it("excludes host-owned identity, evidence, lineage, and timestamp fields", () => {
    expect(researchDraftSchema.keyof().options).not.toEqual(expect.arrayContaining([
      "schema_version", "capture_id", "extraction_artifact_id", "evidence", "researched_at"
    ]));
    expect(assessmentDraftSchema.keyof().options).not.toEqual(expect.arrayContaining([
      "schema_version", "capture_id", "dossier_artifact_id", "assessed_at"
    ]));
    expect(criticDraftSchema.keyof().options).not.toEqual(expect.arrayContaining([
      "schema_version", "capture_id", "assessment_artifact_id", "reviewed_at"
    ]));
  });
});
