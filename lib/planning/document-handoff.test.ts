import { describe, expect, it } from "vitest";
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
  it("uses the Roadmap template and document digest when no revision is known", () => {
    const triage: DocumentTriage & { document: "roadmap" } = {
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

  it("emits a Roadmap template whose stable ID passes strict parsing", () => {
    const roadmapPath = "docs/ROADMAP.md";
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
    const roadmap = parseRoadmapDocument(
      extractCanonicalTemplate(roadmapHandoff, roadmapPath),
      roadmapPath,
      "phase"
    );

    expect(roadmap.issues).toEqual([]);
    expect(roadmap.valid).toEqual([
      expect.objectContaining({ id: "phase-1", title: "Outcome title" })
    ]);
  });
});
