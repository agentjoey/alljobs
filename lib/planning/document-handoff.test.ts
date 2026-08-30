import { describe, expect, it } from "vitest";
import type { DocumentTriage, PlanningSourceState } from "./providers/contracts";
import { buildDocumentStandardizationHandoff } from "./document-handoff";

const localSource: PlanningSourceState = {
  mode: "local-working-tree",
  writable: false,
  headRevision: "abc123",
  readAt: "2026-08-30T00:00:00.000Z"
};

describe("buildDocumentStandardizationHandoff", () => {
  it("builds a deterministic copy-only Backlog handoff with all source evidence", () => {
    const triage: DocumentTriage = {
      document: "backlog",
      state: "recoverable",
      sourcePath: "docs/BACKLOG.md",
      digest: "backlog-digest",
      diagnostics: [
        {
          scope: "object",
          code: "INVALID_BACKLOG_ITEM_SCHEMA",
          sourcePath: "docs/BACKLOG.md",
          objectId: "AJ-B-009",
          field: "priority",
          message: "Expected P0, P1, P2, or P3."
        },
        {
          scope: "document",
          code: "GIT_CONFLICT_MARKERS",
          message: "Conflict markers are present."
        }
      ],
      candidates: [{
        heading: "Prepare release",
        line: 27,
        evidence: "## Prepare release",
        confidence: "recognized",
        missingCanonicalFields: ["id", "priority", "status", "work_mode"]
      }]
    };

    const text = buildDocumentStandardizationHandoff({
      projectSlug: "code-project",
      triage,
      source: localSource
    });

    expect(text).toContain("Project: code-project");
    expect(text).toContain("Document: docs/BACKLOG.md");
    expect(text).toContain("Source mode: local-working-tree");
    expect(text).toContain("Revision: abc123");
    expect(text).toContain("Digest: backlog-digest");
    expect(text).toContain("INVALID_BACKLOG_ITEM_SCHEMA");
    expect(text).toContain("Object: AJ-B-009");
    expect(text).toContain("Field: priority");
    expect(text).toContain("GIT_CONFLICT_MARKERS");
    expect(text).toContain("Candidate: Prepare release");
    expect(text).toContain("Line: 27");
    expect(text).toContain("Evidence: ## Prepare release");
    expect(text).toContain("Missing canonical fields: id, priority, status, work_mode");
    expect(text).toContain("# Backlog");
    expect(text).toContain("work_mode: implementation");
    expect(text).not.toContain("# Roadmap");
    expect(text).toContain("Choose stable IDs");
    expect(text).toContain("validate relations in the repository's normal review workflow");
    expect(text).toContain("AllJobs did not write, commit, push, merge, fetch, or start an agent");
    expect(text).not.toContain("Apply");
    expect(text).not.toContain("approved item");

    expect(buildDocumentStandardizationHandoff({
      projectSlug: "code-project",
      triage,
      source: localSource
    })).toBe(text);
  });

  it("uses the Roadmap template and document digest when no revision is known", () => {
    const triage: DocumentTriage = {
      document: "roadmap",
      state: "missing",
      sourcePath: "docs/ROADMAP.md",
      diagnostics: [{
        scope: "document",
        code: "PLANNING_FILE_MISSING",
        message: "Roadmap file is missing."
      }],
      candidates: []
    };
    const source: PlanningSourceState = {
      mode: "cached",
      writable: false,
      roadmapDigest: "roadmap-source-digest",
      readAt: "2026-08-30T00:00:00.000Z"
    };

    const text = buildDocumentStandardizationHandoff({
      projectSlug: "code-project",
      triage,
      source
    });

    expect(text).toContain("Revision: not available");
    expect(text).toContain("Digest: roadmap-source-digest");
    expect(text).toContain("# Roadmap");
    expect(text).toContain("order: 10");
    expect(text).not.toContain("work_mode: implementation");
  });
});
