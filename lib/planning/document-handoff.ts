import type {
  DocumentTriage,
  PlanningDocumentKind,
  PlanningSourceState
} from "./providers/contracts";

const canonicalTemplates: Record<PlanningDocumentKind, string> = {
  roadmap: `# Roadmap

## phase-1: Outcome title

\`\`\`yaml alljobs
kind: phase
status: planned
order: 10
\`\`\`

Describe the outcome and its role in the project Roadmap.`,
  backlog: `# Backlog

## PROJECT-BL-001: Outcome title

\`\`\`yaml alljobs
work_mode: implementation
phase: phase-1
status: ready
priority: P1
owner: joey
dependencies: []
\`\`\`

### Problem

Describe the problem or required outcome.

### Done When

- [ ] Add an owner-verifiable completion condition.`
};

function sourceDigest(triage: DocumentTriage, source: PlanningSourceState) {
  if (triage.digest) return triage.digest;
  return triage.document === "roadmap" ? source.roadmapDigest : source.backlogDigest;
}

export function buildDocumentStandardizationHandoff(input: {
  projectSlug: string;
  triage: DocumentTriage;
  source: PlanningSourceState;
}): string {
  const { projectSlug, triage, source } = input;
  const lines = [
    "Repository-agent document standardization handoff — review required",
    `Project: ${projectSlug}`,
    `Document: ${triage.sourcePath}`,
    `Document state: ${triage.state}`,
    `Source mode: ${source.mode}`,
    `Revision: ${triage.revision ?? source.headRevision ?? "not available"}`,
    `Digest: ${sourceDigest(triage, source) ?? "not available"}`,
    `Read at: ${source.readAt}`,
    "",
    "Diagnostics:"
  ];

  if (triage.diagnostics.length === 0) {
    lines.push("- None reported.");
  } else {
    triage.diagnostics.forEach((diagnostic, index) => {
      lines.push(
        `- Diagnostic ${index + 1}: ${diagnostic.code}`,
        `  Scope: ${diagnostic.scope}`,
        `  Source path: ${diagnostic.sourcePath ?? triage.sourcePath}`
      );
      if (diagnostic.objectId) lines.push(`  Object: ${diagnostic.objectId}`);
      if (diagnostic.field) lines.push(`  Field: ${diagnostic.field}`);
      lines.push(`  Message: ${diagnostic.message}`);
    });
  }

  lines.push("", "Candidate evidence (not canonical planning data):");
  if (triage.candidates.length === 0) {
    lines.push("- None detected.");
  } else {
    triage.candidates.forEach((candidate, index) => {
      lines.push(
        `- Candidate ${index + 1}`,
        `  Candidate: ${candidate.heading}`,
        `  Line: ${candidate.line}`,
        `  Evidence: ${candidate.evidence}`,
        `  Confidence: ${candidate.confidence}`,
        `  Missing canonical fields: ${candidate.missingCanonicalFields.length > 0
          ? candidate.missingCanonicalFields.join(", ")
          : "none reported"}`
      );
    });
  }

  lines.push(
    "",
    `Canonical template for ${triage.sourcePath}:`,
    canonicalTemplates[triage.document],
    "",
    "Repository-agent validation:",
    "- Choose stable IDs, preserve source meaning, and validate relations in the repository's normal review workflow.",
    "- Re-run the repository's strict planning parser and review every diagnostic before proposing a repository change.",
    "- Treat all candidates above as evidence requiring repository-owner review.",
    "",
    "AllJobs did not write, commit, push, merge, fetch, or start an agent."
  );

  return `${lines.join("\n")}\n`;
}
