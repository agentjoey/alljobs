import { describe, expect, it } from "vitest";
import { validateProjectRelations } from "./domain/relations";
import { parseBacklogDocument } from "./markdown/backlog";
import { parseRoadmapDocument } from "./markdown/roadmap";
import type { DocumentTriage, PlanningSourceState } from "./providers/contracts";
import { buildDocumentStandardizationHandoff } from "./document-handoff";

const localSource: PlanningSourceState = {
  mode: "local-working-tree",
  writable: false,
  headRevision: "abc123",
  readAt: "2026-08-30T00:00:00.000Z"
};

function extractCanonicalTemplate(handoff: string, sourcePath: string) {
  const marker = `Canonical template for ${sourcePath}:\n`;
  const start = handoff.indexOf(marker);
  const end = handoff.indexOf("\n\nRepository-agent validation:", start);
  if (start < 0 || end < 0) throw new Error(`Canonical template not found for ${sourcePath}`);
  return handoff.slice(start + marker.length, end);
}

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

  it("emits templates whose stable IDs and implementation phase relation pass strict validation", () => {
    const roadmapPath = "docs/ROADMAP.md";
    const backlogPath = "docs/BACKLOG.md";
    const roadmapHandoff = buildDocumentStandardizationHandoff({
      projectSlug: "code-project",
      triage: {
        document: "roadmap",
        state: "missing",
        sourcePath: roadmapPath,
        diagnostics: [{
          scope: "document",
          code: "PLANNING_FILE_MISSING",
          message: "Roadmap file is missing."
        }],
        candidates: []
      },
      source: localSource
    });
    const backlogHandoff = buildDocumentStandardizationHandoff({
      projectSlug: "code-project",
      triage: {
        document: "backlog",
        state: "missing",
        sourcePath: backlogPath,
        diagnostics: [{
          scope: "document",
          code: "PLANNING_FILE_MISSING",
          message: "Backlog file is missing."
        }],
        candidates: []
      },
      source: localSource
    });
    const roadmap = parseRoadmapDocument(
      extractCanonicalTemplate(roadmapHandoff, roadmapPath),
      roadmapPath,
      "phase"
    );
    const backlog = parseBacklogDocument(
      extractCanonicalTemplate(backlogHandoff, backlogPath),
      backlogPath
    );

    expect(roadmap.issues).toEqual([]);
    expect(roadmap.valid).toEqual([
      expect.objectContaining({ id: "phase-1", title: "Outcome title" })
    ]);
    expect(backlog.issues).toEqual([]);
    expect(backlog.valid).toEqual([
      expect.objectContaining({
        id: "PROJECT-BL-001",
        title: "Outcome title",
        work_mode: "implementation",
        phase: "phase-1"
      })
    ]);

    const relations = validateProjectRelations({
      project: {
        slug: "code-project",
        name: "Code Project",
        type: "code",
        work_modes: ["implementation"],
        execution_locations: [],
        archived: false
      },
      roadmapItems: roadmap.valid,
      backlogItems: backlog.valid,
      tasks: [],
      sourcePath: "repository-agent-handoff"
    });

    expect(relations.issues).toEqual([]);
    expect(relations.valid[0]).toMatchObject({
      roadmapItems: [{ id: "phase-1" }],
      backlogItems: [{ id: "PROJECT-BL-001", phase: "phase-1" }]
    });
  });
});
