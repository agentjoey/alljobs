import type { ProjectRegistryEntry, WorkMode } from "../domain/types";
import { computeDigest } from "../native/digest";

export interface ProposedWrite {
  path: string;
  description: string;
}

export interface ProposalMessage {
  code: string;
  message: string;
}

export interface RegistrationProposal {
  proposalDigest: string;
  project: ProjectRegistryEntry;
  inspectedRevision?: string;
  documentFingerprints: Record<string, string>;
  writes: ProposedWrite[];
  warnings: ProposalMessage[];
  blockers: ProposalMessage[];
}

export interface LifecycleProposal {
  proposalDigest: string;
  slug: string;
  action: "archive" | "restore";
  warnings: ProposalMessage[];
  blockers: ProposalMessage[];
}

export function computeProposalDigest(data: {
  project: ProjectRegistryEntry;
  inspectedRevision?: string;
  documentFingerprints: Record<string, string>;
  writes: ProposedWrite[];
  blockers: ProposalMessage[];
}): string {
  const canonicalPayload = JSON.stringify({
    project: data.project,
    inspectedRevision: data.inspectedRevision || "",
    documentFingerprints: Object.entries(data.documentFingerprints).sort(([a], [b]) => a.localeCompare(b)),
    writes: data.writes.map(w => ({ path: w.path, description: w.description })).sort((a, b) => a.path.localeCompare(b.path)),
    blockers: data.blockers.map(b => ({ code: b.code, message: b.message })).sort((a, b) => a.code.localeCompare(b.code))
  });

  return computeDigest(canonicalPayload);
}

export function computeLifecycleProposalDigest(data: {
  slug: string;
  action: "archive" | "restore";
  blockers: ProposalMessage[];
}): string {
  const canonicalPayload = JSON.stringify({
    slug: data.slug,
    action: data.action,
    blockers: data.blockers.map(b => ({ code: b.code, message: b.message })).sort((a, b) => a.code.localeCompare(b.code))
  });

  return computeDigest(canonicalPayload);
}
