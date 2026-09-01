import { backlogProposalSchema, type BacklogProposal } from "./contracts";
import { assistantDigest } from "./digest";

export function buildAssistantBacklogHandoff(input: BacklogProposal): string {
  const proposal = backlogProposalSchema.parse(input);
  const { proposal_digest, ...unsigned } = proposal;
  if (assistantDigest(unsigned) !== proposal_digest) throw new Error("Proposal digest mismatch");
  return [
    "# Repository-agent Backlog handoff",
    "", "AllJobs did not edit docs/BACKLOG.md. This is a copy-only proposal.", "",
    `Suggested title: ${proposal.suggested_title}`,
    `Problem: ${proposal.problem}`,
    `Desired outcome: ${proposal.desired_outcome}`,
    `Done When: ${proposal.done_when}`,
    proposal.suggested_phase ? `Suggested phase: ${proposal.suggested_phase}` : "",
    proposal.suggested_priority ? `Suggested priority: ${proposal.suggested_priority}` : "",
    proposal.suggested_work_mode ? `Suggested work mode: ${proposal.suggested_work_mode}` : "",
    `Dependencies: ${proposal.suggested_dependencies.join(", ") || "None"}`,
    `Evidence: ${proposal.evidence.join("; ") || "None"}`,
    `Assumptions: ${proposal.assumptions.join("; ") || "None"}`,
    `Unknowns: ${proposal.unknowns.join("; ") || "None"}`,
    `Questions: ${proposal.questions.join("; ") || "None"}`,
    `Citations: ${proposal.citation_source_ids.join(", ") || "None"}`,
    "", "Repository-agent instructions: Inspect current code and architecture before applying this proposal. Re-read current planning truth and preserve repository ownership.",
    "", `Model: ${proposal.model}`, `Mode: ${proposal.mode}`, `Generated at: ${proposal.generated_at}`, `Manifest digest: ${proposal.manifest_digest}`, `Proposal digest: ${proposal.proposal_digest}`
  ].filter(Boolean).join("\n");
}
