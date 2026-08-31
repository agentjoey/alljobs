import type { ProofIssue } from "./domain/types";
import type {
  DocumentCandidate,
  DocumentTriage,
  DocumentTriageState,
  PlanningDocumentKind
} from "./providers/contracts";

export interface TriagePlanningDocumentInput {
  document: PlanningDocumentKind;
  sourcePath: string;
  content?: string;
  digest?: string;
  revision?: string;
  parserIssues: ProofIssue[];
  canonicalItemCount: number;
  missing?: boolean;
  unavailable?: boolean;
}

const missingFieldsByDocument: Record<PlanningDocumentKind, string[]> = {
  roadmap: ["id", "kind", "status", "order"],
  backlog: [
    "id",
    "priority",
    "status",
    "work_mode",
    "phase (required when work_mode is implementation)"
  ]
};

function isDocumentTitle(heading: string, document: PlanningDocumentKind) {
  return heading.trim().toLowerCase() === document;
}

function isRecognizedHeading(heading: string, document: PlanningDocumentKind) {
  if (document === "roadmap") {
    return /^(phase|milestone)\b|^r\d+\b|^\d+(?:\.\d+)?[.)]\s+\S+/i.test(heading);
  }

  return /^(task|todo|backlog item|item)\b/i.test(heading);
}

function extractCandidates(input: Pick<TriagePlanningDocumentInput, "content" | "document">): DocumentCandidate[] {
  const candidates: DocumentCandidate[] = [];
  const lines = (input.content ?? "").split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const checklist = line.match(/^\s*-\s+\[[ xX]\]\s+(.+?)\s*$/);
    if (input.document === "backlog" && checklist) {
      candidates.push({
        heading: checklist[1],
        line: index + 1,
        evidence: line.trim(),
        confidence: "recognized",
        missingCanonicalFields: [...missingFieldsByDocument.backlog]
      });
      continue;
    }

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!heading || isDocumentTitle(heading[1], input.document)) continue;

    candidates.push({
      heading: heading[1],
      line: index + 1,
      evidence: line.trim(),
      confidence: isRecognizedHeading(heading[1], input.document) ? "recognized" : "ambiguous",
      missingCanonicalFields: [...missingFieldsByDocument[input.document]]
    });
  }

  return candidates;
}

function triageState(input: TriagePlanningDocumentInput): DocumentTriageState {
  if (input.unavailable) return "unavailable";
  if (input.missing) return "missing";
  if (input.parserIssues.length > 0) return "recoverable";
  if (input.canonicalItemCount > 0) return "canonical";
  return "unstructured";
}

export function triagePlanningDocument(input: TriagePlanningDocumentInput): DocumentTriage {
  const state = triageState(input);

  return {
    document: input.document,
    state,
    sourcePath: input.sourcePath,
    ...(input.digest ? { digest: input.digest } : {}),
    ...(input.revision ? { revision: input.revision } : {}),
    diagnostics: input.parserIssues,
    candidates: state === "canonical" || state === "missing" || state === "unavailable"
      ? []
      : extractCandidates(input)
  };
}
