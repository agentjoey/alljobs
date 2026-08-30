import { describe, expect, it } from "vitest";
import type { ProofIssue } from "./domain/types";
import { triagePlanningDocument } from "./document-triage";

describe("triagePlanningDocument", () => {
  it("keeps a checklist candidate out of the canonical Backlog", () => {
    const result = triagePlanningDocument({
      document: "backlog",
      sourcePath: "docs/BACKLOG.md",
      content: "# Backlog\n\n- [ ] Prepare release\n",
      parserIssues: [],
      canonicalItemCount: 0
    });

    expect(result).toMatchObject({
      state: "unstructured",
      candidates: [{
        heading: "Prepare release",
        line: 3,
        evidence: "- [ ] Prepare release",
        confidence: "recognized",
        missingCanonicalFields: expect.arrayContaining(["id", "priority", "status"])
      }]
    });
  });

  it("reports every required and conditional Backlog field without inferring a phase", () => {
    const result = triagePlanningDocument({
      document: "backlog",
      sourcePath: "docs/BACKLOG.md",
      content: "# Backlog\n\n- [ ] Prepare release\n",
      parserIssues: [],
      canonicalItemCount: 0
    });

    expect(result.candidates[0]?.missingCanonicalFields).toEqual([
      "id",
      "priority",
      "status",
      "work_mode",
      "phase (required when work_mode is implementation)"
    ]);
  });

  it("reports an explicitly missing fixed planning document", () => {
    const missingIssue: ProofIssue = {
      scope: "document",
      code: "PLANNING_FILE_MISSING",
      sourcePath: "docs/ROADMAP.md",
      message: "Roadmap file is missing."
    };

    const result = triagePlanningDocument({
      document: "roadmap",
      sourcePath: "docs/ROADMAP.md",
      missing: true,
      parserIssues: [missingIssue],
      canonicalItemCount: 0
    });

    expect(result).toMatchObject({
      state: "missing",
      diagnostics: [missingIssue],
      candidates: []
    });
  });

  it("keeps a partial parser failure recoverable when a valid sibling remains", () => {
    const parserIssue: ProofIssue = {
      scope: "object",
      code: "INVALID_YAML_SECTION",
      sourcePath: "docs/BACKLOG.md",
      objectId: "bad-section",
      message: "One section is malformed."
    };

    const result = triagePlanningDocument({
      document: "backlog",
      sourcePath: "docs/BACKLOG.md",
      content: "# Backlog\n\n## Task: Retained sibling\n",
      parserIssues: [parserIssue],
      canonicalItemCount: 1
    });

    expect(result).toMatchObject({
      state: "recoverable",
      diagnostics: [parserIssue],
      candidates: [{ heading: "Task: Retained sibling", confidence: "recognized" }]
    });
  });

  it("returns canonical only for strict items without diagnostics", () => {
    const result = triagePlanningDocument({
      document: "roadmap",
      sourcePath: "docs/ROADMAP.md",
      content: "# Roadmap\n\n## Phase 1\n",
      digest: "roadmap-digest",
      revision: "abc123",
      parserIssues: [],
      canonicalItemCount: 1
    });

    expect(result).toMatchObject({
      document: "roadmap",
      state: "canonical",
      sourcePath: "docs/ROADMAP.md",
      digest: "roadmap-digest",
      revision: "abc123",
      diagnostics: [],
      candidates: []
    });
  });

  it("marks an ordinary Markdown heading as an ambiguous outline candidate", () => {
    const result = triagePlanningDocument({
      document: "roadmap",
      sourcePath: "docs/ROADMAP.md",
      content: "# Roadmap\n\n## Notes\n",
      parserIssues: [],
      canonicalItemCount: 0
    });

    expect(result).toMatchObject({
      state: "unstructured",
      candidates: [{
        heading: "Notes",
        line: 3,
        evidence: "## Notes",
        confidence: "ambiguous"
      }]
    });
  });

  it("reports every required Roadmap field for an outline candidate", () => {
    const result = triagePlanningDocument({
      document: "roadmap",
      sourcePath: "docs/ROADMAP.md",
      content: "# Roadmap\n\n## Notes\n",
      parserIssues: [],
      canonicalItemCount: 0
    });

    expect(result.candidates[0]?.missingCanonicalFields).toEqual([
      "id",
      "kind",
      "status",
      "order"
    ]);
  });

  it("represents an explicitly unavailable source without inventing a candidate", () => {
    const result = triagePlanningDocument({
      document: "backlog",
      sourcePath: "docs/BACKLOG.md",
      unavailable: true,
      parserIssues: [],
      canonicalItemCount: 0
    });

    expect(result).toMatchObject({ state: "unavailable", candidates: [] });
  });
});
