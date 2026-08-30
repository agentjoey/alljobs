import type {
  BacklogItem,
  ProjectRegistryEntry,
  ProofIssue,
  RoadmapItem,
  Task
} from "../domain/types";

export interface SourceProvenance {
  provider: string;
  location: string;
  revision: string;
  digest?: string;
  fetchedAt: string;
}

export type PlanningDocumentKind = "roadmap" | "backlog";

export type DocumentTriageState =
  | "canonical"
  | "recoverable"
  | "unstructured"
  | "missing"
  | "unavailable";

export interface DocumentCandidate {
  heading: string;
  line: number;
  evidence: string;
  confidence: "recognized" | "ambiguous";
  missingCanonicalFields: string[];
}

export interface DocumentTriage {
  document: PlanningDocumentKind;
  state: DocumentTriageState;
  sourcePath: string;
  digest?: string;
  revision?: string;
  diagnostics: ProofIssue[];
  candidates: DocumentCandidate[];
}

export interface ExternalProjection {
  project: string;
  revision: string;
  fetchedAt: string;
  freshness: "fresh" | "stale" | "unavailable";
  roadmap: RoadmapItem[];
  backlog: BacklogItem[];
  tasks: Task[];
  issues: ProofIssue[];
  provenance: SourceProvenance[];
  documents: DocumentTriage[];
}

export interface PlanningSourceState {
  mode: "local-working-tree" | "remote-commit" | "cached";
  writable: boolean;
  reason?: string;
  headRevision?: string;
  roadmapDigest?: string;
  backlogDigest?: string;
  roadmapModified?: boolean;
  backlogModified?: boolean;
  readAt: string;
}

export interface ResolvedCodePlanning {
  projection: ExternalProjection;
  source: PlanningSourceState;
}

export interface PlanningProvider {
  readonly name: string;
  projectRoadmap(
    project: ProjectRegistryEntry,
    options?: { mirrorPath?: string; trustedPath?: string }
  ): Promise<ExternalProjection>;
}
